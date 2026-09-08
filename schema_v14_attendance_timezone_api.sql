-- WorkSchedule v62 timezone hotfix
-- Raw attendance_events remain immutable and keep the existing UTC-wall-clock storage convention.
-- API/RPC boundaries expose raw punch timestamps as Asia/Seoul wall-clock timestamps,
-- while correction timestamps (entered as KST wall-clock values) remain unchanged.

create or replace function public.punch(
  p_employee_id bigint,
  p_pin text,
  p_device text default 'POS'::text
)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text;
  v_last_type text;
  v_type text;
  v_instant timestamptz := clock_timestamp();
  v_now_utc timestamp := v_instant at time zone 'UTC';
  v_now_kst timestamp := v_instant at time zone 'Asia/Seoul';
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));

  select event_type into v_last_type
  from attendance_events
  where employee_id = p_employee_id
  order by id desc
  limit 1;

  if v_last_type is not null and v_last_type = 'IN' then
    v_type := 'OUT';
  else
    v_type := 'IN';
  end if;

  insert into attendance_events(employee_id, event_type, event_at, server_received_at, device_id)
  values (p_employee_id, v_type, v_now_utc, v_now_utc, coalesce(p_device,'POS'));

  return json_build_object(
    'ok', true,
    'type', v_type,
    'at', to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name', (select name from employees where id=p_employee_id)
  );
end;
$function$;

create or replace function public.list_employees_state()
returns table(id bigint, name text, working boolean, working_since timestamp without time zone)
language sql
security definer
set search_path to 'public', 'extensions'
as $function$
  select e.id, e.name,
    coalesce((select ev.event_type='IN' from attendance_events ev where ev.employee_id=e.id order by ev.id desc limit 1), false) as working,
    (select case when ev.event_type='IN'
      then (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul'
      else null end
     from attendance_events ev where ev.employee_id=e.id order by ev.id desc limit 1) as working_since
  from employees e
  where e.is_active = true
  order by (coalesce((select ev.event_type='IN' from attendance_events ev where ev.employee_id=e.id order by ev.id desc limit 1), false)) desc, e.name;
$function$;

create or replace function public.admin_events(
  p_from timestamp without time zone,
  p_to timestamp without time zone
)
returns setof attendance_events
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select ev.id, ev.employee_id, ev.event_type,
      (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at,
      (ev.server_received_at at time zone 'UTC') at time zone 'Asia/Seoul' as server_received_at,
      ev.device_id, ev.created_at, ev.client_reported_at
    from attendance_events ev
    where ev.event_at >= ((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
      and ev.event_at < ((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
    order by ev.employee_id, ev.event_at;
end;
$function$;

create or replace function public.admin_events_with_corrections(
  p_from timestamp without time zone,
  p_to timestamp without time zone
)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return (select json_build_object(
    'events', coalesce((select json_agg(row_to_json(e)) from (
      select ev.id, ev.employee_id, ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.event_at >= ((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at < ((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.employee_id, ev.event_at
    ) e),'[]'::json),
    'corrections', coalesce((select json_agg(row_to_json(c)) from (
      select id, event_id, employee_id, action, new_event_at, new_event_type, reason, created_by, created_at
      from event_corrections
      where created_at >= (p_from at time zone 'Asia/Seoul') - interval '90 days'
    ) c),'[]'::json)
  ));
end;
$function$;

create or replace function public.my_events(
  p_employee_id bigint,
  p_pin text,
  p_from timestamp without time zone,
  p_to timestamp without time zone
)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_hash text;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
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
$function$;

create or replace function public.admin_pending_requests()
returns table(
  id bigint,
  employee_id bigint,
  employee_name text,
  kind text,
  requested_at timestamp without time zone,
  requested_type text,
  note text,
  event_id bigint,
  orig_event_at timestamp without time zone,
  orig_event_type text,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select r.id, r.employee_id, e.name, r.kind, r.requested_at, r.requested_type, r.note, r.event_id,
      case when ev.event_at is null then null
        else (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' end as orig_event_at,
      ev.event_type as orig_event_type, r.created_at
    from correction_requests r
    join employees e on e.id=r.employee_id
    left join attendance_events ev on ev.id=r.event_id
    where r.status='PENDING'
    order by r.created_at;
end;
$function$;
