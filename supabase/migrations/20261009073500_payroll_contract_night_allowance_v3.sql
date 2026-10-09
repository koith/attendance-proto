-- v0.169: read contract night allowance settings for payroll without changing existing v2 callers.
create or replace function public.admin_store_payroll_contracts_v3(p_store_id bigint,p_month date)
returns table(employee_id bigint,contract_id bigint,payroll_type text,hourly_wage integer,monthly_salary integer,tax_treatment text,business_deduction_rate numeric,effective_from date,effective_to date,break_time_provided boolean,night_allowance_enabled boolean,night_allowance_mode text,night_allowance_value numeric,night_allowance_start time without time zone,night_allowance_end time without time zone)
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_start date:=date_trunc('month',p_month)::date;
        v_end date:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
begin
 if not public.can_manage_store(p_store_id) then raise exception 'NOT_AUTHORIZED'; end if;
 return query select distinct on (e.id)
 e.id,c.id,c.payroll_type,c.hourly_wage,c.monthly_salary,c.tax_treatment,
 c.business_deduction_rate,c.effective_from,c.effective_to,c.break_time_provided,
 c.night_allowance_enabled,c.night_allowance_mode,c.night_allowance_value,c.night_allowance_start,c.night_allowance_end
 from public.employees e
 join public.employment_periods ep on ep.employee_id=e.id
 join public.employment_contracts c on c.employment_period_id=ep.id
 where e.store_id=p_store_id
 and ep.started_on<=v_end and (ep.ended_on is null or ep.ended_on>=v_start)
 and c.effective_from<=v_end and (c.effective_to is null or c.effective_to>=v_start)
 order by e.id,c.effective_from desc,c.id desc;
end $function$;
revoke all on function public.admin_store_payroll_contracts_v3(bigint,date) from public,anon;
grant execute on function public.admin_store_payroll_contracts_v3(bigint,date) to authenticated,service_role;
