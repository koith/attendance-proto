-- Reconcile server-side PostgREST pre-request EXECUTE grants (deployment sheet 42501).
-- This is deliberately a privilege-only patch: the administrator session guard,
-- auth.session revocation, RLS and private latest_session table remain untouched.
-- All PostgREST roles, including service_role, invoke db_pre_request.
-- The service_role JWT is not an admin-user session and returns early in
-- session_guard.require_latest_session(). No session policy is bypassed for users.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'SERVICE_ROLE_NOT_FOUND';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='session_guard' AND p.proname='require_latest_session'
      AND p.pronargs=0
  ) THEN
    RAISE EXCEPTION 'SESSION_PRE_REQUEST_FUNCTION_NOT_FOUND';
  END IF;
END
$guard$;
GRANT USAGE ON SCHEMA session_guard TO service_role;
GRANT EXECUTE ON FUNCTION session_guard.require_latest_session() TO service_role;
DO $guard$
BEGIN
  IF NOT has_schema_privilege('service_role','session_guard','USAGE')
     OR NOT has_function_privilege('service_role','session_guard.require_latest_session()','EXECUTE')
  THEN
    RAISE EXCEPTION 'SERVICE_PRE_REQUEST_GRANT_FAILED';
  END IF;
  IF has_table_privilege('service_role','session_guard.latest_session','SELECT')
  THEN
    RAISE EXCEPTION 'PRIVATE_SESSION_TABLE_EXPOSED';
  END IF;
END
$guard$;
-- Reversible without touching current user sessions:
-- REVOKE EXECUTE ON FUNCTION session_guard.require_latest_session() FROM service_role;
-- REVOKE USAGE ON SCHEMA session_guard FROM service_role;
