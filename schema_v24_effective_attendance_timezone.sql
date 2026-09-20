-- V24: canonical display boundary for effective attendance timestamps.
-- Raw attendance_events remain immutable UTC wall-clock. Human-entered corrections are KST wall-clock.
-- System auto-close/substitute corrections are stored as UTC wall-clock and are converted only at read/display boundaries.

create or replace function public.list_employees_state()
returns table(id bigint,name text,working boolean,working_since timestamp without time zone)
language sql security definer set search_path to 'public','pg_temp'
as $$
with latest_corr as (
 select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,reason
 from public.event_corrections where event_id is not null order by event_id,created_at desc,id desc
), eff as (
 select ev.employee_id,
  case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else ev.event_type end event_type,
  case when c.action='EDIT_TIME' and c.new_event_at is not null then c.new_event_at else ev.event_at end event_at,
  case when c.action='EDIT_TIME' and c.new_event_at is not null
       then coalesce(c.created_by,'') in ('system:auto-close') or coalesce(c.created_by,'') like 'substitution:%'
       else true end stored_utc,
  ev.id::numeric ord
 from public.attendance_events ev left join latest_corr c on c.event_id=ev.id
 where coalesce(c.action,'')<>'VOID'
 union all
 select employee_id,new_event_type,new_event_at,
        coalesce(created_by,'') in ('system:auto-close') or coalesce(created_by,'') like 'substitution:%',
        1000000000000000::numeric+id
 from public.event_corrections where action='ADD' and new_event_type is not null and new_event_at is not null
), last_eff as (
 select distinct on(employee_id) employee_id,event_type,event_at,stored_utc
 from eff where event_at is not null order by employee_id,event_at desc,ord desc
)
select e.id,e.name,coalesce(le.event_type='IN',false),
 case when le.event_type='IN' then
   case when le.stored_utc then le.event_at+interval '9 hours' else le.event_at end
 else null end
from public.employees e left join last_eff le on le.employee_id=e.id
where e.is_active=true
order by coalesce(le.event_type='IN',false) desc,e.name;
$$;

create or replace function public.admin_events_with_corrections(
  p_from timestamp without time zone,p_to timestamp without time zone)
returns json language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 return (select json_build_object(
  'events',coalesce((select json_agg(row_to_json(e)) from (
   select ev.id,ev.employee_id,ev.event_type,
    (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
   from attendance_events ev
   where ev.event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
     and ev.event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
   order by ev.employee_id,ev.event_at
  ) e),'[]'::json),
  'corrections',coalesce((select json_agg(row_to_json(c)) from (
   select id,event_id,employee_id,action,
    case when new_event_at is not null and
      (coalesce(created_by,'')='system:auto-close' or coalesce(created_by,'') like 'substitution:%')
      then new_event_at+interval '9 hours' else new_event_at end as new_event_at,
    new_event_type,reason,created_by,created_at
   from event_corrections
   where created_at >= (p_from at time zone 'Asia/Seoul')-interval '90 days'
  ) c),'[]'::json)
 ));
end;
$$;

-- Regression invariant: do not mutate/delete raw attendance_events or correction history.
