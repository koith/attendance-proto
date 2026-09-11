-- schema_v16_employment_contracts.sql
-- Additive semantic employment/payroll contract model.
-- Does NOT infer/backfill legacy employment periods or contracts.

create table if not exists public.employment_periods (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.employees(id),
  started_on date not null,
  ended_on date null,
  note text null,
  created_by_email text null,
  updated_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_period_dates_ck check (ended_on is null or ended_on >= started_on)
);

create index if not exists employment_periods_employee_idx
  on public.employment_periods(employee_id, started_on, ended_on);

create table if not exists public.employment_contracts (
  id bigint generated always as identity primary key,
  employment_period_id bigint not null references public.employment_periods(id) on delete restrict,
  effective_from date not null,
  effective_to date null,
  payroll_type text not null,
  hourly_wage integer null,
  monthly_salary integer null,
  weekly_contracted_minutes integer not null default 0,
  tax_treatment text not null,
  business_deduction_rate numeric null,
  night_allowance_enabled boolean not null default false,
  night_allowance_mode text null,
  night_allowance_value numeric null,
  night_allowance_start time without time zone not null default time '22:00',
  memo text null,
  created_by_email text null,
  updated_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_contract_dates_ck check (effective_to is null or effective_to >= effective_from),
  constraint employment_contract_payroll_type_ck check (payroll_type in ('HOURLY','MONTHLY')),
  constraint employment_contract_tax_treatment_ck check (tax_treatment in ('BUSINESS_INCOME','FOUR_INSURANCE')),
  constraint employment_contract_wage_ck check (
    (payroll_type='HOURLY' and hourly_wage is not null and hourly_wage > 0 and monthly_salary is null)
    or
    (payroll_type='MONTHLY' and monthly_salary is not null and monthly_salary > 0 and hourly_wage is null)
  ),
  constraint employment_contract_weekly_minutes_ck check (weekly_contracted_minutes >= 0),
  constraint employment_contract_business_rate_ck check (
    (tax_treatment='BUSINESS_INCOME' and business_deduction_rate is not null and business_deduction_rate >= 0 and business_deduction_rate <= 1)
    or
    (tax_treatment='FOUR_INSURANCE' and business_deduction_rate is null)
  ),
  constraint employment_contract_night_ck check (
    (night_allowance_enabled=false and night_allowance_mode is null and night_allowance_value is null)
    or
    (night_allowance_enabled=true and night_allowance_mode in ('RATE','FLAT') and night_allowance_value is not null and night_allowance_value >= 0)
  )
);

create index if not exists employment_contracts_period_idx
  on public.employment_contracts(employment_period_id, effective_from, effective_to);

create table if not exists public.employment_contract_workdays (
  contract_id bigint not null references public.employment_contracts(id) on delete cascade,
  weekday smallint not null,
  planned_start time without time zone not null,
  planned_end time without time zone not null,
  contracted_minutes integer not null,
  primary key (contract_id, weekday),
  constraint employment_contract_workdays_weekday_ck check (weekday between 0 and 6),
  constraint employment_contract_workdays_minutes_ck check (contracted_minutes > 0 and contracted_minutes < 1440),
  constraint employment_contract_workdays_time_ck check (planned_start <> planned_end)
);

create table if not exists public.absence_decisions (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.employees(id),
  work_date date not null,
  decision text not null default 'NEEDS_REVIEW',
  note text null,
  decided_by_email text null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(employee_id, work_date),
  constraint absence_decision_ck check (decision in ('NEEDS_REVIEW','UNEXCUSED','NOT_UNEXCUSED'))
);

alter table public.employment_periods enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.employment_contract_workdays enable row level security;
alter table public.absence_decisions enable row level security;

create or replace function public._contract_minutes(p_start time, p_end time)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_start = p_end then 0
    when p_end > p_start then floor(extract(epoch from (p_end-p_start))/60)::integer
    else floor((extract(epoch from (time '24:00' - p_start)) + extract(epoch from p_end))/60)::integer
  end;
$$;

