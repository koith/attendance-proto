-- Read-only effective attendance projection for server-owned sheet synchronization.
-- Payroll is intentionally excluded until server/browser calculation parity is established.
create or replace function public.sheet_month_attendance_projection(p_store_id bigint,p_ym text)
returns table(employee_id bigint,employee_name text,event_id bigint,event_type text,event_at timestamp without time zone,source text)
language sql stable security invoker set search_path = public,pg_temp as $fn$
with bounds as (
 select to_date(p_ym||'-01','YYYY-MM-DD')::timestamp as start_at,
        (to_date(p_ym||'-01','YYYY-MM-DD')+interval '1 month')::timestamp as end_at
 where p_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])
), base as (
 select e.id employee_id,e.name employee_name,a.id event_id,a.event_type,a.event_at
 from public.attendance_events a join public.employees e on e.id=a.employee_id
 where e.store_id=p_store_id
), edits as (
 select distinct on (c.event_id) c.event_id,c.action,c.new_event_at,c.new_event_type
 from public.event_corrections c where c.event_id is not null
 order by c.event_id,c.created_at desc,c.id desc
), effective as (
 select b.employee_id,b.employee_name,b.event_id,
        case when edits.action='EDIT_TYPE' then coalesce(edits.new_event_type,b.event_type) else b.event_type end as event_type,
        case when edits.action='EDIT_TIME' then coalesce(edits.new_event_at,b.event_at) else b.event_at end as event_at,
        'event'::text as source
 from base b left join edits on edits.event_id=b.event_id
 where edits.action is distinct from 'VOID'
 union all
 select e.id,e.name,c.id,c.new_event_type,c.new_event_at,'correction'::text
 from public.event_corrections c join public.employees e on e.id=c.employee_id
 where e.store_id=p_store_id and c.action='ADD'
 -- Browser applyCorrections currently retains ADD even when a VOID_ADD exists.
)
select x.employee_id,x.employee_name,x.event_id,x.event_type,x.event_at,x.source
from effective x cross join bounds b
where x.event_at>=b.start_at and x.event_at<b.end_at
order by x.employee_name,x.event_at,x.event_id;
$fn$;
revoke all on function public.sheet_month_attendance_projection(bigint,text) from public,anon,authenticated;
grant execute on function public.sheet_month_attendance_projection(bigint,text) to service_role;

), base as (
 select e.id employee_id,e.name employee_name,a.id event_id,a.event_type,a.event_at
 from public.attendance_events a join public.employees e on e.id=a.employee_id
 where e.store_id=p_store_id
), edits as (
 select distinct on (c.event_id) c.event_id,c.action,c.new_event_at,c.new_event_type
 from public.event_corrections c where c.event_id is not null
 order by c.event_id,c.created_at desc,c.id desc
), effective as (
 select b.employee_id,b.employee_name,b.event_id,
        case when edits.action='EDIT_TYPE' then coalesce(edits.new_event_type,b.event_type) else b.event_type end as event_type,
        case when edits.action='EDIT_TIME' then coalesce(edits.new_event_at,b.event_at) else b.event_at end as event_at,
        'event'::text as source
 from base b left join edits on edits.event_id=b.event_id
 where edits.action is distinct from 'VOID'
 union all
 select e.id,e.name,c.id,c.new_event_type,c.new_event_at,'correction'::text
 from public.event_corrections c join public.employees e on e.id=c.employee_id
 where e.store_id=p_store_id and c.action='ADD'
 -- Browser applyCorrections currently retains ADD even when a VOID_ADD exists.
)
select x.employee_id,x.employee_name,x.event_id,x.event_type,x.event_at,x.source
from effective x cross join bounds b
where x.event_at>=b.start_at and x.event_at<b.end_at
order by x.employee_name,x.event_at,x.event_id;
$fn$;
revoke all on function public.sheet_month_attendance_projection(bigint,text) from public,anon,authenticated;
grant execute on function public.sheet_month_attendance_projection(bigint,text) to service_role;
