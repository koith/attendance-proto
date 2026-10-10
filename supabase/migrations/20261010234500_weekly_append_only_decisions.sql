-- Append-only manager decisions: APPROVE, REJECT (zero), then revised APPROVE.
-- Only the authenticated Edge service is permitted to request changes.
CREATE OR REPLACE FUNCTION public.approve_payroll_weekly_decision_internal(
 p_store_id bigint,p_employee_id bigint,p_week_start date,p_calculated_won integer,
 p_approved_won integer,p_reason text,p_approver_id uuid,p_decision text DEFAULT 'APPROVE'
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_id bigint; v_ym text;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_store_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND is_active)
 THEN RAISE EXCEPTION 'STORE_NOT_ACTIVE'; END IF;
 IF p_approver_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.admin_users a WHERE a.user_id=p_approver_id
    AND (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id))
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id)
 THEN RAISE EXCEPTION 'EMPLOYEE_STORE_MISMATCH'; END IF;
 IF p_decision NOT IN ('APPROVE','REJECT') OR
    p_week_start IS NULL OR EXTRACT(isodow FROM p_week_start)<>1 OR
    p_calculated_won IS NULL OR p_calculated_won<0 OR
    p_approved_won IS NULL OR p_approved_won<0 OR
    (p_decision='REJECT' AND p_approved_won<>0) OR
    LENGTH(BTRIM(COALESCE(p_reason,'')))<3
 THEN RAISE EXCEPTION 'INVALID_WEEKLY_DECISION'; END IF;
 IF (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul') <
      (p_week_start::timestamp+INTERVAL '7 days 2 hours')
 THEN RAISE EXCEPTION 'WEEK_NOT_CLOSED'; END IF;
 v_ym:=TO_CHAR(p_week_start,'YYYY-MM');
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||v_ym,0));
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE ym=v_ym AND status='CLOSED')
    OR EXISTS(SELECT 1 FROM public.payroll_snapshot s WHERE s.employee_id=p_employee_id AND s.ym=v_ym)
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 INSERT INTO public.payroll_weekly_approvals
  (store_id,employee_id,week_start,calculated_won,approved_won,reason,approved_by,decision)
 VALUES(p_store_id,p_employee_id,p_week_start,p_calculated_won,p_approved_won,
        BTRIM(p_reason),p_approver_id,p_decision)
 RETURNING id INTO v_id;
 RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.approve_payroll_weekly_decision_internal(bigint,bigint,date,integer,integer,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payroll_weekly_decision_internal(bigint,bigint,date,integer,integer,text,uuid,text) TO service_role;
-- Decommission the legacy approval entrypoint to avoid bypassing decision validation.
REVOKE ALL ON FUNCTION public.approve_payroll_weekly_allowance_internal(bigint,bigint,date,integer,integer,text,uuid) FROM PUBLIC,anon,authenticated;
