-- Append-only weekly approval / rejection / reapproval history with month-boundary freeze.
ALTER TABLE public.payroll_weekly_approvals ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'APPROVE';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='weekly_approval_decision_valid'
      AND conrelid='public.payroll_weekly_approvals'::regclass)
 THEN ALTER TABLE public.payroll_weekly_approvals
      ADD CONSTRAINT weekly_approval_decision_valid CHECK(decision IN ('APPROVE','REJECT','REAPPROVE')); END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.server_record_weekly_decision_verified(
 p_store_id bigint,p_employee_id bigint,p_week_start date,p_calculated_won integer,
 p_approved_won integer,p_reason text,p_decision text,p_actor_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE result_id bigint;ym1 text;ym2 text;prior_exists boolean;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'SERVICE_ONLY'; END IF;
 IF p_actor_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.admin_users a WHERE a.user_id=p_actor_id AND
   (a.admin_role='HQ' OR (a.admin_role='STORE_MANAGER' AND a.store_id=p_store_id))
 ) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id)
 THEN RAISE EXCEPTION 'EMPLOYEE_STORE_MISMATCH'; END IF;
 IF p_week_start IS NULL OR extract(isodow FROM p_week_start)<>1 OR
   p_calculated_won IS NULL OR p_calculated_won<0 OR p_approved_won IS NULL OR p_approved_won<0 OR
   length(btrim(coalesce(p_reason,'')))<3 OR
   p_decision NOT IN ('APPROVE','REJECT','REAPPROVE') OR p_decision IS NULL
 THEN RAISE EXCEPTION 'INVALID_WEEKLY_DECISION'; END IF;
 IF p_decision='REJECT' AND p_approved_won<>0 THEN RAISE EXCEPTION 'REJECT_REQUIRES_ZERO_WON'; END IF;
 IF (now() AT TIME ZONE 'Asia/Seoul') < (p_week_start::timestamp + interval '7 days 2 hours')
 THEN RAISE EXCEPTION 'WEEK_NOT_CLOSED'; END IF;
 ym1:=to_char(p_week_start,'YYYY-MM');
 ym2:=to_char(p_week_start+6,'YYYY-MM');
 -- Lock both affected months, same lock used by payroll closing.
 PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||ym1,0));
 IF ym2<>ym1 THEN PERFORM pg_advisory_xact_lock(hashtextextended('payroll-close:'||ym2,0)); END IF;
 IF EXISTS(SELECT 1 FROM public.payroll_period p WHERE p.ym IN (ym1,ym2) AND p.status='CLOSED')
 OR EXISTS(SELECT 1 FROM public.payroll_snapshot s WHERE s.employee_id=p_employee_id AND s.ym IN (ym1,ym2))
 THEN RAISE EXCEPTION 'PAYROLL_ALREADY_CLOSED'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.payroll_weekly_approvals a
  WHERE a.employee_id=p_employee_id AND a.store_id=p_store_id AND a.week_start=p_week_start)
 INTO prior_exists;
 IF p_decision='APPROVE' AND prior_exists THEN RAISE EXCEPTION 'REAPPROVAL_REQUIRED'; END IF;
 IF p_decision='REAPPROVE' AND NOT prior_exists THEN RAISE EXCEPTION 'INITIAL_APPROVAL_REQUIRED'; END IF;
 INSERT INTO public.payroll_weekly_approvals
 (store_id,employee_id,week_start,calculated_won,approved_won,reason,decision,approved_by)
 VALUES(p_store_id,p_employee_id,p_week_start,p_calculated_won,p_approved_won,btrim(p_reason),p_decision,p_actor_id)
 RETURNING id INTO result_id;
 RETURN result_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.server_record_weekly_decision_verified(bigint,bigint,date,integer,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_record_weekly_decision_verified(bigint,bigint,date,integer,integer,text,text,uuid) TO service_role;
