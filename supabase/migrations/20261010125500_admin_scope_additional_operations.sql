-- Store-scoped operation authorization without touching user data.
CREATE OR REPLACE FUNCTION public.admin_absence_decision_set(p_employee_id bigint, p_work_date date, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_id bigint; v_actor text:=coalesce(auth.jwt()->>'email',''); begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; if not exists(select 1 from public.employees where id=p_employee_id) then return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if; if p_decision not in ('NEEDS_REVIEW','UNEXCUSED','NOT_UNEXCUSED') then return jsonb_build_object('ok',false,'error','BAD_DECISION'); end if; insert into public.absence_decisions(employee_id,work_date,decision,note,decided_by_email,decided_at) values(p_employee_id,p_work_date,p_decision,nullif(p_note,''),v_actor,now()) on conflict(employee_id,work_date) do update set decision=excluded.decision,note=excluded.note,decided_by_email=excluded.decided_by_email,decided_at=now() returning id into v_id; return jsonb_build_object('ok',true,'id',v_id); end; $function$;

CREATE OR REPLACE FUNCTION public.admin_absence_decisions(p_from date, p_to date, p_employee_id bigint DEFAULT NULL::bigint)
 RETURNS SETOF absence_decisions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin IF NOT (CASE WHEN p_employee_id IS NULL THEN public.is_hq_admin() ELSE public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) END) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; return query select * from public.absence_decisions d where d.work_date between p_from and p_to and (p_employee_id is null or d.employee_id=p_employee_id) order by d.work_date,d.employee_id; end; $function$;

