-- Edge v15 exclusively validates and writes weekly approvals through
-- approve_payroll_weekly_allowance_internal. Deny stale direct browser RPC.
REVOKE ALL ON FUNCTION public.approve_payroll_weekly_allowance(
  bigint,bigint,date,integer,integer,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payroll_weekly_allowance(
  bigint,bigint,date,integer,integer,text
) TO service_role;
