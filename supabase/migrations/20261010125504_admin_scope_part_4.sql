-- Bounded, independently deployable store authorization hardening.
CREATE OR REPLACE FUNCTION public.admin_employee_contract_statuses()
 RETURNS TABLE(employee_id bigint, contract_registered boolean, contract_effective boolean, document_attached boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
  select e.id,
    exists(select 1 from employment_periods ep join employment_contracts c on c.employment_period_id=ep.id where ep.employee_id=e.id),
    exists(select 1 from employment_periods ep join employment_contracts c on c.employment_period_id=ep.id
      where ep.employee_id=e.id and c.effective_from<=current_date and (c.effective_to is null or c.effective_to>=current_date)),
    exists(select 1 from employee_documents d where d.employee_id=e.id)
  from employees e
  where e.is_active=true
  order by e.name;
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_employment_bundle(p_employee_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_result jsonb; begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; if not exists(select 1 from public.employees where id=p_employee_id) then raise exception 'EMPLOYEE_NOT_FOUND'; end if; select jsonb_build_object('periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.started_on desc,p.id desc) from public.employment_periods p where p.employee_id=p_employee_id),'[]'::jsonb),'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from desc,c.id desc) from public.employment_contracts c join public.employment_periods p on p.id=c.employment_period_id where p.employee_id=p_employee_id),'[]'::jsonb),'workdays',coalesce((select jsonb_agg(to_jsonb(w) order by w.contract_id,w.weekday) from public.employment_contract_workdays w join public.employment_contracts c on c.id=w.contract_id join public.employment_periods p on p.id=c.employment_period_id where p.employee_id=p_employee_id),'[]'::jsonb)) into v_result; return v_result; end; $function$;


CREATE OR REPLACE FUNCTION public.admin_employment_contract_set(p_id bigint, p_employment_period_id bigint, p_effective_from date, p_effective_to date, p_payroll_type text, p_hourly_wage integer, p_monthly_salary integer, p_tax_treatment text, p_business_deduction_rate numeric, p_night_allowance_enabled boolean, p_night_allowance_mode text, p_night_allowance_value numeric, p_night_allowance_start time without time zone, p_memo text, p_workdays jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_id bigint; v_actor text:=coalesce(auth.jwt()->>'email',''); v_period public.employment_periods%rowtype; v_w jsonb; v_weekday int; v_start time; v_end time; v_min int; v_total int:=0; begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_periods ep JOIN public.employees e ON e.id=ep.employee_id WHERE ep.id=p_employment_period_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; select * into v_period from public.employment_periods where id=p_employment_period_id; if not found then return jsonb_build_object('ok',false,'error','PERIOD_NOT_FOUND'); end if; if p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from) then return jsonb_build_object('ok',false,'error','BAD_CONTRACT_DATES'); end if; if p_effective_from<v_period.started_on or (v_period.ended_on is not null and (p_effective_to is null or p_effective_to>v_period.ended_on)) then return jsonb_build_object('ok',false,'error','CONTRACT_OUTSIDE_EMPLOYMENT'); end if; if p_payroll_type not in ('HOURLY','MONTHLY') then return jsonb_build_object('ok',false,'error','BAD_PAYROLL_TYPE'); end if; if p_payroll_type='HOURLY' and (coalesce(p_hourly_wage,0)<=0 or p_monthly_salary is not null) then return jsonb_build_object('ok',false,'error','HOURLY_WAGE_REQUIRED'); end if; if p_payroll_type='MONTHLY' and (coalesce(p_monthly_salary,0)<=0 or p_hourly_wage is not null) then return jsonb_build_object('ok',false,'error','MONTHLY_SALARY_REQUIRED'); end if; if p_tax_treatment not in ('BUSINESS_INCOME','FOUR_INSURANCE') then return jsonb_build_object('ok',false,'error','BAD_TAX_TREATMENT'); end if; if p_tax_treatment='BUSINESS_INCOME' and (p_business_deduction_rate is null or p_business_deduction_rate<0 or p_business_deduction_rate>1) then return jsonb_build_object('ok',false,'error','BAD_BUSINESS_RATE'); end if; if p_tax_treatment='FOUR_INSURANCE' and p_business_deduction_rate is not null then return jsonb_build_object('ok',false,'error','FOUR_INSURANCE_RATE_MUST_BE_NULL'); end if; if coalesce(p_night_allowance_enabled,false) and (p_night_allowance_mode not in ('RATE','FLAT') or p_night_allowance_value is null or p_night_allowance_value<0) then return jsonb_build_object('ok',false,'error','BAD_NIGHT_ALLOWANCE'); end if; if jsonb_typeof(coalesce(p_workdays,'[]'::jsonb))<>'array' then return jsonb_build_object('ok',false,'error','BAD_WORKDAYS'); end if; if p_payroll_type='HOURLY' then if jsonb_array_length(coalesce(p_workdays,'[]'::jsonb))=0 then return jsonb_build_object('ok',false,'error','WORKDAYS_REQUIRED'); end if; for v_w in select value from jsonb_array_elements(coalesce(p_workdays,'[]'::jsonb)) loop begin v_weekday:=(v_w->>'weekday')::int; v_start:=(v_w->>'start')::time; v_end:=(v_w->>'end')::time; exception when others then return jsonb_build_object('ok',false,'error','BAD_WORKDAY_ROW'); end; if v_weekday<0 or v_weekday>6 or v_start=v_end then return jsonb_build_object('ok',false,'error','BAD_WORKDAY_ROW'); end if; v_min:=public._contract_minutes(v_start,v_end); if v_min<=0 then return jsonb_build_object('ok',false,'error','BAD_WORKDAY_ROW'); end if; v_total:=v_total+v_min; end loop; else if jsonb_array_length(coalesce(p_workdays,'[]'::jsonb))>0 then return jsonb_build_object('ok',false,'error','MONTHLY_WORKDAYS_NOT_SUPPORTED'); end if; end if; if exists(select 1 from public.employment_contracts x where x.employment_period_id=p_employment_period_id and (p_id is null or x.id<>p_id) and daterange(x.effective_from,coalesce(x.effective_to,'infinity'::date),'[]') && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]')) then return jsonb_build_object('ok',false,'error','CONTRACT_OVERLAP'); end if; if p_id is null then insert into public.employment_contracts(employment_period_id,effective_from,effective_to,payroll_type,hourly_wage,monthly_salary,weekly_contracted_minutes,tax_treatment,business_deduction_rate,night_allowance_enabled,night_allowance_mode,night_allowance_value,night_allowance_start,memo,created_by_email,updated_by_email) values(p_employment_period_id,p_effective_from,p_effective_to,p_payroll_type,p_hourly_wage,p_monthly_salary,v_total,p_tax_treatment,case when p_tax_treatment='BUSINESS_INCOME' then p_business_deduction_rate else null end,coalesce(p_night_allowance_enabled,false),case when p_night_allowance_enabled then p_night_allowance_mode else null end,case when p_night_allowance_enabled then p_night_allowance_value else null end,coalesce(p_night_allowance_start,time '22:00'),nullif(p_memo,''),v_actor,v_actor) returning id into v_id; else update public.employment_contracts set effective_from=p_effective_from,effective_to=p_effective_to,payroll_type=p_payroll_type,hourly_wage=p_hourly_wage,monthly_salary=p_monthly_salary,weekly_contracted_minutes=v_total,tax_treatment=p_tax_treatment,business_deduction_rate=case when p_tax_treatment='BUSINESS_INCOME' then p_business_deduction_rate else null end,night_allowance_enabled=coalesce(p_night_allowance_enabled,false),night_allowance_mode=case when p_night_allowance_enabled then p_night_allowance_mode else null end,night_allowance_value=case when p_night_allowance_enabled then p_night_allowance_value else null end,night_allowance_start=coalesce(p_night_allowance_start,time '22:00'),memo=nullif(p_memo,''),updated_by_email=v_actor,updated_at=now() where id=p_id and employment_period_id=p_employment_period_id returning id into v_id; if v_id is null then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if; delete from public.employment_contract_workdays where contract_id=v_id; end if; if p_payroll_type='HOURLY' then for v_w in select value from jsonb_array_elements(coalesce(p_workdays,'[]'::jsonb)) loop v_weekday:=(v_w->>'weekday')::int; v_start:=(v_w->>'start')::time; v_end:=(v_w->>'end')::time; v_min:=public._contract_minutes(v_start,v_end); insert into public.employment_contract_workdays(contract_id,weekday,planned_start,planned_end,contracted_minutes) values(v_id,v_weekday,v_start,v_end,v_min); end loop; end if; return jsonb_build_object('ok',true,'id',v_id,'weekly_contracted_minutes',v_total); exception when unique_violation then return jsonb_build_object('ok',false,'error','DUPLICATE_WORKDAY'); end; $function$;


