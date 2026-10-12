-- A closed month must be rendered from immutable salary evidence, not a
-- recalculation of mutable attendance or employee contract rows.
-- Preserve the existing store manager/HQ authorization and scoped month key.
CREATE OR REPLACE FUNCTION public.admin_store_snapshot(p_store_id bigint, p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 RETURN (SELECT json_build_object(
  'status',coalesce((SELECT status FROM public.payroll_period WHERE store_id=p_store_id AND ym=p_ym),'OPEN'),
  'fingerprint',(SELECT source_fingerprint FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym LIMIT 1),
  'rows',coalesce((SELECT json_agg(row_to_json(s)) FROM
    (SELECT employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,
       net_pay,memo,closed_by,closed_at,
       night_allowance_won,break_compensation_won,substitution_pay_won,night_allowance_label,break_mode
     FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym ORDER BY employee_name)s),'[]'::json)
 ));
END $function$;
