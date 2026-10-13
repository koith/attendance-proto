-- Synchronize remaining retirement/substitution effective attendance consumers.
-- Earlier legacy corrections are UTC-compatible; newer manager corrections are KST.
-- Preserve existing rows, PIN permissions, function signatures, access controls and data.
-- VOID_ADD-marked fallback OUT must not be revived as a current state.
CREATE OR REPLACE FUNCTION public.admin_retire_employee(p_id bigint, p_ended_on date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_period_id bigint;
  v_start date;
  v_last_type text;
  v_retired_at timestamp := clock_timestamp() at time zone 'UTC';
  v_auto_checkout boolean := false;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_ended_on is null then return jsonb_build_object('ok',false,'error','END_DATE_REQUIRED'); end if;
  if not exists(select 1 from public.employees where id=p_id) then
    return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_id::text));

  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,created_at
    from public.event_corrections
    where event_id is not null and employee_id=p_id
    order by event_id,created_at desc,id desc
  ), eff as (
    select e.id::numeric ord,
           case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
           case when c.action='EDIT_TIME' and c.new_event_at is not null then public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) else e.event_at end at
    from public.attendance_events e
    left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_id and coalesce(c.action,'')<>'VOID'
    union all
    select (1000000000000000::numeric+c.id),c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at)
    from public.event_corrections c
    where c.employee_id=p_id and c.action='ADD'
      and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%'
  )
  select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;

  if v_last_type='IN' then
    insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id)
    values(p_id,'OUT',v_retired_at,v_retired_at,'ADMIN_RETIRE');
    v_auto_checkout := true;
  end if;

  select id,started_on into v_period_id,v_start
  from public.employment_periods
  where employee_id=p_id and ended_on is null
  order by started_on desc,id desc limit 1;

  if v_period_id is not null then
    if p_ended_on < v_start then return jsonb_build_object('ok',false,'error','BAD_END_DATE'); end if;
    update public.employment_periods set ended_on=p_ended_on,updated_at=now()
    where id=v_period_id;
    update public.employment_contracts
      set effective_to=least(coalesce(effective_to,p_ended_on),p_ended_on),updated_at=now()
      where employment_period_id=v_period_id and effective_from<=p_ended_on
        and (effective_to is null or effective_to>p_ended_on);
  end if;

  update public.employees set is_active=false where id=p_id;
  return jsonb_build_object('ok',true,'employee_id',p_id,'ended_on',p_ended_on,'period_id',v_period_id,'auto_checkout',v_auto_checkout,'checkout_at',case when v_auto_checkout then v_retired_at else null end);
end
$function$;

CREATE OR REPLACE FUNCTION public.substitution_clock_in(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h text;r public.substitution_requests%rowtype;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';now_utc timestamp:=clock_timestamp() at time zone 'UTC';last_type text;
begin
 select pin_bcrypt into h from employees where id=p_employee and is_active=true;
 if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if;
 select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee for update;
 if not found or r.status<>'ACCEPTED' then return json_build_object('ok',false,'error','NOT_ACCEPTED'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if;
 if now_kst < r.work_start-interval '60 minutes' then return json_build_object('ok',false,'error','TOO_EARLY'); end if;
 if now_kst >= r.work_end then return json_build_object('ok',false,'error','SHIFT_ENDED'); end if;
 perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee::text));
 with latest as(
  select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by,created_at
  from event_corrections where event_id is not null and employee_id=p_employee order by event_id,created_at desc,id desc
 ),eff as(
  select e.id::numeric ord,
   case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,
   case when l.action='EDIT_TIME' and l.new_event_at is not null then
     public.attendance_correction_effective_kst(l.new_event_at,l.created_by,l.created_at)
   else e.event_at+interval '9 hours' end at_kst
  from attendance_events e left join latest l on l.event_id=e.id
  where e.employee_id=p_employee and coalesce(l.action,'')<>'VOID'
  union all
  select 1000000000000000::numeric+c.id,c.new_event_type,
   public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
  from event_corrections c where c.employee_id=p_employee and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%'
 )
 select typ into last_type from eff where at_kst is not null order by at_kst desc,ord desc limit 1;
 if last_type='IN' then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if;
 insert into attendance_events(employee_id,event_type,event_at,server_received_at,device_id) values(p_employee,'IN',now_utc,now_utc,'SUBSTITUTE:'||p_request);
 update substitution_requests set status='IN_PROGRESS' where id=p_request;
 return json_build_object('ok',true,'type','IN','at',to_char(now_kst,'YYYY-MM-DD"T"HH24:MI:SS'));
end $function$;

CREATE OR REPLACE FUNCTION public.substitution_enforce_due()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  n integer:=0;
  now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';
  planned integer;
  in_utc timestamp;
  out_utc timestamp;
  in_kst timestamp;
  out_kst timestamp;
  mins integer;
