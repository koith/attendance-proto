CREATE OR REPLACE FUNCTION public.admin_store_payroll_period(p_store_id bigint, p_ym text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 RETURN (SELECT json_build_object(
  'store_ready',coalesce((SELECT s.is_active AND s.onboarding_status='READY' FROM public.stores s WHERE s.id=p_store_id),false),
  'period',coalesce((SELECT row_to_json(p) FROM public.payroll_period p
    WHERE p.ym=p_ym AND p.store_id=p_store_id),
    json_build_object('ym',p_ym,'store_id',p_store_id,'status','OPEN','weeks',null)),
  'overrides',coalesce((SELECT json_agg(row_to_json(o) ORDER BY o.employee_id)
   FROM public.payroll_period_employee o JOIN public.employees e ON e.id=o.employee_id
   WHERE o.ym=p_ym AND e.store_id=p_store_id),'[]'::json)
 ));
END $function$;