-- Prevent old override RPCs from modifying a CLOSED payroll month.
CREATE OR REPLACE FUNCTION public.admin_set_period_employee(p_ym text, p_employee_id bigint, p_fields json)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE ym=p_ym AND status='CLOSED')
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
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE ym=p_ym AND status='CLOSED')
    THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  insert into payroll_period(ym, weeks, updated_by, updated_at)
    values (p_ym, p_weeks, coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym) do update set weeks=excluded.weeks, updated_by=excluded.updated_by, updated_at=now();
end; $function$;

