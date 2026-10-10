-- Only server-computed and independently authenticated weekly approvals may be stored.
CREATE OR REPLACE FUNCTION public.approve_payroll_weekly_allowance_internal(
  p_store_id bigint, p_employee_id bigint, p_week_start date,
  p_calculated_won integer, p_approved_won integer, p_reason text, p_approver_id uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id bigint;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_approver_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.admin_users a WHERE a.user_id=p_approver_id
     AND (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id))
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id)
 THEN RAISE EXCEPTION 'EMPLOYEE_STORE_MISMATCH'; END IF;
 IF p_week_start IS NULL OR EXTRACT(isodow FROM p_week_start)<>1 OR
    p_calculated_won IS NULL OR p_calculated_won<0 OR
    p_approved_won IS NULL OR p_approved_won<0 OR
    LENGTH(BTRIM(COALESCE(p_reason,'')))<3
 THEN RAISE EXCEPTION 'INVALID_WEEKLY_APPROVAL'; END IF;
 IF (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul') <
      (p_week_start::timestamp + INTERVAL '7 days 2 hours')
 THEN RAISE EXCEPTION 'WEEK_NOT_CLOSED'; END IF;
 IF EXISTS(SELECT 1 FROM public.payroll_snapshot s WHERE s.employee_id=p_employee_id
           AND s.ym=TO_CHAR(p_week_start,'YYYY-MM'))
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 INSERT INTO public.payroll_weekly_approvals
    (store_id,employee_id,week_start,calculated_won,approved_won,reason,approved_by)
 VALUES(p_store_id,p_employee_id,p_week_start,p_calculated_won,p_approved_won,p_reason,p_approver_id)
 RETURNING id INTO v_id;
 RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.approve_payroll_weekly_allowance_internal(bigint,bigint,date,integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payroll_weekly_allowance_internal(bigint,bigint,date,integer,integer,text,uuid) TO service_role;