begin
  for r in
    select * from substitution_requests
    where status in('ACCEPTED','IN_PROGRESS') and work_end<=now_kst
    for update
  loop
    planned:=greatest(1,(extract(epoch from(r.work_end-r.work_start))/60)::integer);
    if r.status='ACCEPTED' then
      update substitution_requests set status='FAILED',actual_minutes=0,resolved_at=now() where id=r.id;
      n:=n+1;
      continue;
    end if;

    in_utc:=null; out_utc:=null; in_kst:=null; out_kst:=null; mins:=0;
    select event_at into in_utc
    from attendance_events
    where employee_id=r.substitute_employee_id and event_type='IN'
      and device_id='SUBSTITUTE:'||r.id::text
    order by id desc limit 1;

    if in_utc is null then
      update substitution_requests set status='FAILED',actual_minutes=0,resolved_at=now() where id=r.id;
      n:=n+1;
      continue;
    end if;
    in_kst:=in_utc+interval '9 hours';

    with latest_corr as (
      select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,created_at
      from event_corrections
      where event_id is not null and employee_id=r.substitute_employee_id
      order by event_id,created_at desc,id desc
    ), eff as (
      select e.id::numeric ord,
             case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
             case when c.action='EDIT_TIME' and c.new_event_at is not null then public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) else e.event_at end at
      from attendance_events e left join latest_corr c on c.event_id=e.id
      where e.employee_id=r.substitute_employee_id and coalesce(c.action,'')<>'VOID'
      union all
      select (1000000000000000::numeric+c.id),c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at)
      from event_corrections c
      where c.employee_id=r.substitute_employee_id and c.action='ADD'
        and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%'
    )
    select at into out_utc from eff
    where typ='OUT' and at>in_utc
    order by at,ord limit 1;

    if out_utc is null then
      if not exists(
        select 1 from event_corrections
        where employee_id=r.substitute_employee_id and action='ADD'
          and reason='SYSTEM_SUBSTITUTE_END' and created_by='substitution:'||r.id::text
      ) then
        insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
        values(null,r.substitute_employee_id,'ADD',r.work_end-interval '9 hours','OUT',
               'SYSTEM_SUBSTITUTE_END','substitution:'||r.id::text);
      end if;
      out_kst:=r.work_end;
    else
      out_kst:=out_utc+interval '9 hours';
    end if;

    mins:=greatest(0,(extract(epoch from(least(out_kst,r.work_end)-greatest(in_kst,r.work_start)))/60)::integer);
    update substitution_requests
    set status=case when mins>=planned then 'COMPLETED' else 'PARTIAL' end,
        actual_minutes=mins,resolved_at=now()
    where id=r.id;
    n:=n+1;
  end loop;
  return json_build_object('ok',true,'checked',n);
end;
$function$;

CREATE OR REPLACE FUNCTION public.substitution_is_working(p_employee bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ with latest as (select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by,created_at from event_corrections where event_id is not null and employee_id=p_employee order by event_id,created_at desc,id desc), eff as (select e.id::numeric ord,case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,case when l.action='EDIT_TIME' and l.new_event_at is not null then public.attendance_correction_effective_utc(l.new_event_at,l.created_by,l.created_at) else e.event_at end at from attendance_events e left join latest l on l.event_id=e.id where e.employee_id=p_employee and coalesce(l.action,'')<>'VOID' union all select 1000000000000000::numeric+c.id,c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) from event_corrections c where c.employee_id=p_employee and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%') select coalesce((select typ='IN' from eff order by at desc,ord desc limit 1),false) $function$;

CREATE OR REPLACE FUNCTION public.substitution_refresh_one(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r substitution_requests%rowtype;in_utc timestamp;out_kst timestamp;in_kst timestamp;mins integer:=0;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';planned integer;
begin
 select * into r from substitution_requests where id=p_id for update;
 if not found or r.status not in('ACCEPTED','IN_PROGRESS','COMPLETED','PARTIAL','FAILED') then return; end if;
 select event_at into in_utc from attendance_events where employee_id=r.substitute_employee_id and event_type='IN' and device_id='SUBSTITUTE:'||r.id::text order by id desc limit 1;
 if in_utc is not null then
  in_kst:=in_utc+interval '9 hours';
  with latest as(
   select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by,created_at
   from event_corrections where event_id is not null and employee_id=r.substitute_employee_id order by event_id,created_at desc,id desc
  ),eff as(
   select e.id::numeric ord,
    case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,
    case when l.action='EDIT_TIME' and l.new_event_at is not null then
      public.attendance_correction_effective_kst(l.new_event_at,l.created_by,l.created_at)
    else e.event_at+interval '9 hours' end at_kst
   from attendance_events e left join latest l on l.event_id=e.id
   where e.employee_id=r.substitute_employee_id and coalesce(l.action,'')<>'VOID'
   union all
   select 1000000000000000::numeric+c.id,c.new_event_type,
    public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
   from event_corrections c where c.employee_id=r.substitute_employee_id and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%'
  )
  select at_kst into out_kst from eff where typ='OUT' and at_kst>in_kst order by at_kst,ord limit 1;
 end if;
 planned:=greatest(1,(extract(epoch from(r.work_end-r.work_start))/60)::integer);
 if in_kst is not null and out_kst is not null then mins:=greatest(0,(extract(epoch from(least(out_kst,r.work_end)-greatest(in_kst,r.work_start)))/60)::integer); end if;
 if now_kst<r.work_end then
  update substitution_requests set actual_minutes=mins,status=case when in_kst is not null and out_kst is null then 'IN_PROGRESS' when in_kst is not null and out_kst is not null then 'PARTIAL' else 'ACCEPTED' end where id=r.id;
 else
  update substitution_requests set actual_minutes=case when status='COMPLETED' then greatest(actual_minutes,planned) else mins end,status=case when status='COMPLETED' then 'COMPLETED' when in_kst is null then 'FAILED' when mins>=planned then 'COMPLETED' else 'PARTIAL' end,resolved_at=coalesce(resolved_at,now()) where id=r.id;
 end if;
end $function$;
