-- Retire obsolete service-only weekly decision entrypoints after the
-- store-scoped, append-only canonical RPC became the sole Edge caller.
-- Do not drop functions or touch any historic employee/approval/payroll rows.
-- These older paths lacked all current store-scoped close and READY checks.
-- This revocation is safe to reapply and reversible if a verified consumer appears.
REVOKE ALL ON FUNCTION public.approve_payroll_weekly_allowance(
  bigint,bigint,date,integer,integer,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.approve_payroll_weekly_allowance_internal(
  bigint,bigint,date,integer,integer,text,uuid
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.server_record_weekly_decision_verified(
  bigint,bigint,date,integer,integer,text,text,uuid
) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve execute permission for the replacement RPC used by server-sync-sheet:
-- approve_payroll_weekly_decision_internal(bigint,bigint,date,integer,integer,text,uuid,text)
