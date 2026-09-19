-- Runtime integrity V22
-- Canonical effective attendance state for punch and substitute finalization.
-- attendance_events remain immutable; system-generated OUT events are corrections.

create or replace function public.punch(p_employee_id bigint, p_pin text, p_device text default 'POS')
returns json
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
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
  if crypt(p_pin,v_hash)<>v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));

  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type
    from event_corrections
    where event_id is not null and employee_id=p_employee_id
    order by event_id,created_at desc,id desc
  ), eff as (
    select e.id::numeric ord,
           case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
           case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else e.event_at end at
    from attendance_events e
    left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select (1000000000000000::numeric+c.id),c.new_event_type,c.new_event_at
    from event_corrections c
    where c.employee_id=p_employee_id and c.action='ADD'
      and c.new_event_at is not null and c.new_event_type is not null
  )
  select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;

  v_type:=case when v_last_type='IN' then 'OUT' else 'IN' end;
  insert into attendance_events(employee_id,event_type,event_at,server_received_at,device_id)
  values(p_employee_id,v_type,v_now_utc,v_now_utc,coalesce(p_device,'POS'));

  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name',(select name from employees where id=p_employee_id));
end;
$$;

create or replace function public.substitution_enforce_due()
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
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
      select distinct on(event_id) event_id,action,new_event_at,new_event_type
      from event_corrections
      where event_id is not null and employee_id=r.substitute_employee_id
      order by event_id,created_at desc,id desc
    ), eff as (
      select e.id::numeric ord,
             case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
             case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else e.event_at end at
      from attendance_events e left join latest_corr c on c.event_id=e.id
      where e.employee_id=r.substitute_employee_id and coalesce(c.action,'')<>'VOID'
      union all
      select (1000000000000000::numeric+c.id),c.new_event_type,c.new_event_at
      from event_corrections c
      where c.employee_id=r.substitute_employee_id and c.action='ADD'
        and c.new_event_at is not null and c.new_event_type is not null
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
$$;

create or replace function public.substitution_request_list(p_employee bigint,p_pin text)
returns json
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare h text;q record;
begin
  select pin_bcrypt into h from employees where id=p_employee and is_active=true;
  if h is null or crypt(p_pin,h)<>h then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  perform substitution_enforce_due();
  for q in select id from substitution_requests
    where p_employee in(requester_employee_id,substitute_employee_id)
      and status in('ACCEPTED','IN_PROGRESS')
  loop
    perform substitution_refresh_one(q.id);
  end loop;

  return json_build_object('ok',true,'requests',(
    select coalesce(json_agg(x order by x.work_start desc),'[]'::json)
    from (
      select r.id,r.requester_employee_id,r.substitute_employee_id,a.name requester_name,b.name substitute_name,
             r.work_start,r.work_end,r.status,r.requested_at,r.accepted_at,r.resolved_at,r.note,r.actual_minutes
      from substitution_requests r
      join employees a on a.id=r.requester_employee_id
      join employees b on b.id=r.substitute_employee_id
      where p_employee in(r.requester_employee_id,r.substitute_employee_id)
    ) x
  ));
end;
$$;

revoke execute on function public.substitution_enforce_due() from public, anon, authenticated;
