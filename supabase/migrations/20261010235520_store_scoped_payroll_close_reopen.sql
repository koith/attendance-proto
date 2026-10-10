-- Snapshot and re-open are now tenant/store-scoped.
CREATE OR REPLACE FUNCTION public.server_payroll_close_verified(p_store_id bigint, p_ym text, p_rows jsonb, p_fingerprint text, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE rec jsonb; n integer:=0; actor_email text; month_start date;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_store_id IS NULL OR p_actor_id IS NULL OR
 NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY')
 OR NOT EXISTS(
  SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor_id
    AND (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id))
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym IS NULL OR p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'BAD_YM'; END IF;
 month_start:=(p_ym||'-01')::date;
 IF month_start>=date_trunc('month',now() AT TIME ZONE 'Asia/Seoul')::date THEN
  RAISE EXCEPTION 'CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE'; END IF;
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 400
 THEN RAISE EXCEPTION 'INVALID_PAYROLL_ROWS'; END IF;
 IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'INVALID_PAYROLL_FINGERPRINT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||p_store_id||':'||p_ym,0));
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=p_store_id AND ym=p_ym AND status='CLOSED') OR
    EXISTS(SELECT 1 FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym)
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_rows) j
  WHERE jsonb_typeof(j)<>'object'
     OR NOT (j ?& ARRAY['employee_id','employee_name','hours','wage','weeks','base_pay','juhyu_pay','adjust','gross_pay','tax_rate','net_pay'])
 ) THEN RAISE EXCEPTION 'PAYROLL_ROW_FIELDS_MISSING'; END IF;
 IF (SELECT count(DISTINCT (j->>'employee_id')::bigint) FROM jsonb_array_elements(p_rows) j)<>jsonb_array_length(p_rows)
 THEN RAISE EXCEPTION 'DUPLICATE_PAYROLL_EMPLOYEE'; END IF;
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_rows) j
  LEFT JOIN public.employees e ON e.id=(j->>'employee_id')::bigint AND e.store_id=p_store_id
  WHERE e.id IS NULL
 ) THEN RAISE EXCEPTION 'PAYROLL_EMPLOYEE_STORE_MISMATCH'; END IF;
 SELECT u.email INTO actor_email FROM auth.users u WHERE u.id=p_actor_id;
 actor_email:=coalesce(actor_email,'verified-server');
 FOR rec IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF (rec->>'hours')::numeric<0 OR (rec->>'wage')::integer<0 OR
     (rec->>'weeks')::integer<0 OR (rec->>'base_pay')::integer<0 OR
     (rec->>'juhyu_pay')::integer<0 OR (rec->>'gross_pay')::integer<0 OR
     (rec->>'net_pay')::integer<0 OR (rec->>'net_pay')::integer>(rec->>'gross_pay')::integer OR
     (rec->>'tax_rate')::numeric NOT BETWEEN 0 AND 1 OR
     length(btrim(rec->>'employee_name'))=0
  THEN RAISE EXCEPTION 'PAYROLL_ROW_VALUE_INVALID'; END IF;
  INSERT INTO public.payroll_snapshot(store_id,ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_by)
  VALUES(p_store_id,p_ym,(rec->>'employee_id')::bigint,rec->>'employee_name',(rec->>'hours')::numeric,
   (rec->>'wage')::integer,(rec->>'weeks')::integer,(rec->>'base_pay')::integer,
   (rec->>'juhyu_pay')::integer,(rec->>'adjust')::integer,(rec->>'gross_pay')::integer,
   (rec->>'tax_rate')::numeric,(rec->>'net_pay')::integer,coalesce(rec->>'memo',''),p_fingerprint,actor_email);
  n:=n+1;
 END LOOP;
 INSERT INTO public.payroll_period(store_id,ym,status,updated_by,updated_at)
 VALUES(p_store_id,p_ym,'CLOSED',actor_email,now())
 ON CONFLICT(store_id,ym) DO UPDATE SET status='CLOSED',updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN jsonb_build_object('ok',true,'count',n,'fingerprint',p_fingerprint,'status','CLOSED');
END
$function$;

CREATE OR REPLACE FUNCTION public.server_payroll_reopen_verified(p_ym text, p_reason text, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n integer;actor_email text;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_actor_id IS NULL OR NOT EXISTS(
 SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor_id AND a.admin_role='HQ'
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym IS NULL OR p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR
    length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'REOPEN_REASON_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:1:'||p_ym,0));
 IF NOT EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=1 AND ym=p_ym AND status='CLOSED')
 THEN RAISE EXCEPTION 'PAYROLL_NOT_CLOSED'; END IF;
 INSERT INTO public.payroll_snapshot_reopen_audit(ym,snapshot,reopened_by,reopen_reason)
 SELECT p_ym,to_jsonb(s),p_actor_id,btrim(p_reason)
 FROM public.payroll_snapshot s WHERE s.store_id=1 AND s.ym=p_ym;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n=0 THEN RAISE EXCEPTION 'PAYROLL_SNAPSHOT_MISSING'; END IF;
 DELETE FROM public.payroll_snapshot WHERE store_id=1 AND ym=p_ym;
 SELECT u.email INTO actor_email FROM auth.users u WHERE u.id=p_actor_id;
 UPDATE public.payroll_period SET status='OPEN',updated_by=coalesce(actor_email,'verified-server'),updated_at=now() WHERE store_id=1 AND ym=p_ym;
 RETURN jsonb_build_object('ok',true,'status','OPEN','archived',n);
END
$function$;

CREATE OR REPLACE FUNCTION public.server_payroll_reopen_verified(p_store_id bigint, p_ym text, p_reason text, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n integer;actor_email text;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_store_id IS NULL OR p_actor_id IS NULL OR
 NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY')
 OR NOT EXISTS(
 SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor_id
   AND (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id))
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_ym IS NULL OR p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR
    length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'REOPEN_REASON_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||p_store_id||':'||p_ym,0));
 IF NOT EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=p_store_id AND ym=p_ym AND status='CLOSED')
 THEN RAISE EXCEPTION 'PAYROLL_NOT_CLOSED'; END IF;
 INSERT INTO public.payroll_snapshot_reopen_audit(store_id,ym,snapshot,reopened_by,reopen_reason)
 SELECT p_store_id,p_ym,to_jsonb(s),p_actor_id,btrim(p_reason)
 FROM public.payroll_snapshot s WHERE s.store_id=p_store_id AND s.ym=p_ym;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n=0 THEN RAISE EXCEPTION 'PAYROLL_SNAPSHOT_MISSING'; END IF;
 DELETE FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym;
 SELECT u.email INTO actor_email FROM auth.users u WHERE u.id=p_actor_id;
 UPDATE public.payroll_period SET status='OPEN',updated_by=coalesce(actor_email,'verified-server'),updated_at=now() WHERE store_id=p_store_id AND ym=p_ym;
 RETURN jsonb_build_object('ok',true,'status','OPEN','archived',n);
END
$function$;
REVOKE ALL ON FUNCTION public.server_payroll_reopen_verified(bigint,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_payroll_reopen_verified(bigint,text,text,uuid) TO service_role;