CREATE OR REPLACE FUNCTION public.admin_employment_period_contract_create(p_employee_id bigint, p_started_on date, p_ended_on date, p_period_note text, p_effective_from date, p_effective_to date, p_payroll_type text, p_hourly_wage integer, p_monthly_salary integer, p_tax_treatment text, p_business_deduction_rate numeric, p_night_allowance_enabled boolean, p_night_allowance_mode text, p_night_allowance_value numeric, p_night_allowance_start time without time zone, p_contract_memo text, p_workdays jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_period jsonb;
  v_contract jsonb;
  v_msg text;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

  begin
    v_period := public.admin_employment_period_set(
      null, p_employee_id, p_started_on, p_ended_on, p_period_note
    );
    if not coalesce((v_period->>'ok')::boolean,false) then
      raise exception 'ATOMIC_PERIOD:%', coalesce(v_period->>'error','SAVE_FAILED');
    end if;

    v_contract := public.admin_employment_contract_set(
      null,
      (v_period->>'id')::bigint,
      p_effective_from,
      p_effective_to,
      p_payroll_type,
      p_hourly_wage,
      p_monthly_salary,
      p_tax_treatment,
      p_business_deduction_rate,
      p_night_allowance_enabled,
      p_night_allowance_mode,
      p_night_allowance_value,
      p_night_allowance_start,
      p_contract_memo,
      p_workdays
    );
    if not coalesce((v_contract->>'ok')::boolean,false) then
      raise exception 'ATOMIC_CONTRACT:%', coalesce(v_contract->>'error','SAVE_FAILED');
    end if;

    return jsonb_build_object(
      'ok',true,
      'period_id',(v_period->>'id')::bigint,
      'contract_id',(v_contract->>'id')::bigint,
      'weekly_contracted_minutes',v_contract->'weekly_contracted_minutes'
    );
  exception when raise_exception then
    v_msg := sqlerrm;
    if v_msg like 'ATOMIC_PERIOD:%' then
      return jsonb_build_object('ok',false,'error',substring(v_msg from 15));
    elsif v_msg like 'ATOMIC_CONTRACT:%' then
      return jsonb_build_object('ok',false,'error',substring(v_msg from 17));
    end if;
    raise;
  end;
end;
$function$;

