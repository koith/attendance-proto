-- Enforce the closed-week invariant at the database boundary too.
-- The Edge API checks this, but authenticated administrators can call the RPC directly.
CREATE OR REPLACE FUNCTION public.approve_payroll_weekly_allowance(
  p_store_id bigint, p_employee_id bigint, p_week_start date,
  p_calculated_won integer, p_approved_won integer, p_reason text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.admin_users a WHERE a.user_id=auth.uid()
     AND (a.admin_role='HQ' OR a.store_id=p_store_id)
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id)
 THEN RAISE EXCEPTION 'EMPLOYEE_STORE_MISMATCH'; END IF;
 IF p_week_start IS NULL OR EXTRACT(isodow FROM p_week_start)<>1 OR
    p_calculated_won IS NULL OR p_calculated_won<0 OR
    p_approved_won IS NULL OR p_approved_won<0 OR LENGTH(BTRIM(COALESCE(p_reason,'')))<3
 THEN RAISE EXCEPTION 'INVALID_WEEKLY_APPROVAL'; END IF;
 -- Seoul-local Monday 02:00 following the completed Sunday is the settlement cutoff.
 IF (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul') <
      (p_week_start::timestamp + INTERVAL '7 days 2 hours')
 THEN RAISE EXCEPTION 'WEEK_NOT_CLOSED'; END IF;
 IF EXISTS(SELECT 1 FROM public.payroll_snapshot s WHERE s.employee_id=p_employee_id
           AND s.ym=TO_CHAR(p_week_start,'YYYY-MM'))
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 INSERT INTO public.payroll_weekly_approvals
   (store_id,employee_id,week_start,calculated_won,approved_won,reason,approved_by)
 VALUES(p_store_id,p_employee_id,p_week_start,p_calculated_won,p_approved_won,p_reason,auth.uid())
 RETURNING id INTO v_id;
 RETURN v_id;
END $function$;