create or replace function public.admin_employment_bundle(p_employee_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id) then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  select jsonb_build_object(
    'periods', coalesce((select jsonb_agg(to_jsonb(p) order by p.started_on desc, p.id desc) from public.employment_periods p where p.employee_id=p_employee_id),'[]'::jsonb),
    'contracts', coalesce((select jsonb_agg(to_jsonb(c) order by c.effective_from desc, c.id desc)
      from public.employment_contracts c join public.employment_periods p on p.id=c.employment_period_id where p.employee_id=p_employee_id),'[]'::jsonb),
    'workdays', coalesce((select jsonb_agg(to_jsonb(w) order by w.contract_id,w.weekday)
      from public.employment_contract_workdays w join public.employment_contracts c on c.id=w.contract_id join public.employment_periods p on p.id=c.employment_period_id where p.employee_id=p_employee_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_employment_period_set(
  p_id bigint,
  p_employee_id bigint,
  p_started_on date,
  p_ended_on date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint; v_actor text := coalesce(auth.jwt()->>'email','');
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id) then return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if;
  if p_started_on is null or (p_ended_on is not null and p_ended_on<p_started_on) then return jsonb_build_object('ok',false,'error','BAD_PERIOD_DATES'); end if;
  if exists(
    select 1 from public.employment_periods x
    where x.employee_id=p_employee_id and (p_id is null or x.id<>p_id)
      and daterange(x.started_on, coalesce(x.ended_on,'infinity'::date),'[]') && daterange(p_started_on,coalesce(p_ended_on,'infinity'::date),'[]')
  ) then return jsonb_build_object('ok',false,'error','PERIOD_OVERLAP'); end if;
  if p_id is null then
    insert into public.employment_periods(employee_id,started_on,ended_on,note,created_by_email,updated_by_email)
    values(p_employee_id,p_started_on,p_ended_on,nullif(p_note,''),v_actor,v_actor) returning id into v_id;
  else
    update public.employment_periods set started_on=p_started_on, ended_on=p_ended_on, note=nullif(p_note,''), updated_by_email=v_actor, updated_at=now()
    where id=p_id and employee_id=p_employee_id returning id into v_id;
    if v_id is null then return jsonb_build_object('ok',false,'error','PERIOD_NOT_FOUND'); end if;
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.admin_employment_contract_set(
  p_id bigint,
  p_employment_period_id bigint,
  p_effective_from date,
  p_effective_to date,
  p_payroll_type text,
  p_hourly_wage integer,
  p_monthly_salary integer,
  p_tax_treatment text,
  p_business_deduction_rate numeric,
  p_night_allowance_enabled boolean,
  p_night_allowance_mode text,
  p_night_allowance_value numeric,
  p_night_allowance_start time,
  p_memo text,
  p_workdays jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint; v_actor text := coalesce(auth.jwt()->>'email','');
  v_period public.employment_periods%rowtype;
  v_w jsonb; v_weekday int; v_start time; v_end time; v_min int; v_total int := 0;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into v_period from public.employment_periods where id=p_employment_period_id;
  if not found then return jsonb_build_object('ok',false,'error','PERIOD_NOT_FOUND'); end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from) then return jsonb_build_object('ok',false,'error','BAD_CONTRACT_DATES'); end if;
  if p_effective_from < v_period.started_on or (v_period.ended_on is not null and coalesce(p_effective_to,p_effective_from)>v_period.ended_on) then return jsonb_build_object('ok',false,'error','CONTRACT_OUTSIDE_EMPLOYMENT'); end if;
  if p_payroll_type not in ('HOURLY','MONTHLY') then return jsonb_build_object('ok',false,'error','BAD_PAYROLL_TYPE'); end if;
  if p_payroll_type='HOURLY' and (coalesce(p_hourly_wage,0)<=0 or p_monthly_salary is not null) then return jsonb_build_object('ok',false,'error','HOURLY_WAGE_REQUIRED'); end if;
  if p_payroll_type='MONTHLY' and (coalesce(p_monthly_salary,0)<=0 or p_hourly_wage is not null) then return jsonb_build_object('ok',false,'error','MONTHLY_SALARY_REQUIRED'); end if;
  if p_tax_treatment not in ('BUSINESS_INCOME','FOUR_INSURANCE') then return jsonb_build_object('ok',false,'error','BAD_TAX_TREATMENT'); end if;
  if p_tax_treatment='BUSINESS_INCOME' and (p_business_deduction_rate is null or p_business_deduction_rate<0 or p_business_deduction_rate>1) then return jsonb_build_object('ok',false,'error','BAD_BUSINESS_RATE'); end if;
  if p_tax_treatment='FOUR_INSURANCE' and p_business_deduction_rate is not null then return jsonb_build_object('ok',false,'error','FOUR_INSURANCE_RATE_MUST_BE_NULL'); end if;
  if coalesce(p_night_allowance_enabled,false) and (p_night_allowance_mode not in ('RATE','FLAT') or p_night_allowance_value is null or p_night_allowance_value<0) then return jsonb_build_object('ok',false,'error','BAD_NIGHT_ALLOWANCE'); end if;
  if jsonb_typeof(coalesce(p_workdays,'[]'::jsonb)) <> 'array' then return jsonb_build_object('ok',false,'error','BAD_WORKDAYS'); end if;

  if p_payroll_type='HOURLY' then
    for v_w in select value from jsonb_array_elements(coalesce(p_workdays,'[]'::jsonb)) loop
      begin
        v_weekday := (v_w->>'weekday')::int; v_start := (v_w->>'start')::time; v_end := (v_w->>'end')::time;
      exception when others then return jsonb_build_object('ok',false,'error','BAD_WORKDAY_ROW'); end;
      if v_weekday<0 or v_weekday>6 or v_start=v_end then return jsonb_build_object('ok',false,'error','BAD_WORKDAY_ROW'); end if;
      v_min := public._contract_minutes(v_start,v_end);
      if v_min<=0 then return jsonb_build_object('ok',false,'error','BAD_WORKDAY_ROW'); end if;
      v_total := v_total + v_min;
    end loop;
  else
    if jsonb_array_length(coalesce(p_workdays,'[]'::jsonb))>0 then return jsonb_build_object('ok',false,'error','MONTHLY_WORKDAYS_NOT_SUPPORTED'); end if;
  end if;

  if exists(
    select 1 from public.employment_contracts x
    where x.employment_period_id=p_employment_period_id and (p_id is null or x.id<>p_id)
      and daterange(x.effective_from,coalesce(x.effective_to,'infinity'::date),'[]') && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]')
  ) then return jsonb_build_object('ok',false,'error','CONTRACT_OVERLAP'); end if;

  if p_id is null then
    insert into public.employment_contracts(employment_period_id,effective_from,effective_to,payroll_type,hourly_wage,monthly_salary,weekly_contracted_minutes,tax_treatment,business_deduction_rate,night_allowance_enabled,night_allowance_mode,night_allowance_value,night_allowance_start,memo,created_by_email,updated_by_email)
    values(p_employment_period_id,p_effective_from,p_effective_to,p_payroll_type,p_hourly_wage,p_monthly_salary,v_total,p_tax_treatment,case when p_tax_treatment='BUSINESS_INCOME' then p_business_deduction_rate else null end,coalesce(p_night_allowance_enabled,false),case when p_night_allowance_enabled then p_night_allowance_mode else null end,case when p_night_allowance_enabled then p_night_allowance_value else null end,coalesce(p_night_allowance_start,time '22:00'),nullif(p_memo,''),v_actor,v_actor)
    returning id into v_id;
  else
    update public.employment_contracts set effective_from=p_effective_from,effective_to=p_effective_to,payroll_type=p_payroll_type,hourly_wage=p_hourly_wage,monthly_salary=p_monthly_salary,weekly_contracted_minutes=v_total,tax_treatment=p_tax_treatment,business_deduction_rate=case when p_tax_treatment='BUSINESS_INCOME' then p_business_deduction_rate else null end,night_allowance_enabled=coalesce(p_night_allowance_enabled,false),night_allowance_mode=case when p_night_allowance_enabled then p_night_allowance_mode else null end,night_allowance_value=case when p_night_allowance_enabled then p_night_allowance_value else null end,night_allowance_start=coalesce(p_night_allowance_start,time '22:00'),memo=nullif(p_memo,''),updated_by_email=v_actor,updated_at=now()
    where id=p_id and employment_period_id=p_employment_period_id returning id into v_id;
    if v_id is null then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
    delete from public.employment_contract_workdays where contract_id=v_id;
  end if;

  if p_payroll_type='HOURLY' then
    for v_w in select value from jsonb_array_elements(coalesce(p_workdays,'[]'::jsonb)) loop
      v_weekday := (v_w->>'weekday')::int; v_start := (v_w->>'start')::time; v_end := (v_w->>'end')::time; v_min := public._contract_minutes(v_start,v_end);
      insert into public.employment_contract_workdays(contract_id,weekday,planned_start,planned_end,contracted_minutes)
      values(v_id,v_weekday,v_start,v_end,v_min);
    end loop;
  end if;
  return jsonb_build_object('ok',true,'id',v_id,'weekly_contracted_minutes',v_total);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','DUPLICATE_WORKDAY');
end;
$$;

create or replace function public.admin_contract_weekly_preview(p_contract_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.employment_contracts%rowtype; v_minutes numeric; v_pay numeric;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into c from public.employment_contracts where id=p_contract_id;
  if not found then return jsonb_build_object('ok',false,'error','CONTRACT_NOT_FOUND'); end if;
  if c.payroll_type<>'HOURLY' then return jsonb_build_object('ok',true,'candidate',false,'reason','MONTHLY_POLICY_UNDEFINED'); end if;
  v_minutes := c.weekly_contracted_minutes / 5.0;
  v_pay := (v_minutes/60.0) * c.hourly_wage;
  return jsonb_build_object('ok',true,'candidate',c.weekly_contracted_minutes>=900,'weekly_contracted_minutes',c.weekly_contracted_minutes,'base_weekly_holiday_minutes',v_minutes,'base_weekly_holiday_pay',round(v_pay),'policy_pending',jsonb_build_array('J1_MONTH_BOUNDARY','J2_PARTIAL_EMPLOYMENT_WEEK','UNEXCUSED_WEEK_ENTITLEMENT_APPLICATION'));
end;
$$;

create or replace function public.admin_absence_decision_set(p_employee_id bigint,p_work_date date,p_decision text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint; v_actor text:=coalesce(auth.jwt()->>'email','');
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id) then return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if;
  if p_decision not in ('NEEDS_REVIEW','UNEXCUSED','NOT_UNEXCUSED') then return jsonb_build_object('ok',false,'error','BAD_DECISION'); end if;
  insert into public.absence_decisions(employee_id,work_date,decision,note,decided_by_email,decided_at)
  values(p_employee_id,p_work_date,p_decision,nullif(p_note,''),v_actor,now())
  on conflict(employee_id,work_date) do update set decision=excluded.decision,note=excluded.note,decided_by_email=excluded.decided_by_email,decided_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.admin_absence_decisions(p_from date,p_to date,p_employee_id bigint default null)
returns setof public.absence_decisions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query select * from public.absence_decisions d
    where d.work_date between p_from and p_to and (p_employee_id is null or d.employee_id=p_employee_id)
    order by d.work_date,d.employee_id;
end;
$$;

revoke all on public.employment_periods from anon, authenticated;
revoke all on public.employment_contracts from anon, authenticated;
revoke all on public.employment_contract_workdays from anon, authenticated;
revoke all on public.absence_decisions from anon, authenticated;

grant execute on function public.admin_employment_bundle(bigint) to authenticated;
grant execute on function public.admin_employment_period_set(bigint,bigint,date,date,text) to authenticated;
grant execute on function public.admin_employment_contract_set(bigint,bigint,date,date,text,integer,integer,text,numeric,boolean,text,numeric,time,text,jsonb) to authenticated;
grant execute on function public.admin_contract_weekly_preview(bigint) to authenticated;
grant execute on function public.admin_absence_decision_set(bigint,date,text,text) to authenticated;
grant execute on function public.admin_absence_decisions(date,date,bigint) to authenticated;
