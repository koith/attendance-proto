-- SEC-S05 actual-host preflight. READ-ONLY: no DML, no call of production RPCs.
-- The companion HTTP test sends POST only to these ten SELECT-only,
-- anon-EXECUTE-denied functions. If this inventory changes, refuse to run
-- production live probes until each newly allowed function has been reviewed.
WITH names(proname) AS (
 VALUES
 ('admin_list_admins'),('admin_list_auth_users'),('admin_list_all_employees'),
 ('admin_employee_contract_statuses'),('admin_payroll_period'),
 ('admin_events'),('hq_store_catalog'),('store_limited_employee_list'),
 ('store_attendance_events'),('admin_store_payroll_contracts_v4')
), matched AS (
 SELECT names.proname, p.oid, p.prosecdef,
  p.prorettype::regtype::text AS return_type,
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) AS anon_exec,
  pg_get_functiondef(p.oid) AS body
 FROM names LEFT JOIN pg_proc p
 ON p.proname=names.proname AND p.pronamespace='public'::regnamespace
), result AS (
 SELECT count(DISTINCT proname)::int AS selected_names,
 count(oid)::int AS actual_signatures,
 count(*) FILTER(WHERE oid IS NULL)::int AS missing,
 count(*) FILTER(WHERE oid IS NOT NULL AND NOT prosecdef)::int AS not_security_definer,
 count(*) FILTER(WHERE anon_exec)::int AS anonymous_execute_allowed,
 count(*) FILTER(WHERE body ~* '(\mINSERT\M|\mUPDATE\M|\mDELETE\M|\mTRUNCATE\M|\mPERFORM\M|\mCALL\M)')::int AS possible_mutating_body,
 coalesce(array_agg(proname ORDER BY proname) FILTER(WHERE
  oid IS NULL OR anon_exec OR NOT prosecdef OR
  body ~* '(\mINSERT\M|\mUPDATE\M|\mDELETE\M|\mTRUNCATE\M|\mPERFORM\M|\mCALL\M)'
 ),ARRAY[]::text[]) AS unsafe_or_missing_functions
 FROM matched
)
SELECT * FROM result;
-- Acceptance: selected_names=10 actual_signatures=10; all other counts=0
-- and unsafe_or_missing_functions=[].
