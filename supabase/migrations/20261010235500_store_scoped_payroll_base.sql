-- Move singleton payroll state to a (store, month) key.
-- All historic rows (if any) retain the Inha store identifier 1.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'STAGED'
  CHECK (onboarding_status IN ('STAGED','READY','SUSPENDED'));
UPDATE public.stores SET onboarding_status='READY' WHERE id=1 AND onboarding_status='STAGED';
ALTER TABLE public.payroll_period ADD COLUMN IF NOT EXISTS store_id bigint NOT NULL DEFAULT 1 REFERENCES public.stores(id);
ALTER TABLE public.payroll_period DROP CONSTRAINT payroll_period_pkey;
ALTER TABLE public.payroll_period ADD CONSTRAINT payroll_period_pkey PRIMARY KEY (store_id,ym);
ALTER TABLE public.payroll_snapshot ADD COLUMN IF NOT EXISTS store_id bigint NOT NULL DEFAULT 1 REFERENCES public.stores(id);
ALTER TABLE public.payroll_snapshot_reopen_audit ADD COLUMN IF NOT EXISTS store_id bigint NOT NULL DEFAULT 1 REFERENCES public.stores(id);
CREATE INDEX IF NOT EXISTS payroll_snapshot_store_month_idx ON public.payroll_snapshot(store_id,ym);
CREATE INDEX IF NOT EXISTS payroll_reopen_audit_store_month_idx ON public.payroll_snapshot_reopen_audit(store_id,ym);
CREATE OR REPLACE FUNCTION public.admin_payroll_period(p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  return (select json_build_object(
    'period', coalesce((select row_to_json(p) from payroll_period p where p.ym=p_ym and p.store_id=1),
                       json_build_object('ym',p_ym,'status','OPEN','weeks',null)),
    'overrides', coalesce((select json_agg(row_to_json(o)) from payroll_period_employee o join public.employees e on e.id=o.employee_id where o.ym=p_ym and e.store_id=1),'[]'::json)));
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_period_employee(p_ym text, p_employee_id bigint, p_fields json)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE ym=p_ym AND store_id=(SELECT store_id FROM public.employees WHERE id=p_employee_id) AND status='CLOSED')
    THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 
  IF NOT public.can_manage_store((SELECT e.store_id FROM public.employees e WHERE e.id=p_employee_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  insert into payroll_period_employee(ym, employee_id,
      wage_override, juhyu_hours_override, juhyu_weeks_override, tax_rate_override, adjust_amount, memo, updated_by, updated_at)
    values (p_ym, p_employee_id,
      nullif(p_fields->>'wage_override','')::int,
      nullif(p_fields->>'juhyu_hours_override','')::numeric,
      nullif(p_fields->>'juhyu_weeks_override','')::int,
      nullif(p_fields->>'tax_rate_override','')::numeric,
      coalesce(nullif(p_fields->>'adjust_amount','')::int,0),
      nullif(p_fields->>'memo',''),
      coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym, employee_id) do update set
      wage_override=excluded.wage_override,
      juhyu_hours_override=excluded.juhyu_hours_override,
      juhyu_weeks_override=excluded.juhyu_weeks_override,
      tax_rate_override=excluded.tax_rate_override,
      adjust_amount=excluded.adjust_amount,
      memo=excluded.memo, updated_by=excluded.updated_by, updated_at=now();
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_period_weeks(p_ym text, p_weeks integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE ym=p_ym AND store_id=1 AND status='CLOSED')
    THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  insert into payroll_period(store_id,ym, weeks, updated_by, updated_at)
    values (1,p_ym, p_weeks, coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (store_id,ym) do update set weeks=excluded.weeks, updated_by=excluded.updated_by, updated_at=now();
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
    'status', coalesce((select status from payroll_period where ym=p_ym and store_id=1),'OPEN'),
    'fingerprint', (select source_fingerprint from payroll_snapshot where ym=p_ym and store_id=1 limit 1),
    'rows', coalesce((select json_agg(row_to_json(s)) from (
      select employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,closed_by,closed_at
      from payroll_snapshot where ym=p_ym and store_id=1 order by employee_name) s),'[]'::json)));
end; $function$;

