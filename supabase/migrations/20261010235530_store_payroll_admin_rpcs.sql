-- Store-aware replacement RPCs for payroll settings and snapshot reads.
CREATE OR REPLACE FUNCTION public.admin_store_payroll_period(p_store_id bigint,p_ym text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 RETURN (SELECT json_build_object(
  'period',coalesce((SELECT row_to_json(p) FROM public.payroll_period p
    WHERE p.ym=p_ym AND p.store_id=p_store_id),
    json_build_object('ym',p_ym,'store_id',p_store_id,'status','OPEN','weeks',null)),
  'overrides',coalesce((SELECT json_agg(row_to_json(o) ORDER BY o.employee_id)
   FROM public.payroll_period_employee o JOIN public.employees e ON e.id=o.employee_id
   WHERE o.ym=p_ym AND e.store_id=p_store_id),'[]'::json)
 ));
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_store_set_period_weeks(
 p_store_id bigint,p_ym text,p_weeks integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR p_weeks NOT BETWEEN 1 AND 6
 THEN RAISE EXCEPTION 'INVALID_PERIOD_WEEKS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||p_store_id||':'||p_ym,0));
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=p_store_id AND ym=p_ym AND status='CLOSED')
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 INSERT INTO public.payroll_period(store_id,ym,weeks,updated_by,updated_at)
 VALUES(p_store_id,p_ym,p_weeks,coalesce(auth.jwt()->>'email','admin'),now())
 ON CONFLICT(store_id,ym) DO UPDATE
 SET weeks=excluded.weeks,updated_by=excluded.updated_by,updated_at=now();
END $fn$;

CREATE OR REPLACE FUNCTION public.admin_store_snapshot(p_store_id bigint,p_ym text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
 RETURN (SELECT json_build_object(
  'status',coalesce((SELECT status FROM public.payroll_period WHERE store_id=p_store_id AND ym=p_ym),'OPEN'),
  'fingerprint',(SELECT source_fingerprint FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym LIMIT 1),
  'rows',coalesce((SELECT json_agg(row_to_json(s)) FROM
    (SELECT employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,
       net_pay,memo,closed_by,closed_at
     FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym ORDER BY employee_name)s),'[]'::json)
 ));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_store_payroll_period(bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_set_period_weeks(bigint,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_snapshot(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_payroll_period(bigint,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_store_set_period_weeks(bigint,text,integer) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_store_snapshot(bigint,text) TO authenticated,service_role;
