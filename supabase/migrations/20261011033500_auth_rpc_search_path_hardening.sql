-- Explicit search_path and deny anonymous entry to authenticated admin RPCs.
ALTER FUNCTION public._contract_break_mode_legacy_sync()
 SET search_path TO 'public','pg_temp';
REVOKE ALL ON FUNCTION public.admin_attendance_break_decision_save(bigint,bigint,bigint,boolean,boolean)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_attendance_break_decisions(bigint,timestamp without time zone,timestamp without time zone)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_contract_break_policy_set(bigint,boolean)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_payroll_contracts_v2(bigint,date)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_attendance_break_decision_save(bigint,bigint,bigint,boolean,boolean),
 public.admin_attendance_break_decisions(bigint,timestamp without time zone,timestamp without time zone),
 public.admin_contract_break_policy_set(bigint,boolean),
 public.admin_store_payroll_contracts_v2(bigint,date)
 TO authenticated,service_role;
