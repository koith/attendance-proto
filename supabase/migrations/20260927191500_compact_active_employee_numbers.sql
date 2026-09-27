-- Visible employee numbers are store-local and belong to current staff only.
-- Former/test employees keep their history by primary key, but no longer
-- reserve a visible No. in the store roster.
alter table public.employees alter column employee_no drop not null;
drop trigger if exists employees_assign_store_employee_no on public.employees;
drop index if exists public.employees_store_employee_no_uidx;

update public.employees set employee_no=null;
with ranked as (
  select id,row_number() over(
    partition by store_id order by created_at,id
  )::integer as new_employee_no
  from public.employees
  where is_active
)
update public.employees e
set employee_no=r.new_employee_no
from ranked r
where r.id=e.id;

create unique index employees_store_active_employee_no_uidx
  on public.employees(store_id,employee_no)
  where is_active and employee_no is not null;

create or replace function public.compact_store_employee_numbers()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_old_store bigint;
  v_new_store bigint;
begin
  v_old_store:=case when tg_op='INSERT' then null else old.store_id end;
  v_new_store:=new.store_id;
  if v_new_store is null then raise exception 'STORE_REQUIRED'; end if;

  -- Lock in deterministic order when an employee moves between stores.
  if v_old_store is not null then
    perform pg_advisory_xact_lock(hashtext('employees_store_no'),least(v_old_store,v_new_store)::integer);
  end if;
  perform pg_advisory_xact_lock(hashtext('employees_store_no'),greatest(coalesce(v_old_store,v_new_store),v_new_store)::integer);

  update public.employees
  set employee_no=null
  where store_id in (v_new_store,coalesce(v_old_store,v_new_store));

  with ranked as (
    select id,row_number() over(
      partition by store_id order by created_at,id
    )::integer as new_employee_no
    from public.employees
    where is_active
      and store_id in (v_new_store,coalesce(v_old_store,v_new_store))
  )
  update public.employees e
  set employee_no=r.new_employee_no
  from ranked r
  where r.id=e.id;
  return new;
end
$function$;

revoke all on function public.compact_store_employee_numbers() from public,anon,authenticated;
create trigger employees_compact_store_employee_numbers
after insert or update of store_id,is_active on public.employees
for each row execute function public.compact_store_employee_numbers();

comment on column public.employees.employee_no is
  'Store-scoped current-staff number, compacted by registration order; null for inactive employees.';

notify pgrst,'reload schema';
