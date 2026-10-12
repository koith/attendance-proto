-- PAY-01: make legitimate future month close atomically self-verifying.
-- Existing operator/store/month authorization, source fingerprint, non-null pay
-- guards and itemized allowances are preserved from the latest production RPC.
-- No test payroll is written to the live database.
-- A mismatch raises before commit: neither period nor rows survive.
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
 -- Required payroll fields must be non-NULL JSON numbers. JSON objects with
 -- present keys but null values previously passed the IF/OR numeric checks
 -- under SQL three-valued logic and could create incomplete close snapshots.
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_rows) j
  WHERE jsonb_typeof(j->'employee_name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(j->'employee_id') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'hours') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'wage') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'weeks') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'base_pay') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'juhyu_pay') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'adjust') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'gross_pay') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'tax_rate') IS DISTINCT FROM 'number'
     OR jsonb_typeof(j->'net_pay') IS DISTINCT FROM 'number'
 ) THEN RAISE EXCEPTION 'PAYROLL_ROW_NONNUMERIC_OR_NULL'; END IF;
 -- Optional only during rolling upgrades. Newly deployed Edge always sends
 -- all five component fields. Explicit malformed values fail instead of
 -- silently becoming 0원.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_rows) j WHERE
    (j ? 'night_allowance_won' AND jsonb_typeof(j->'night_allowance_won') IS DISTINCT FROM 'number') OR
    (j ? 'break_compensation_won' AND jsonb_typeof(j->'break_compensation_won') IS DISTINCT FROM 'number') OR
    (j ? 'substitution_pay_won' AND jsonb_typeof(j->'substitution_pay_won') IS DISTINCT FROM 'number') OR
    (j ? 'night_allowance_label' AND jsonb_typeof(j->'night_allowance_label') IS DISTINCT FROM 'string') OR
    (j ? 'break_mode' AND jsonb_typeof(j->'break_mode') IS DISTINCT FROM 'string')
 ) THEN RAISE EXCEPTION 'PAYROLL_ALLOWANCE_COMPONENT_INVALID'; END IF;
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
     COALESCE((rec->>'night_allowance_won')::numeric,0)<0 OR
     COALESCE((rec->>'break_compensation_won')::numeric,0)<0 OR
     COALESCE((rec->>'substitution_pay_won')::numeric,0)<0 OR
     (rec ? 'night_allowance_label' AND length(rec->>'night_allowance_label')>160) OR
     (rec ? 'break_mode' AND rec->>'break_mode' NOT IN ('PROVIDED','NOT_PROVIDED','IGNORED')) OR
     length(btrim(rec->>'employee_name'))=0
  THEN RAISE EXCEPTION 'PAYROLL_ROW_VALUE_INVALID'; END IF;
  INSERT INTO public.payroll_snapshot(store_id,ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_by,
    night_allowance_won,break_compensation_won,substitution_pay_won,night_allowance_label,break_mode)
  VALUES(p_store_id,p_ym,(rec->>'employee_id')::bigint,rec->>'employee_name',(rec->>'hours')::numeric,
   (rec->>'wage')::integer,(rec->>'weeks')::integer,(rec->>'base_pay')::integer,
   (rec->>'juhyu_pay')::integer,(rec->>'adjust')::integer,(rec->>'gross_pay')::integer,
   (rec->>'tax_rate')::numeric,(rec->>'net_pay')::integer,coalesce(rec->>'memo',''),p_fingerprint,actor_email,
   (rec->>'night_allowance_won')::integer,(rec->>'break_compensation_won')::integer,(rec->>'substitution_pay_won')::integer,
   rec->>'night_allowance_label',rec->>'break_mode');
  n:=n+1;
 END LOOP;
 INSERT INTO public.payroll_period(store_id,ym,status,updated_by,updated_at)
 VALUES(p_store_id,p_ym,'CLOSED',actor_email,now())
 ON CONFLICT(store_id,ym) DO UPDATE SET status='CLOSED',updated_by=excluded.updated_by,updated_at=excluded.updated_at;

 -- PAY-01: verify the persisted receipt within the SAME transaction.
 -- A trigger, column drift or truncated insert must abort the entire close.
 -- This is not a second write and never recomputes already closed salaries.
 IF (SELECT count(*) FROM public.payroll_snapshot
       WHERE store_id=p_store_id AND ym=p_ym)<>n
    OR NOT EXISTS (
      SELECT 1 FROM public.payroll_period
      WHERE store_id=p_store_id AND ym=p_ym AND status='CLOSED'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_rows) AS j(value)
      LEFT JOIN public.payroll_snapshot s
        ON s.store_id=p_store_id AND s.ym=p_ym
           AND s.employee_id=(j.value->>'employee_id')::bigint
      WHERE s.employee_id IS NULL
        OR s.employee_name IS DISTINCT FROM (j.value->>'employee_name')
        OR s.hours IS DISTINCT FROM (j.value->>'hours')::numeric
        OR s.wage IS DISTINCT FROM (j.value->>'wage')::integer
        OR s.weeks IS DISTINCT FROM (j.value->>'weeks')::integer
        OR s.base_pay IS DISTINCT FROM (j.value->>'base_pay')::integer
        OR s.juhyu_pay IS DISTINCT FROM (j.value->>'juhyu_pay')::integer
        OR s.adjust IS DISTINCT FROM (j.value->>'adjust')::integer
        OR s.gross_pay IS DISTINCT FROM (j.value->>'gross_pay')::integer
        OR s.tax_rate IS DISTINCT FROM (j.value->>'tax_rate')::numeric
        OR s.net_pay IS DISTINCT FROM (j.value->>'net_pay')::integer
        OR s.memo IS DISTINCT FROM coalesce(j.value->>'memo','')
        OR s.night_allowance_won IS DISTINCT FROM (j.value->>'night_allowance_won')::integer
        OR s.break_compensation_won IS DISTINCT FROM (j.value->>'break_compensation_won')::integer
        OR s.substitution_pay_won IS DISTINCT FROM (j.value->>'substitution_pay_won')::integer
        OR s.night_allowance_label IS DISTINCT FROM (j.value->>'night_allowance_label')
        OR s.break_mode IS DISTINCT FROM (j.value->>'break_mode')
        OR s.source_fingerprint IS DISTINCT FROM p_fingerprint
        OR s.closed_by IS DISTINCT FROM actor_email
        OR s.closed_at IS NULL
    )
 THEN RAISE EXCEPTION 'PAYROLL_SNAPSHOT_READBACK_MISMATCH'; END IF;
 RETURN jsonb_build_object('ok',true,'count',n,'fingerprint',p_fingerprint,'status','CLOSED');
END
$function$;
