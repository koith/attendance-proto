-- Enforce ready-store and same-store boundaries for PIN-authenticated staff RPCs.
-- Generated from deployed function definitions; keep existing parameters, grants and data intact.
-- This migration does not modify any employee, attendance, payroll or audit rows.

CREATE OR REPLACE FUNCTION public.punch(p_employee_id bigint, p_pin text, p_device text DEFAULT 'POS'::text, p_substitute_for_employee_id bigint DEFAULT NULL::bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text; v_store_id bigint; v_last_type text; v_type text;
  v_instant timestamptz:=clock_timestamp(); v_now_utc timestamp:=v_instant at time zone 'UTC'; v_now_kst timestamp:=v_instant at time zone 'Asia/Seoul';
  v_sub_name text; v_open_minute integer:=420; v_close_minute integer:=1500; v_reopen_minute integer; v_local_minute integer; v_close_clock_minute integer;
begin
  select pin_bcrypt,store_id into v_hash,v_store_id from public.employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=v_store_id AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if crypt(p_pin,v_hash)<>v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));
  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type from public.event_corrections
    where event_id is not null and employee_id=p_employee_id order by event_id,created_at desc,id desc
  ),eff as (
    select e.id::numeric ord,case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
      case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else e.event_at end at
    from public.attendance_events e left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select 1000000000000000::numeric+c.id,c.new_event_type,c.new_event_at from public.event_corrections c
    where c.employee_id=p_employee_id and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null
  ) select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;
  v_type:=case when v_last_type='IN' then 'OUT' else 'IN' end;
  if v_type='IN' then
    select coalesce(open_minute,420),coalesce(close_minute,1500) into v_open_minute,v_close_minute
      from public.store_settings where id=coalesce(v_store_id,1);
    v_reopen_minute:=greatest(v_open_minute-60,0);
    v_local_minute:=extract(hour from v_now_kst)::integer*60+extract(minute from v_now_kst)::integer;
    if v_close_minute>=1440 then
      v_close_clock_minute:=v_close_minute-1440;
      if v_local_minute>=v_close_clock_minute and v_local_minute<v_reopen_minute then
        return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
      end if;
    elsif v_local_minute>=v_close_minute or v_local_minute<v_reopen_minute then
      return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
    end if;
  end if;
  if v_type='OUT' then p_substitute_for_employee_id:=null;
  elsif p_substitute_for_employee_id is not null then
    if p_substitute_for_employee_id=p_employee_id then return json_build_object('ok',false,'error','SUBSTITUTE_SELF'); end if;
    select name into v_sub_name from public.employees where id=p_substitute_for_employee_id and is_active=true and store_id=v_store_id;
    if v_sub_name is null then return json_build_object('ok',false,'error','SUBSTITUTE_NOT_ACTIVE'); end if;
  end if;
  insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id,substitute_for_employee_id)
  values(p_employee_id,v_type,v_now_utc,v_now_utc,coalesce(p_device,'POS'),p_substitute_for_employee_id);
  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),'name',(select name from public.employees where id=p_employee_id),
    'substitute_for_employee_id',p_substitute_for_employee_id,'substitute_for_name',v_sub_name);
end;$function$

