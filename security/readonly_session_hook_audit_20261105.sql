-- SEC-S09 / SEC-01: live, READ-ONLY catalog and configuration evidence.
-- No session or user rows, JWT, secret, payroll, employee ID, or personal data.
-- IMPORTANT: a missing DB-level PostgREST setting does NOT prove that hosted
-- PostgREST has no request hook; no RPC is invoked here and no sessions change.
WITH guard AS (
 SELECT p.oid, p.prosecdef, p.proconfig
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='session_guard' AND p.proname='require_latest_session'
), recorded AS (
 SELECT t.oid
 FROM pg_catalog.pg_trigger t
 JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='auth' AND c.relname='sessions'
   AND NOT t.tgisinternal AND t.tgenabled <> 'D'
   AND pg_catalog.pg_get_triggerdef(t.oid) ILIKE '%record_latest_session%'
   AND pg_catalog.pg_get_triggerdef(t.oid) ILIKE '%AFTER INSERT%'
), hooks AS (
 SELECT pg_catalog.current_setting('pgrst.db_pre_request',true) AS sql_session_setting
), dbrole AS (
 SELECT count(*) AS settings
 FROM pg_catalog.pg_db_role_setting
 WHERE pg_catalog.array_to_string(setconfig,',') ILIKE '%pgrst.db_pre_request%'
)
SELECT
 (SELECT count(*) FROM guard) AS guard_functions,
 (SELECT count(*) FROM guard WHERE prosecdef) AS guard_security_definer_functions,
 (SELECT count(*) FROM recorded) AS active_auth_session_insert_triggers,
 (SELECT settings FROM dbrole) AS database_or_role_level_pre_request_settings,
 (SELECT sql_session_setting IS NOT NULL FROM hooks) AS current_sql_connection_has_pre_request_setting,
 'UNVERIFIED_HOSTED_POSTGREST_HOOK_AND_STALE_SESSION_REJECTION'::text AS conclusion;
