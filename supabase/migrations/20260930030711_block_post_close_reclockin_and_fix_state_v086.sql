create or replace function public.punch(p_employee_id bigint, p_pin text, p_device text default 'POS'::text, p_substitute_for_employee_id bigint default null::bigint)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text; v_last_type text; v_type text;
  v_instant timestamptz := clock_timestamp();
  v_now_utc timestamp := v_instant at time zone 'UTC';
  v_now_kst timestamp := v_instant at time zone 'Asia/Seoul';
  v_sub_name text; v_open_minute integer := 420; v_close_minute integer := 1500;
  v_local_minute integer; v_business_minute integer;
begin
  select pin_bcrypt into v_hash from public.employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin,v_hash)<>v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));
  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type
    from public.event_corrections where event_id is not null and employee_id=p_employee_id
    order by event_id,created_at desc,id desc
  ), eff as (
    select e.id::numeric ord,
           case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
           case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else e.event_at end at
    from public.attendance_events e left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select (1000000000000000::numeric+c.id),c.new_event_type,c.new_event_at
    from public.event_corrections c
    where c.employee_id=p_employee_id and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null
  )
  select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;
  v_type:=case when v_last_type='IN' then 'OUT' else 'IN' end;

  if v_type='IN' then
    select coalesce(open_minute,420),coalesce(close_minute,1500) into v_open_minute,v_close_minute
    from public.store_settings where id=1;
    v_local_minute := extract(hour from v_now_kst)::integer*60 + extract(minute from v_now_kst)::integer;
    v_business_minute := case when v_local_minute < v_open_minute then v_local_minute+1440 else v_local_minute end;
    if v_business_minute >= v_close_minute then
      return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute);
    end if;
  end if;

  if v_type='OUT' then
    p_substitute_for_employee_id := null;
  elsif p_substitute_for_employee_id is not null then
    if p_substitute_for_employee_id=p_employee_id then return json_build_object('ok',false,'error','SUBSTITUTE_SELF'); end if;
    select name into v_sub_name from public.employees where id=p_substitute_for_employee_id and is_active=true;
    if v_sub_name is null then return json_build_object('ok',false,'error','SUBSTITUTE_NOT_ACTIVE'); end if;
  end if;

  insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id,substitute_for_employee_id)
  values(p_employee_id,v_type,v_now_utc,v_now_utc,coalesce(p_device,'POS'),p_substitute_for_employee_id);
  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name',(select name from public.employees where id=p_employee_id),
    'substitute_for_employee_id',p_substitute_for_employee_id,'substitute_for_name',v_sub_name);
end;
$$;

insert into public.event_corrections(event_id,employee_id,action,reason,created_by)
select ae.id,ae.employee_id,'VOID','영업 종료(25:00) 후 재출근으로 생성된 무효 기록 정정','system-v0.86'
from public.attendance_events ae
where ae.id in (5363,5364) and ae.event_type='IN'
  and not exists (select 1 from public.event_corrections ec where ec.event_id=ae.id and ec.action='VOID');
