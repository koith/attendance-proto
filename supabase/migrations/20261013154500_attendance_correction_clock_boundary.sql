-- 2026-10-13 P0: effective correction timestamps consistently represent UTC.
-- Legacy manually edited timestamps (created before 06:00 UTC) were historically
-- interpreted as UTC by the reader. Preserve that visible meaning, even if
-- the actor typed a wall-clock time. New human edits are KST wall timestamps.
-- No production attendance, payroll, or correction row is changed.
CREATE OR REPLACE FUNCTION public.attendance_correction_effective_utc(p_at timestamp without time zone,p_actor text,p_created_at timestamptz)
RETURNS timestamp without time zone LANGUAGE sql IMMUTABLE SET search_path='pg_catalog'
AS $body$ SELECT CASE WHEN p_at IS NULL THEN NULL
 WHEN coalesce(p_actor,'')='system:auto-close' OR coalesce(p_actor,'') LIKE 'substitution:%'
   OR p_created_at < TIMESTAMPTZ '2026-10-13 06:00:00+00' THEN p_at
 ELSE ((p_at AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')::timestamp END $body$;
CREATE OR REPLACE FUNCTION public.attendance_correction_effective_kst(p_at timestamp without time zone,p_actor text,p_created_at timestamptz)
RETURNS timestamp without time zone LANGUAGE sql IMMUTABLE SET search_path='pg_catalog'
AS $body$ SELECT public.attendance_correction_effective_utc(p_at,p_actor,p_created_at)+INTERVAL '9 hours' $body$;
REVOKE ALL ON FUNCTION public.attendance_correction_effective_utc(timestamp without time zone,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.attendance_correction_effective_kst(timestamp without time zone,text,timestamptz) FROM PUBLIC,anon,authenticated;

-- Updated: admin_store_events_with_corrections(p_store_id bigint, p_from timestamp without time zone, p_to timestamp without time zone)
CREATE OR REPLACE FUNCTION public.admin_store_events_with_corrections(p_store_id bigint, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>=p_to OR p_to-p_from>INTERVAL '400 days'
 THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
 RETURN jsonb_build_object(
   'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.employee_id,x.event_at,x.id)
     FROM (SELECT ev.id,ev.employee_id,ev.event_type,
       (ev.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' event_at
       FROM public.attendance_events ev JOIN public.employees e ON e.id=ev.employee_id
       WHERE e.store_id=p_store_id
         AND ev.event_at>=((p_from AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')
         AND ev.event_at<((p_to AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')) x),'[]'::jsonb),
   'corrections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id)
     FROM (SELECT ec.id,ec.event_id,ec.employee_id,ec.action,
         CASE WHEN ec.new_event_at IS NULL THEN NULL ELSE
           public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at) END new_event_at,
         ec.new_event_type,ec.reason,ec.created_by,ec.created_at
       FROM public.event_corrections ec JOIN public.employees e ON e.id=ec.employee_id
       WHERE e.store_id=p_store_id
         AND ec.created_at>=(p_from AT TIME ZONE 'Asia/Seoul')-INTERVAL '90 days'
         AND NOT(ec.action='ADD' AND ec.reason LIKE '%[VOID_ADD:%')
         AND ec.action<>'VOID_ADD') c),'[]'::jsonb));
END $function$
;

-- Updated: list_employees_state(p_store_id bigint)
CREATE OR REPLACE FUNCTION public.list_employees_state(p_store_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(id bigint, name text, employee_no integer, working boolean, working_since timestamp without time zone, today_work_seconds bigint, today_first_in timestamp without time zone, today_last_out timestamp without time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with cfg as (
 select greatest(coalesce((select open_minute from public.store_settings where store_id=p_store_id limit 1),420)::int-60,0) start_minute,
        (clock_timestamp() at time zone 'Asia/Seoul') local_now
), bounds as (
 select case when (extract(hour from local_now)::int*60+extract(minute from local_now)::int)<start_minute then local_now::date-1 else local_now::date end work_date,start_minute from cfg
), win as (
 select (((work_date::timestamp+make_interval(mins=>start_minute)) at time zone 'Asia/Seoul') at time zone 'UTC')::timestamp w0,
        ((((work_date+1)::timestamp+make_interval(mins=>start_minute)) at time zone 'Asia/Seoul') at time zone 'UTC')::timestamp w1 from bounds
), base_effective as (
 select ae.employee_id,
  coalesce((select ec.new_event_type from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TYPE' and ec.new_event_type is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_type) event_type,
  coalesce((select public.attendance_correction_effective_utc(ec.new_event_at,ec.created_by,ec.created_at) from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TIME' and ec.new_event_at is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_at) event_at
 from public.attendance_events ae
 where p_store_id is not null and exists (
   select 1 from public.employees e where e.id=ae.employee_id and e.store_id=p_store_id and e.is_active
 ) and not exists(select 1 from public.event_corrections ec where ec.event_id=ae.id and ec.action='VOID')
), added_effective as (
 select ec.employee_id,ec.new_event_type event_type,public.attendance_correction_effective_utc(ec.new_event_at,ec.created_by,ec.created_at) event_at from public.event_corrections ec where ec.action='ADD' and ec.new_event_type is not null and ec.new_event_at is not null
   and p_store_id is not null and exists (
     select 1 from public.employees e where e.id=ec.employee_id and e.store_id=p_store_id and e.is_active
   )
), effective_events as (select * from base_effective union all select * from added_effective),
ordered as (
 select x.*,lead(x.event_type) over(partition by x.employee_id order by x.event_at) next_type,lead(x.event_at) over(partition by x.employee_id order by x.event_at) next_at from effective_events x
), totals as (
 select o.employee_id,
  coalesce(sum(extract(epoch from(o.next_at-o.event_at))) filter(where o.event_type='IN' and o.next_type='OUT' and o.event_at>=w.w0 and o.event_at<w.w1),0)::bigint work_seconds,
  min(o.event_at) filter(where o.event_type='IN' and o.next_type='OUT' and o.event_at>=w.w0 and o.event_at<w.w1) first_in,
  max(o.next_at) filter(where o.event_type='IN' and o.next_type='OUT' and o.event_at>=w.w0 and o.event_at<w.w1) last_out
 from ordered o cross join win w group by o.employee_id
), es as (
 select e.id,e.name,e.employee_no,le.event_type last_type,le.event_at last_at,t.work_seconds,t.first_in,t.last_out
 from public.employees e
 left join lateral(select x.event_type,x.event_at from effective_events x where x.employee_id=e.id order by x.event_at desc limit 1) le on true
 left join totals t on t.employee_id=e.id
 where e.is_active and p_store_id is not null and e.store_id=p_store_id AND
   EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY')
)
select id,name,employee_no,(last_type='IN'),
 case when last_type='IN' then ((last_at at time zone 'UTC') at time zone 'Asia/Seoul') end,
 coalesce(work_seconds,0),
 case when first_in is not null then ((first_in at time zone 'UTC') at time zone 'Asia/Seoul') end,
 case when last_out is not null then ((last_out at time zone 'UTC') at time zone 'Asia/Seoul') end
from es order by (last_type='IN') desc,name
$function$
;

-- Updated: punch(p_employee_id bigint, p_pin text, p_device text, p_substitute_for_employee_id bigint)
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
  if crypt(p_pin,v_hash) IS DISTINCT FROM v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));
  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,created_at from public.event_corrections
    where event_id is not null and employee_id=p_employee_id order by event_id,created_at desc,id desc
  ),eff as (
    select e.id::numeric ord,case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
      case when c.action='EDIT_TIME' and c.new_event_at is not null then public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) else e.event_at end at
    from public.attendance_events e left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select 1000000000000000::numeric+c.id,c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) from public.event_corrections c
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
;

-- Updated: system_enforce_store_close()
CREATE OR REPLACE FUNCTION public.system_enforce_store_close()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare now_kst timestamp without time zone:=now() at time zone 'Asia/Seoul'; r record; v_business_date date; v_cutoff timestamp without time zone; v_closed integer:=0;
begin
 for r in
  with latest_corr as (
   select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,created_at
   from public.event_corrections where event_id is not null order by event_id,created_at desc,id desc
  ),eff as (
   select e.employee_id,
    case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end event_type,
    case when c.action='EDIT_TIME' and c.new_event_at is not null then
      public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
      else e.event_at+interval '9 hours' end event_at_kst,e.id::numeric ord
   from public.attendance_events e left join latest_corr c on c.event_id=e.id where coalesce(c.action,'')<>'VOID'
   union all
   select employee_id,new_event_type,public.attendance_correction_effective_kst(new_event_at,created_by,created_at),1000000000000000::numeric+id
   from public.event_corrections where action='ADD' and new_event_at is not null and new_event_type is not null
  ),last_eff as (
   select distinct on(employee_id) employee_id,event_type,event_at_kst from eff where event_at_kst is not null order by employee_id,event_at_kst desc,ord desc
  )
  select le.*,coalesce(ss.open_minute,420) open_minute,ss.auto_close_from
  from last_eff le join public.employees e on e.id=le.employee_id
  left join lateral (select * from public.store_settings x where x.store_id=e.store_id order by x.id desc limit 1) ss on true
  where le.event_type='IN'
 loop
  v_business_date:=r.event_at_kst::date-case when (extract(hour from r.event_at_kst)::int*60+extract(minute from r.event_at_kst)::int)<r.open_minute then 1 else 0 end;
  v_cutoff:=v_business_date::timestamp+interval '26 hours';
  if now_kst>=v_cutoff and v_cutoff>=r.event_at_kst and (r.auto_close_from is null or v_cutoff>=r.auto_close_from at time zone 'Asia/Seoul') then
   if not exists(select 1 from public.event_corrections where employee_id=r.employee_id and action='ADD' and reason='SYSTEM_STORE_CLOSE' and created_by='system:auto-close' and new_event_at=v_cutoff-interval '9 hours') then
    insert into public.event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
    values(null,r.employee_id,'ADD',v_cutoff-interval '9 hours','OUT','SYSTEM_STORE_CLOSE','system:auto-close');v_closed:=v_closed+1;
   end if;
  end if;
 end loop;
 return json_build_object('ok',true,'closed',v_closed,'checked_at',now_kst,'hard_stop_minute',1560);
end $function$
;

-- Updated: system_enforce_store_close(p_store_id bigint)
CREATE OR REPLACE FUNCTION public.system_enforce_store_close(p_store_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s public.store_settings%rowtype; now_kst timestamp without time zone:=now() at time zone 'Asia/Seoul'; active_from_kst timestamp without time zone; r record; v_business_date date; v_cutoff timestamp without time zone; v_closed integer:=0;
begin
 if not public.can_manage_store(p_store_id) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into s from public.store_settings where store_id=p_store_id order by id desc limit 1;
 if not found then return json_build_object('ok',false,'error','STORE_SETTINGS_MISSING'); end if;
 active_from_kst:=s.auto_close_from at time zone 'Asia/Seoul';
 for r in
  with latest_corr as (
   select distinct on(c.event_id) c.event_id,c.action,c.new_event_at,c.new_event_type,c.created_by,c.created_at
   from public.event_corrections c join public.employees ce on ce.id=c.employee_id
   where c.event_id is not null and ce.store_id=p_store_id order by c.event_id,c.created_at desc,c.id desc
  ),eff as (
   select e.employee_id,case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end event_type,
    case when c.action='EDIT_TIME' and c.new_event_at is not null then public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at) else e.event_at+interval '9 hours' end event_at_kst,e.id::numeric ord
   from public.attendance_events e join public.employees ee on ee.id=e.employee_id left join latest_corr c on c.event_id=e.id
   where ee.store_id=p_store_id and coalesce(c.action,'')<>'VOID'
   union all
   select c.employee_id,c.new_event_type,public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at),1000000000000000::numeric+c.id
   from public.event_corrections c join public.employees ee on ee.id=c.employee_id
   where ee.store_id=p_store_id and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null
  ),last_eff as (
   select distinct on(employee_id) employee_id,event_type,event_at_kst from eff where event_at_kst is not null order by employee_id,event_at_kst desc,ord desc
  ) select * from last_eff where event_type='IN'
 loop
  v_business_date:=r.event_at_kst::date-case when (extract(hour from r.event_at_kst)::int*60+extract(minute from r.event_at_kst)::int)<s.open_minute then 1 else 0 end;
  v_cutoff:=v_business_date::timestamp+interval '26 hours';
  if v_cutoff>=active_from_kst and now_kst>=v_cutoff and v_cutoff>=r.event_at_kst then
   if not exists(select 1 from public.event_corrections where employee_id=r.employee_id and action='ADD' and reason='SYSTEM_STORE_CLOSE' and created_by='system:auto-close' and new_event_at=v_cutoff-interval '9 hours') then
    insert into public.event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by) values(null,r.employee_id,'ADD',v_cutoff-interval '9 hours','OUT','SYSTEM_STORE_CLOSE','system:auto-close');v_closed:=v_closed+1;
   end if;
  end if;
 end loop;
 return json_build_object('ok',true,'closed',v_closed,'store_id',p_store_id,'checked_at',now_kst,'active_from',active_from_kst,'hard_stop_minute',1560);
end $function$
;