CREATE OR REPLACE FUNCTION public.admin_close_payroll(p_ym text, p_rows json, p_fingerprint text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor text; r json; n int:=0; v_month date;
begin
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 if p_ym !~ '^\\d{4}-\\d{2}$' then raise exception 'BAD_YM'; end if;
 v_month:=(p_ym||'-01')::date;
 if v_month>=date_trunc('month',now() at time zone 'Asia/Seoul')::date then raise exception 'CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE'; end if;
 if exists(select 1 from public.payroll_period where ym=p_ym and status='CLOSED') then raise exception 'PAYROLL_ALREADY_CLOSED'; end if;
 v_actor:=coalesce(auth.jwt()->>'email','admin');
 delete from public.payroll_snapshot where ym=p_ym;
 for r in select * from json_array_elements(p_rows) loop
   insert into public.payroll_snapshot(ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_by)
   values(p_ym,(r->>'employee_id')::bigint,r->>'employee_name',nullif(r->>'hours','')::numeric,nullif(r->>'wage','')::int,nullif(r->>'weeks','')::int,
   nullif(r->>'base_pay','')::int,nullif(r->>'juhyu_pay','')::int,coalesce(nullif(r->>'adjust','')::int,0),nullif(r->>'gross_pay','')::int,
   nullif(r->>'tax_rate','')::numeric,nullif(r->>'net_pay','')::int,r->>'memo',p_fingerprint,v_actor);
   n:=n+1;
 end loop;
 insert into public.payroll_period(ym,status,updated_by,updated_at) values(p_ym,'CLOSED',v_actor,now())
 on conflict(ym) do update set status='CLOSED',updated_by=v_actor,updated_at=now();
 return json_build_object('ok',true,'count',n);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_contract_break_mode_set(p_contract_id bigint, p_break_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_break_mode not in ('PROVIDED','NOT_PROVIDED','IGNORED') or p_break_mode is null then
    return jsonb_build_object('ok',false,'error','INVALID_BREAK_MODE');
  end if;
  update public.employment_contracts set
    break_provision_mode=p_break_mode,
    break_time_provided=(p_break_mode='PROVIDED'),
    updated_by_email=coalesce(auth.jwt()->>'email',''),
    updated_at=now()
  where id=p_contract_id;
  if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',p_contract_id,'break_provision_mode',p_break_mode);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_contract_break_policy_set(p_contract_id bigint, p_break_time_provided boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  update public.employment_contracts
     set break_time_provided=coalesce(p_break_time_provided,false),
         updated_by_email=coalesce(auth.jwt()->>'email',''),
         updated_at=now()
   where id=p_contract_id;
  if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',p_contract_id,'break_time_provided',coalesce(p_break_time_provided,false));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_contract_doc_add(p_employee_id bigint, p_contract_id bigint, p_storage_path text, p_filename text, p_content_type text, p_byte_size integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint; v_actor text;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) OR NOT EXISTS(SELECT 1 FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id WHERE c.id=p_contract_id AND ep.employee_id=p_employee_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if not exists (
    select 1 from public.employment_contracts c
    join public.employment_periods p on p.id=c.employment_period_id
    where c.id=p_contract_id and p.employee_id=p_employee_id
  ) then
    return json_build_object('ok',false,'error','CONTRACT_NOT_FOUND');
  end if;
  if p_storage_path is null
     or split_part(p_storage_path,'/',1) <> p_employee_id::text
     or length(split_part(p_storage_path,'/',2)) = 0
     or split_part(p_storage_path,'/',3) <> ''
     or (length(p_storage_path) - length(replace(p_storage_path,'/',''))) <> 1
  then return json_build_object('ok',false,'error','PATH_INVALID'); end if;
  if p_filename is null or length(trim(p_filename))=0 then return json_build_object('ok',false,'error','FILENAME_REQUIRED'); end if;
  if p_content_type not in ('application/pdf','image/jpeg','image/png') then return json_build_object('ok',false,'error','UNSUPPORTED_TYPE'); end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then return json_build_object('ok',false,'error','SIZE_INVALID'); end if;
  insert into public.employee_documents(employee_id,contract_id,storage_path,filename,content_type,byte_size,uploaded_by_email)
  values(p_employee_id,p_contract_id,p_storage_path,p_filename,p_content_type,p_byte_size,v_actor)
  returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_contract_doc_list(p_employee_id bigint, p_contract_id bigint)
 RETURNS TABLE(id bigint, filename text, content_type text, byte_size integer, storage_path text, uploaded_by_email text, uploaded_at timestamp with time zone, contract_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) OR NOT EXISTS(SELECT 1 FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id WHERE c.id=p_contract_id AND ep.employee_id=p_employee_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if not exists (
    select 1
    from public.employment_contracts c
    join public.employment_periods p on p.id=c.employment_period_id
    where c.id=p_contract_id and p.employee_id=p_employee_id
  ) then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  return query
    select d.id,d.filename,d.content_type,d.byte_size,d.storage_path,d.uploaded_by_email,d.uploaded_at,d.contract_id
    from public.employee_documents d
    where d.employee_id=p_employee_id and d.contract_id=p_contract_id
    order by d.uploaded_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_contract_night_end_set(p_contract_id bigint, p_night_allowance_end time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor text; v_id bigint;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_night_allowance_end is null then return jsonb_build_object('ok',false,'error','BAD_NIGHT_END'); end if;
  actor:=coalesce(auth.jwt()->>'email','admin');
  update public.employment_contracts set night_allowance_end=p_night_allowance_end,updated_by_email=actor,updated_at=now() where id=p_contract_id returning id into v_id;
  if v_id is null then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  return jsonb_build_object('ok',true,'id',v_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_contract_weekly_preview(p_contract_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare c public.employment_contracts%rowtype; v_minutes numeric; v_pay numeric; begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employment_contracts c JOIN public.employment_periods ep ON ep.id=c.employment_period_id JOIN public.employees e ON e.id=ep.employee_id WHERE c.id=p_contract_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; select * into c from public.employment_contracts where id=p_contract_id; if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if; if c.payroll_type<>'HOURLY' then return jsonb_build_object('ok',true,'candidate',false,'reason','MONTHLY_POLICY_UNDEFINED'); end if; v_minutes:=c.weekly_contracted_minutes/5.0; v_pay:=(v_minutes/60.0)*c.hourly_wage; return jsonb_build_object('ok',true,'candidate',c.weekly_contracted_minutes>=900,'weekly_contracted_minutes',c.weekly_contracted_minutes,'base_weekly_holiday_minutes',v_minutes,'base_weekly_holiday_pay',round(v_pay),'policy_pending',jsonb_build_array('J1_MONTH_BOUNDARY','J2_PARTIAL_EMPLOYMENT_WEEK','UNEXCUSED_WEEK_ENTITLEMENT_APPLICATION')); end; $function$;

CREATE OR REPLACE FUNCTION public.admin_doc_add(p_employee_id bigint, p_storage_path text, p_filename text, p_content_type text, p_byte_size integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id bigint; v_actor text;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if not exists (select 1 from public.employees e where e.id = p_employee_id) then
    return json_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND');
  end if;
  -- canonical path 검증: "{employee_id}/{object_name}" 정확히 2 segment.
  if p_storage_path is null
     or split_part(p_storage_path,'/',1) <> p_employee_id::text
     or length(split_part(p_storage_path,'/',2)) = 0
     or split_part(p_storage_path,'/',3) <> ''
     or (length(p_storage_path) - length(replace(p_storage_path,'/',''))) <> 1
  then
    return json_build_object('ok',false,'error','PATH_INVALID');
  end if;
  if p_filename is null or length(trim(p_filename))=0 then
    return json_build_object('ok',false,'error','FILENAME_REQUIRED');
  end if;
  if p_content_type not in ('application/pdf','image/jpeg','image/png') then
    return json_build_object('ok',false,'error','UNSUPPORTED_TYPE');
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then
    return json_build_object('ok',false,'error','SIZE_INVALID');
  end if;
  insert into public.employee_documents(employee_id,storage_path,filename,content_type,byte_size,uploaded_by_email)
    values (p_employee_id,p_storage_path,p_filename,p_content_type,p_byte_size,v_actor)
    returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_doc_delete(p_document_id bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row public.employee_documents%rowtype;
begin
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  select * into v_row from public.employee_documents where id=p_document_id;
  if not found then return json_build_object('ok',false,'error','DOC_NOT_FOUND'); end if;
 IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=v_row.employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  delete from public.employee_documents where id=p_document_id;
  return json_build_object('ok',true,'storage_path',v_row.storage_path);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_doc_list(p_employee_id bigint)
 RETURNS TABLE(id bigint, filename text, content_type text, byte_size integer, storage_path text, uploaded_by_email text, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select d.id, d.filename, d.content_type, d.byte_size, d.storage_path, d.uploaded_by_email, d.uploaded_at
    from public.employee_documents d
    where d.employee_id = p_employee_id
    order by d.uploaded_at desc;
end; $function$;

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

CREATE OR REPLACE FUNCTION public.admin_employment_period_set(p_id bigint, p_employee_id bigint, p_started_on date, p_ended_on date DEFAULT NULL::date, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ declare v_id bigint; v_actor text:=coalesce(auth.jwt()->>'email',''); begin IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF; if not exists(select 1 from public.employees where id=p_employee_id) then return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if; if p_started_on is null or (p_ended_on is not null and p_ended_on<p_started_on) then return jsonb_build_object('ok',false,'error','BAD_PERIOD_DATES'); end if; if exists(select 1 from public.employment_periods x where x.employee_id=p_employee_id and (p_id is null or x.id<>p_id) and daterange(x.started_on,coalesce(x.ended_on,'infinity'::date),'[]') && daterange(p_started_on,coalesce(p_ended_on,'infinity'::date),'[]')) then return jsonb_build_object('ok',false,'error','PERIOD_OVERLAP'); end if; if p_id is not null and exists(select 1 from public.employment_contracts c where c.employment_period_id=p_id and (c.effective_from<p_started_on or (p_ended_on is not null and (c.effective_to is null or c.effective_to>p_ended_on)))) then return jsonb_build_object('ok',false,'error','PERIOD_CONTRACT_CONFLICT'); end if; if p_id is null then insert into public.employment_periods(employee_id,started_on,ended_on,note,created_by_email,updated_by_email) values(p_employee_id,p_started_on,p_ended_on,nullif(p_note,''),v_actor,v_actor) returning id into v_id; else update public.employment_periods set started_on=p_started_on,ended_on=p_ended_on,note=nullif(p_note,''),updated_by_email=v_actor,updated_at=now() where id=p_id and employee_id=p_employee_id returning id into v_id; if v_id is null then return jsonb_build_object('ok',false,'error','PERIOD_NOT_FOUND'); end if; end if; return jsonb_build_object('ok',true,'id',v_id); end; $function$;

CREATE OR REPLACE FUNCTION public.admin_payroll_period(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return (select json_build_object(
    'period', coalesce((select row_to_json(p) from payroll_period p where p.ym=p_ym),
                       json_build_object('ym',p_ym,'status','OPEN','weeks',null)),
    'overrides', coalesce((select json_agg(row_to_json(o)) from payroll_period_employee o where o.ym=p_ym),'[]'::json)));
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_reopen_payroll(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor text;
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  update payroll_period set status='OPEN', updated_by=v_actor, updated_at=now() where ym=p_ym;
  return json_build_object('ok',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_request(p_request_id bigint, p_approve boolean, p_reject_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r correction_requests%rowtype; v_actor text; v_action text;
begin
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 v_actor:=coalesce(auth.jwt()->>'email','admin');
 select * into r from correction_requests where id=p_request_id and status='PENDING';
 if not found then return json_build_object('ok',false,'error','NOT_FOUND_OR_RESOLVED'); end if;
 IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=r.employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 if p_approve then
   if r.kind='MISSING_OUT' or r.kind='MISSING_IN' then v_action:='ADD'; else v_action:='EDIT_TIME'; end if;
   insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
   values(r.event_id,r.employee_id,v_action,
          case when r.requested_at is null then null else (r.requested_at at time zone 'Asia/Seoul') at time zone 'UTC' end,
          coalesce(r.requested_type,case when r.kind='MISSING_OUT' then 'OUT' when r.kind='MISSING_IN' then 'IN' else null end),
          '직원 정정요청 승인: '||coalesce(r.note,''),v_actor);
   update correction_requests set status='APPROVED',resolved_by=v_actor,resolved_at=now() where id=p_request_id;
   return json_build_object('ok',true,'status','APPROVED');
 else
   update correction_requests set status='REJECTED',resolved_by=v_actor,resolved_at=now(),reject_reason=p_reject_reason where id=p_request_id;
   return json_build_object('ok',true,'status','REJECTED');
 end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_schedule_batch(p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor text;
  v_item jsonb;
  v_op text;
  v_status text;
  v_employee_id bigint;
  v_work_date date;
  v_start time;
  v_end time;
  v_memo text;
  v_rowcount integer;
  v_applied integer := 0;
  v_set_count integer := 0;
  v_delete_count integer := 0;
begin
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    return jsonb_build_object('ok',false,'error','BAD_PAYLOAD');
  end if;
  if jsonb_array_length(p_changes) > 500 then
    return jsonb_build_object('ok',false,'error','TOO_MANY_CHANGES');
  end if;

  -- Pass 1: validate the complete batch before any write.
  for v_item in select value from jsonb_array_elements(p_changes)
  loop
    begin
      v_op := upper(coalesce(v_item->>'op','SET'));
      v_employee_id := nullif(v_item->>'employee_id','')::bigint;
      v_work_date := nullif(v_item->>'work_date','')::date;
    exception when others then
      return jsonb_build_object('ok',false,'error','BAD_ITEM','item',v_item);
    end;

    if v_employee_id is null or v_work_date is null then
      return jsonb_build_object('ok',false,'error','EMPLOYEE_DATE_REQUIRED','item',v_item);
    end if;
    IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=v_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
    if not exists (select 1 from public.employees where id=v_employee_id) then
      return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND','employee_id',v_employee_id);
    end if;

    if v_op = 'DELETE' then
      continue;
    elsif v_op <> 'SET' then
      return jsonb_build_object('ok',false,'error','BAD_OP','item',v_item);
    end if;

    v_status := upper(coalesce(v_item->>'status',''));
    if v_status not in ('WORK','OFF') then
      return jsonb_build_object('ok',false,'error','BAD_STATUS','item',v_item);
    end if;

    if v_status = 'WORK' then
      begin
        v_start := nullif(v_item->>'planned_start','')::time;
        v_end := nullif(v_item->>'planned_end','')::time;
      exception when others then
        return jsonb_build_object('ok',false,'error','BAD_TIME','item',v_item);
      end;
      if v_start is null or v_end is null then
        return jsonb_build_object('ok',false,'error','TIME_REQUIRED','item',v_item);
      end if;
      if v_start = v_end then
        return jsonb_build_object('ok',false,'error','ZERO_DURATION','item',v_item);
      end if;
    end if;
  end loop;

  -- Pass 2: apply only after the whole batch has passed validation.
  v_actor := coalesce(auth.jwt()->>'email','admin');
  for v_item in select value from jsonb_array_elements(p_changes)
  loop
    v_op := upper(coalesce(v_item->>'op','SET'));
    v_employee_id := (v_item->>'employee_id')::bigint;
    v_work_date := (v_item->>'work_date')::date;

    if v_op = 'DELETE' then
      delete from public.work_schedules
      where employee_id=v_employee_id and work_date=v_work_date;
      get diagnostics v_rowcount = row_count;
      v_delete_count := v_delete_count + v_rowcount;
      v_applied := v_applied + v_rowcount;
      continue;
    end if;

    v_status := upper(v_item->>'status');
    v_memo := nullif(trim(coalesce(v_item->>'memo','')),'');
    if v_status = 'WORK' then
      v_start := (v_item->>'planned_start')::time;
      v_end := (v_item->>'planned_end')::time;
    else
      v_start := null;
      v_end := null;
    end if;

    insert into public.work_schedules(
      employee_id,work_date,status,planned_start,planned_end,memo,updated_by_email,updated_at
    ) values (
      v_employee_id,v_work_date,v_status,v_start,v_end,v_memo,v_actor,now()
    )
    on conflict (employee_id,work_date) do update set
      status=excluded.status,
      planned_start=excluded.planned_start,
      planned_end=excluded.planned_end,
      memo=excluded.memo,
      updated_by_email=excluded.updated_by_email,
      updated_at=now()
    where (work_schedules.status,work_schedules.planned_start,work_schedules.planned_end,work_schedules.memo)
      is distinct from
      (excluded.status,excluded.planned_start,excluded.planned_end,excluded.memo);

    get diagnostics v_rowcount = row_count;
    v_set_count := v_set_count + v_rowcount;
    v_applied := v_applied + v_rowcount;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'requested',jsonb_array_length(p_changes),
    'applied',v_applied,
    'set_count',v_set_count,
    'delete_count',v_delete_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_schedule_delete(p_employee_id bigint, p_work_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_del int;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  delete from public.work_schedules where employee_id=p_employee_id and work_date=p_work_date;
  get diagnostics v_del = row_count;
  return json_build_object('ok',true,'deleted',v_del);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_schedule_list(p_from date, p_to date)
 RETURNS TABLE(id bigint, employee_id bigint, work_date date, status text, planned_start time without time zone, planned_end time without time zone, memo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select w.id,w.employee_id,w.work_date,w.status,w.planned_start,w.planned_end,w.memo
    from public.work_schedules w
    where w.work_date >= p_from and w.work_date <= p_to
    order by w.work_date, w.employee_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_schedule_set(p_employee_id bigint, p_work_date date, p_status text, p_start time without time zone, p_end time without time zone, p_memo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor text; v_start time; v_end time;
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if p_status not in ('WORK','OFF') then return json_build_object('ok',false,'error','BAD_STATUS'); end if;
  if not exists (select 1 from public.employees where id=p_employee_id) then
    return json_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if;
  if p_status='WORK' then
    if p_start is null or p_end is null then return json_build_object('ok',false,'error','TIME_REQUIRED'); end if;
    if p_start = p_end then return json_build_object('ok',false,'error','ZERO_DURATION'); end if;
    v_start:=p_start; v_end:=p_end;
  else
    v_start:=null; v_end:=null;   -- OFF: 시각 없음 (CHECK도 강제)
  end if;
  insert into public.work_schedules(employee_id,work_date,status,planned_start,planned_end,memo,updated_by_email,updated_at)
    values (p_employee_id,p_work_date,p_status,v_start,v_end,nullif(trim(coalesce(p_memo,'')),''),v_actor,now())
  on conflict (employee_id,work_date) do update set
    status=excluded.status, planned_start=excluded.planned_start, planned_end=excluded.planned_end,
    memo=excluded.memo, updated_by_email=excluded.updated_by_email, updated_at=now();
  return json_build_object('ok',true);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_period_weeks(p_ym text, p_weeks integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  insert into payroll_period(ym, weeks, updated_by, updated_at)
    values (p_ym, p_weeks, coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym) do update set weeks=excluded.weeks, updated_by=excluded.updated_by, updated_at=now();
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_snapshot(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return (select json_build_object(
    'status', coalesce((select status from payroll_period where ym=p_ym),'OPEN'),
    'fingerprint', (select source_fingerprint from payroll_snapshot where ym=p_ym limit 1),
    'rows', coalesce((select json_agg(row_to_json(s)) from (
      select employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,closed_by,closed_at
      from payroll_snapshot where ym=p_ym order by employee_name) s),'[]'::json)));
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_unclassified_doc_list(p_employee_id bigint)
 RETURNS TABLE(id bigint, filename text, content_type text, byte_size integer, storage_path text, uploaded_by_email text, uploaded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return query
    select d.id,d.filename,d.content_type,d.byte_size,d.storage_path,d.uploaded_by_email,d.uploaded_at
    from public.employee_documents d
    where d.employee_id=p_employee_id and d.contract_id is null
    order by d.uploaded_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_store_schedule_list(p_store_id bigint,p_from date,p_to date)
RETURNS TABLE(id bigint,employee_id bigint,work_date date,status text,planned_start time without time zone,
 planned_end time without time zone,memo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>400 THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
 RETURN QUERY SELECT w.id,w.employee_id,w.work_date,w.status,w.planned_start,w.planned_end,w.memo
 FROM public.work_schedules w JOIN public.employees e ON e.id=w.employee_id
 WHERE e.store_id=p_store_id AND w.work_date>=p_from AND w.work_date<=p_to
 ORDER BY w.work_date,w.employee_id;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_store_schedule_list(bigint,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_schedule_list(bigint,date,date) TO authenticated,service_role;
