alter table public.employees add column if not exists employee_no integer;

with ranked as (
  select id,row_number() over(partition by store_id order by created_at,id)::integer as new_employee_no
  from public.employees
)
update public.employees e set employee_no=r.new_employee_no
from ranked r where r.id=e.id;

alter table public.employees alter column employee_no set not null;
create unique index if not exists employees_store_employee_no_uidx on public.employees(store_id,employee_no);
comment on column public.employees.employee_no is 'Store-scoped employee number assigned in registration order.';

create or replace function public.assign_store_employee_no()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $function$
begin
  if new.store_id is null then raise exception 'STORE_REQUIRED'; end if;
  if tg_op='UPDATE' and new.store_id is not distinct from old.store_id then return new; end if;
  perform pg_advisory_xact_lock(hashtext('employees_store_no'),new.store_id::integer);
  select coalesce(max(e.employee_no),0)+1 into new.employee_no from public.employees e where e.store_id=new.store_id;
  return new;
end
$function$;
revoke execute on function public.assign_store_employee_no() from public,anon,authenticated;
drop trigger if exists employees_assign_store_employee_no on public.employees;
create trigger employees_assign_store_employee_no before insert or update of store_id on public.employees
for each row execute function public.assign_store_employee_no();

drop function if exists public.list_active_employees();
create function public.list_active_employees()
returns table(id bigint,name text,employee_no integer,store_id bigint)
language sql security definer set search_path to 'public'
as $function$
  select e.id,e.name,e.employee_no,e.store_id from public.employees e where e.is_active=true order by e.name
$function$;
revoke execute on function public.list_active_employees() from public;
grant execute on function public.list_active_employees() to anon,authenticated;

drop function if exists public.list_employees_state(bigint);
create function public.list_employees_state(p_store_id bigint default null)
returns table(id bigint,name text,employee_no integer,working boolean,working_since timestamp without time zone)
language sql security definer set search_path to 'public','pg_temp'
as $function$
with es as (
  select e.id,e.name,e.employee_no,
    (select ae.event_type from public.attendance_events ae where ae.employee_id=e.id order by ae.event_at desc,ae.id desc limit 1) last_type,
    (select ae.event_at from public.attendance_events ae where ae.employee_id=e.id order by ae.event_at desc,ae.id desc limit 1) last_at
  from public.employees e where e.is_active and (p_store_id is null or e.store_id=p_store_id)
)
select id,name,employee_no,(last_type='IN'),case when last_type='IN' then last_at end from es
order by (last_type='IN') desc,name
$function$;
revoke execute on function public.list_employees_state(bigint) from public;
grant execute on function public.list_employees_state(bigint) to anon,authenticated;

drop function if exists public.list_store_employees(bigint);
create function public.list_store_employees(p_store_id bigint)
returns table(id bigint,name text,employee_no integer,is_active boolean,wage numeric,juhyu_hours numeric,juhyu_round text,tax_rate numeric,memo text,store_id bigint)
language sql security definer set search_path to 'public','pg_temp'
as $function$
  select e.id,e.name,e.employee_no,e.is_active,e.wage,e.juhyu_hours,e.juhyu_round,e.tax_rate,e.memo,e.store_id
  from public.employees e where e.store_id=p_store_id order by e.is_active desc,e.name
$function$;
revoke execute on function public.list_store_employees(bigint) from public,anon;
grant execute on function public.list_store_employees(bigint) to authenticated;

create or replace function public.admin_create_employee_onboarding_for_store(
  p_name text,p_pin text,p_started_on date,p_payroll_type text,p_hourly_wage integer,p_monthly_salary integer,
  p_tax_treatment text,p_business_deduction_rate numeric,p_night_allowance_enabled boolean,p_night_allowance_mode text,
  p_night_allowance_value numeric,p_night_allowance_start time without time zone,p_memo text,p_workdays jsonb,p_store_id bigint
)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_emp bigint;v_employee_no integer;v_period jsonb;v_contract jsonb;v_period_id bigint;v_contract_id bigint;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'NAME_REQUIRED'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN_REQUIRED'; end if;
  if p_started_on is null then raise exception 'START_DATE_REQUIRED'; end if;
  if not exists(select 1 from public.stores where id=p_store_id and is_active=true) then raise exception 'STORE_NOT_FOUND'; end if;
  v_emp:=public.admin_create_employee_for_store(trim(p_name),p_pin,p_store_id);
  select employee_no into v_employee_no from public.employees where id=v_emp;
  v_period:=public.admin_employment_period_set(null,v_emp,p_started_on,null,null);
  if coalesce((v_period->>'ok')::boolean,false) is not true then raise exception '%',coalesce(v_period->>'error','PERIOD_SAVE_FAILED'); end if;
  v_period_id:=(v_period->>'id')::bigint;
  v_contract:=public.admin_employment_contract_set(
    null,v_period_id,p_started_on,null,p_payroll_type,p_hourly_wage,p_monthly_salary,p_tax_treatment,
    p_business_deduction_rate,coalesce(p_night_allowance_enabled,false),p_night_allowance_mode,
    p_night_allowance_value,coalesce(p_night_allowance_start,time '22:00'),p_memo,coalesce(p_workdays,'[]'::jsonb)
  );
  if coalesce((v_contract->>'ok')::boolean,false) is not true then raise exception '%',coalesce(v_contract->>'error','CONTRACT_SAVE_FAILED'); end if;
  v_contract_id:=(v_contract->>'id')::bigint;
  update public.employees set
    wage=case when p_payroll_type='HOURLY' then p_hourly_wage else null end,
    tax_rate=case when p_tax_treatment='BUSINESS_INCOME' then p_business_deduction_rate else tax_rate end,
    memo=nullif(p_memo,'') where id=v_emp;
  return jsonb_build_object('ok',true,'employee_id',v_emp,'employee_no',v_employee_no,'period_id',v_period_id,'contract_id',v_contract_id,'store_id',p_store_id);
end
$function$;
revoke execute on function public.admin_create_employee_onboarding_for_store(text,text,date,text,integer,integer,text,numeric,boolean,text,numeric,time without time zone,text,jsonb,bigint) from public,anon;
grant execute on function public.admin_create_employee_onboarding_for_store(text,text,date,text,integer,integer,text,numeric,boolean,text,numeric,time without time zone,text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