CREATE OR REPLACE FUNCTION public.my_events(p_employee_id bigint, p_pin text, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_employee_id and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  return json_build_object('ok',true,'events',
    coalesce((select json_agg(row_to_json(t)) from (
      select ev.id, ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.employee_id=p_employee_id
        and ev.event_at >= ((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at < ((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.event_at
    ) t),'[]'::json),
    'requests', coalesce((select json_agg(row_to_json(r)) from (
      select id, kind, requested_at, requested_type, note, status, created_at
      from correction_requests
      where employee_id=p_employee_id and created_at > now() - interval '60 days' order by created_at desc
    ) r),'[]'::json));
end;
$function$

CREATE OR REPLACE FUNCTION public.request_correction(p_employee_id bigint, p_pin text, p_kind text, p_event_id bigint, p_requested_at timestamp without time zone, p_requested_type text, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text; v_id bigint;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_employee_id and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if p_event_id is not null and not exists(select 1 from public.attendance_events ev where ev.id=p_event_id and ev.employee_id=p_employee_id) then return json_build_object('ok',false,'error','EVENT_EMPLOYEE_MISMATCH'); end if;
  insert into correction_requests(employee_id,event_id,kind,requested_at,requested_type,note)
    values (p_employee_id,p_event_id,p_kind,p_requested_at,p_requested_type,p_note) returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end; $function$

CREATE OR REPLACE FUNCTION public.substitution_request_create(p_requester bigint, p_pin text, p_substitute bigint, p_start timestamp without time zone, p_end timestamp without time zone, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; rid bigint; begin select pin_bcrypt into h from employees where id=p_requester and is_active=true; if h is null or crypt(p_pin,h)<>h then return json_build_object('ok',false,'error','BAD_PIN'); end if; if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_requester and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if; if p_requester=p_substitute or p_end<=p_start or not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id where sub.id=p_substitute and sub.is_active=true and req.id=p_requester) then return json_build_object('ok',false,'error','INVALID_REQUEST'); end if; perform pg_advisory_xact_lock(hashtext('substitution_reservation_'||p_substitute::text)); if substitution_is_working(p_substitute) then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if; if substitution_schedule_conflict(p_substitute,p_start,p_end) then return json_build_object('ok',false,'error','WORK_SCHEDULE_CONFLICT'); end if; if exists(select 1 from substitution_requests x where x.substitute_employee_id=p_substitute and x.status in ('ACCEPTED','IN_PROGRESS') and x.work_start<p_end and x.work_end>p_start) then return json_build_object('ok',false,'error','SUBSTITUTION_CONFLICT'); end if; insert into substitution_requests(requester_employee_id,substitute_employee_id,work_start,work_end,note) values(p_requester,p_substitute,p_start,p_end,left(nullif(trim(p_note),''),200)) returning id into rid; return json_build_object('ok',true,'id',rid); end $function$

CREATE OR REPLACE FUNCTION public.substitution_request_respond(p_request bigint, p_employee bigint, p_pin text, p_accept boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; r substitution_requests%rowtype; begin select pin_bcrypt into h from employees where id=p_employee and is_active=true; if h is null or crypt(p_pin,h)<>h then return json_build_object('ok',false,'error','BAD_PIN'); end if; select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee and status='REQUESTED' for update; if not found then return json_build_object('ok',false,'error','NOT_PENDING'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if; if p_accept then perform pg_advisory_xact_lock(hashtext('substitution_reservation_'||p_employee::text)); if substitution_is_working(p_employee) then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if; if substitution_schedule_conflict(p_employee,r.work_start,r.work_end) then return json_build_object('ok',false,'error','WORK_SCHEDULE_CONFLICT'); end if; if exists(select 1 from substitution_requests x where x.id<>r.id and x.substitute_employee_id=p_employee and x.status in ('ACCEPTED','IN_PROGRESS') and x.work_start<r.work_end and x.work_end>r.work_start) then return json_build_object('ok',false,'error','SUBSTITUTION_CONFLICT'); end if; end if; update substitution_requests set status=case when p_accept then 'ACCEPTED' else 'REJECTED' end,accepted_at=case when p_accept then now() else null end,resolved_at=case when p_accept then null else now() end where id=r.id; return json_build_object('ok',true); end $function$

CREATE OR REPLACE FUNCTION public.substitution_clock_in(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h text;r public.substitution_requests%rowtype;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';now_utc timestamp:=clock_timestamp() at time zone 'UTC';last_type text;
begin
 select pin_bcrypt into h from employees where id=p_employee and is_active=true;
 if h is null or crypt(p_pin,h)<>h then return json_build_object('ok',false,'error','BAD_PIN'); end if;
 select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee for update;
 if not found or r.status<>'ACCEPTED' then return json_build_object('ok',false,'error','NOT_ACCEPTED'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if;
 if now_kst < r.work_start-interval '60 minutes' then return json_build_object('ok',false,'error','TOO_EARLY'); end if;
 if now_kst >= r.work_end then return json_build_object('ok',false,'error','SHIFT_ENDED'); end if;
 perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee::text));
 with latest as(
  select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by
  from event_corrections where event_id is not null and employee_id=p_employee order by event_id,created_at desc,id desc
 ),eff as(
  select e.id::numeric ord,
   case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,
   case when l.action='EDIT_TIME' and l.new_event_at is not null then
     case when coalesce(l.created_by,'')='system:auto-close' or coalesce(l.created_by,'') like 'substitution:%' then l.new_event_at+interval '9 hours' else l.new_event_at end
   else e.event_at+interval '9 hours' end at_kst
  from attendance_events e left join latest l on l.event_id=e.id
  where e.employee_id=p_employee and coalesce(l.action,'')<>'VOID'
  union all
  select 1000000000000000::numeric+c.id,c.new_event_type,
   case when coalesce(c.created_by,'')='system:auto-close' or coalesce(c.created_by,'') like 'substitution:%' then c.new_event_at+interval '9 hours' else c.new_event_at end
  from event_corrections c where c.employee_id=p_employee and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null
 )
 select typ into last_type from eff where at_kst is not null order by at_kst desc,ord desc limit 1;
 if last_type='IN' then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if;
 insert into attendance_events(employee_id,event_type,event_at,server_received_at,device_id) values(p_employee,'IN',now_utc,now_utc,'SUBSTITUTE:'||p_request);
 update substitution_requests set status='IN_PROGRESS' where id=p_request;
 return json_build_object('ok',true,'type','IN','at',to_char(now_kst,'YYYY-MM-DD"T"HH24:MI:SS'));
end $function$
