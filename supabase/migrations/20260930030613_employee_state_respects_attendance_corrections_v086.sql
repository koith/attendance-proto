create or replace function public.list_employees_state(p_store_id bigint default null::bigint)
returns table(id bigint, name text, employee_no integer, working boolean, working_since timestamp without time zone)
language sql
security definer
set search_path = public, pg_temp
as $$
with base_effective as (
  select ae.employee_id,
         coalesce((select ec.new_event_type from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TYPE' and ec.new_event_type is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_type) event_type,
         coalesce((select ec.new_event_at from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TIME' and ec.new_event_at is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_at) event_at
  from public.attendance_events ae
  where not exists (select 1 from public.event_corrections ec where ec.event_id=ae.id and ec.action='VOID')
),
added_effective as (
  select ec.employee_id,ec.new_event_type event_type,ec.new_event_at event_at
  from public.event_corrections ec
  where ec.action='ADD' and ec.new_event_type is not null and ec.new_event_at is not null
),
effective_events as (
  select * from base_effective union all select * from added_effective
),
es as (
  select e.id,e.name,e.employee_no,le.event_type last_type,le.event_at last_at
  from public.employees e
  left join lateral (
    select x.event_type,x.event_at from effective_events x
    where x.employee_id=e.id order by x.event_at desc limit 1
  ) le on true
  where e.is_active and p_store_id is not null and e.store_id=p_store_id
)
select id,name,employee_no,(last_type='IN'),
       case when last_type='IN' then ((last_at at time zone 'UTC') at time zone 'Asia/Seoul') end
from es order by (last_type='IN') desc,name
$$;
revoke all on function public.list_employees_state(bigint) from public;
grant execute on function public.list_employees_state(bigint) to anon,authenticated,service_role;
