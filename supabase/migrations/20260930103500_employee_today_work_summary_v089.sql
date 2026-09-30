drop function if exists public.list_employees_state(bigint);
create function public.list_employees_state(p_store_id bigint default null)
returns table(id bigint,name text,employee_no integer,working boolean,working_since timestamp without time zone,today_work_seconds bigint,today_first_in timestamp without time zone,today_last_out timestamp without time zone)
language sql security definer set search_path=public,pg_temp
as $$
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
  coalesce((select ec.new_event_at from public.event_corrections ec where ec.event_id=ae.id and ec.action='EDIT_TIME' and ec.new_event_at is not null order by ec.created_at desc,ec.id desc limit 1),ae.event_at) event_at
 from public.attendance_events ae where not exists(select 1 from public.event_corrections ec where ec.event_id=ae.id and ec.action='VOID')
), added_effective as (
 select ec.employee_id,ec.new_event_type event_type,ec.new_event_at event_at from public.event_corrections ec where ec.action='ADD' and ec.new_event_type is not null and ec.new_event_at is not null
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
 where e.is_active and p_store_id is not null and e.store_id=p_store_id
)
select id,name,employee_no,(last_type='IN'),
 case when last_type='IN' then ((last_at at time zone 'UTC') at time zone 'Asia/Seoul') end,
 coalesce(work_seconds,0),
 case when first_in is not null then ((first_in at time zone 'UTC') at time zone 'Asia/Seoul') end,
 case when last_out is not null then ((last_out at time zone 'UTC') at time zone 'Asia/Seoul') end
from es order by (last_type='IN') desc,name
$$;
revoke all on function public.list_employees_state(bigint) from public;
grant execute on function public.list_employees_state(bigint) to anon,authenticated,service_role;
