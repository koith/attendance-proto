-- Field release security hardening v0.16
alter table public.stores enable row level security;
revoke all privileges on table public.stores from anon, authenticated;
do $$ declare f record; ddl text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_create_employee_for_store','admin_create_employee_onboarding_for_store','admin_inventory_manual_list','admin_inventory_manual_save','admin_store_settings_get','admin_store_settings_set') and pg_get_function_identity_arguments(p.oid) like '%p_store_id%' and pg_get_functiondef(p.oid) like '%if not public.is_admin() then%'
 loop ddl:=pg_get_functiondef(f.oid); ddl:=replace(ddl,'if not public.is_admin() then','if not public.can_manage_store(p_store_id) then'); execute ddl; end loop;
end $$;
do $$ declare f record; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin_%'
 loop execute format('revoke execute on function %s from anon',f.oid::regprocedure); end loop;
end $$;
revoke execute on function public.list_store_employees(bigint) from anon;
grant execute on function public.list_store_employees(bigint) to authenticated;
create or replace function public.list_store_employees(p_store_id bigint)
returns table(id bigint,name text,employee_no integer,is_active boolean,wage numeric,juhyu_hours numeric,juhyu_round text,tax_rate numeric,memo text,store_id bigint)
language sql security definer set search_path='public','pg_temp' as $$
 select e.id,e.name,e.employee_no,e.is_active,e.wage,e.juhyu_hours,e.juhyu_round,e.tax_rate,e.memo,e.store_id from public.employees e
 where public.can_manage_store(p_store_id) and e.store_id=p_store_id order by e.is_active desc,e.name
$$;
create or replace function public.list_employees_state(p_store_id bigint default null)
returns table(id bigint,name text,employee_no integer,working boolean,working_since timestamp without time zone)
language sql security definer set search_path='public','pg_temp' as $$
with es as (
 select e.id,e.name,e.employee_no,
 (select ae.event_type from public.attendance_events ae where ae.employee_id=e.id order by ae.event_at desc,ae.id desc limit 1) last_type,
 (select ae.event_at from public.attendance_events ae where ae.employee_id=e.id order by ae.event_at desc,ae.id desc limit 1) last_at
 from public.employees e where e.is_active and p_store_id is not null and e.store_id=p_store_id
)
select id,name,employee_no,(last_type='IN'),case when last_type='IN' then last_at end from es order by (last_type='IN') desc,name
$$;
do $$ declare f record; ddl text; begin
 select p.oid into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='hq_store_dashboard' and pg_get_function_identity_arguments(p.oid)='';
 ddl:=pg_get_functiondef(f.oid);
 if ddl not like '%public.is_hq_admin()%' then ddl:=replace(ddl,'from public.stores s where s.is_active','from public.stores s where s.is_active and public.is_hq_admin()'); execute ddl; end if;
end $$;
revoke execute on function public.hq_store_dashboard() from anon;
grant execute on function public.hq_store_dashboard() to authenticated;
revoke execute on function public.substitution_is_working(bigint) from anon, authenticated;
revoke execute on function public.substitution_schedule_conflict(bigint,timestamp without time zone,timestamp without time zone) from anon, authenticated;
