create or replace function public.admin_create_employee(p_name text, p_pin text)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_id bigint;
  v_store_id bigint;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select id into v_store_id
  from public.stores
  where is_active=true
  order by case when id=1 then 0 else 1 end,id
  limit 1;
  if v_store_id is null then raise exception 'STORE_NOT_FOUND'; end if;
  insert into public.employees(name,pin_bcrypt,is_active,store_id)
  values(trim(p_name),crypt(p_pin,gen_salt('bf')),true,v_store_id)
  returning id into v_id;
  return v_id;
end
$function$;

create or replace function public.admin_create_employee_for_store(p_name text, p_pin text, p_store_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_id bigint;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'NAME_REQUIRED'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN_REQUIRED'; end if;
  if not exists(select 1 from public.stores where id=p_store_id and is_active=true) then raise exception 'STORE_NOT_FOUND'; end if;
  insert into public.employees(name,pin_bcrypt,is_active,store_id)
  values(trim(p_name),crypt(p_pin,gen_salt('bf')),true,p_store_id)
  returning id into v_id;
  return v_id;
end
$function$;

create or replace function public.admin_create_employee_onboarding_for_store(
  p_name text,
  p_pin text,
  p_started_on date,
  p_payroll_type text,
  p_hourly_wage integer,
  p_monthly_salary integer,
  p_tax_treatment text,
  p_business_deduction_rate numeric,
  p_night_allowance_enabled boolean,
  p_night_allowance_mode text,
  p_night_allowance_value numeric,
  p_night_allowance_start time without time zone,
  p_memo text,
  p_workdays jsonb,
  p_store_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_emp bigint;
  v_period jsonb;
  v_contract jsonb;
  v_period_id bigint;
  v_contract_id bigint;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'NAME_REQUIRED'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN_REQUIRED'; end if;
  if p_started_on is null then raise exception 'START_DATE_REQUIRED'; end if;
  if not exists(select 1 from public.stores where id=p_store_id and is_active=true) then raise exception 'STORE_NOT_FOUND'; end if;

  v_emp:=public.admin_create_employee_for_store(trim(p_name),p_pin,p_store_id);

  v_period:=public.admin_employment_period_set(null,v_emp,p_started_on,null,null);
  if coalesce((v_period->>'ok')::boolean,false) is not true then
    raise exception '%',coalesce(v_period->>'error','PERIOD_SAVE_FAILED');
  end if;
  v_period_id:=(v_period->>'id')::bigint;

  v_contract:=public.admin_employment_contract_set(
    null,v_period_id,p_started_on,null,p_payroll_type,p_hourly_wage,p_monthly_salary,
    p_tax_treatment,p_business_deduction_rate,coalesce(p_night_allowance_enabled,false),
    p_night_allowance_mode,p_night_allowance_value,coalesce(p_night_allowance_start,time '22:00'),
    p_memo,coalesce(p_workdays,'[]'::jsonb)
  );
  if coalesce((v_contract->>'ok')::boolean,false) is not true then
    raise exception '%',coalesce(v_contract->>'error','CONTRACT_SAVE_FAILED');
  end if;
  v_contract_id:=(v_contract->>'id')::bigint;

  update public.employees
  set wage=case when p_payroll_type='HOURLY' then p_hourly_wage else null end,
      tax_rate=case when p_tax_treatment='BUSINESS_INCOME' then p_business_deduction_rate else tax_rate end,
      memo=nullif(p_memo,'')
  where id=v_emp;

  return jsonb_build_object(
    'ok',true,'employee_id',v_emp,'period_id',v_period_id,
    'contract_id',v_contract_id,'store_id',p_store_id
  );
end
$function$;

revoke execute on function public.admin_create_employee(text,text) from public,anon;
revoke execute on function public.admin_create_employee_for_store(text,text,bigint) from public,anon;
revoke execute on function public.admin_create_employee_onboarding_for_store(text,text,date,text,integer,integer,text,numeric,boolean,text,numeric,time without time zone,text,jsonb,bigint) from public,anon;
grant execute on function public.admin_create_employee(text,text) to authenticated;
grant execute on function public.admin_create_employee_for_store(text,text,bigint) to authenticated;
grant execute on function public.admin_create_employee_onboarding_for_store(text,text,date,text,integer,integer,text,numeric,boolean,text,numeric,time without time zone,text,jsonb,bigint) to authenticated;
