-- V25: substitution effective-state integrity.
-- Raw attendance_events remain immutable. Effective ordering normalizes raw/system UTC wall-clock and human KST corrections.

create or replace function public.substitution_clock_in(p_request bigint,p_employee bigint,p_pin text)
returns json language plpgsql security definer set search_path to 'public','extensions'
as $$
declare h text;r public.substitution_requests%rowtype;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';now_utc timestamp:=clock_timestamp() at time zone 'UTC';last_type text;
begin
 select pin_bcrypt into h from employees where id=p_employee and is_active=true;
 if h is null or crypt(p_pin,h)<>h then return json_build_object('ok',false,'error','BAD_PIN'); end if;
 select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee for update;
 if not found or r.status<>'ACCEPTED' then return json_build_object('ok',false,'error','NOT_ACCEPTED'); end if;
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
end $$;

create or replace function public.substitution_refresh_one(p_id bigint)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare r substitution_requests%rowtype;in_utc timestamp;out_kst timestamp;in_kst timestamp;mins integer:=0;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';planned integer;
begin
 select * into r from substitution_requests where id=p_id for update;
 if not found or r.status not in('ACCEPTED','IN_PROGRESS','COMPLETED','PARTIAL','FAILED') then return; end if;
 select event_at into in_utc from attendance_events where employee_id=r.substitute_employee_id and event_type='IN' and device_id='SUBSTITUTE:'||r.id::text order by id desc limit 1;
 if in_utc is not null then
  in_kst:=in_utc+interval '9 hours';
  with latest as(
   select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by
   from event_corrections where event_id is not null and employee_id=r.substitute_employee_id order by event_id,created_at desc,id desc
  ),eff as(
   select e.id::numeric ord,
    case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,
    case when l.action='EDIT_TIME' and l.new_event_at is not null then
      case when coalesce(l.created_by,'')='system:auto-close' or coalesce(l.created_by,'') like 'substitution:%' then l.new_event_at+interval '9 hours' else l.new_event_at end
    else e.event_at+interval '9 hours' end at_kst
   from attendance_events e left join latest l on l.event_id=e.id
   where e.employee_id=r.substitute_employee_id and coalesce(l.action,'')<>'VOID'
   union all
   select 1000000000000000::numeric+c.id,c.new_event_type,
    case when coalesce(c.created_by,'')='system:auto-close' or coalesce(c.created_by,'') like 'substitution:%' then c.new_event_at+interval '9 hours' else c.new_event_at end
   from event_corrections c where c.employee_id=r.substitute_employee_id and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null
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
end $$;
