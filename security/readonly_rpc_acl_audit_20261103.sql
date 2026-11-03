-- SEC-LEDGER / 2026-11-03
-- READ ONLY, no secrets/employee rows, no function invocation.
-- Safe for production catalog inspection. Do NOT infer that EXECUTE = exploitable.
BEGIN READ ONLY;

WITH f AS (
  SELECT p.oid, p.proname, p.prorettype, p.proacl, p.proowner,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_execute,
    EXISTS (
      SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
    ) AS public_execute,
    format_type(p.prorettype,NULL)='trigger' AS trigger_only
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
)
SELECT
  count(*) AS public_definer_functions,
  count(*) FILTER(WHERE anon_execute) AS anon_execute,
  count(*) FILTER(WHERE auth_execute) AS authenticated_execute,
  count(*) FILTER(WHERE public_execute) AS granted_to_public,
  count(*) FILTER(WHERE anon_execute AND trigger_only) AS anon_trigger_not_http_rpc,
  count(*) FILTER(WHERE auth_execute AND trigger_only) AS auth_trigger_not_http_rpc,
  count(*) FILTER(WHERE auth_execute AND proname LIKE 'admin_%') AS admin_prefix
FROM f;

-- Per-function triage: named roles, effective rights and function return type.
-- This is an INVENTORY, NOT an exploit check, and must not be used as blanket REVOKE instructions.
WITH f AS (
  SELECT p.oid::regprocedure::text AS signature, p.proname,
         format_type(p.prorettype,NULL) AS return_type,
         has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
         has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
)
SELECT signature,return_type,anon_execute,authenticated_execute,
  CASE
    WHEN return_type='trigger' THEN 'TRIGGER_ONLY_NOT_HTTP_RPC'
    WHEN proname IN ('list_stores','pos_public_staff_cards','pos_public_staff_picker','store_recipe_list_public') THEN 'INTENTIONALLY_PUBLIC_READ_VERIFY_FIELDS'
    WHEN anon_execute THEN 'PUBLIC_WORKFLOW_REVIEW_PIN_TOKEN_TENANT_SCOPE'
    WHEN authenticated_execute AND proname LIKE 'admin_%' THEN 'ADMIN_RPC_REVIEW_ROLE_AND_TENANT'
    WHEN authenticated_execute AND proname LIKE 'hq_%' THEN 'HQ_RPC_REVIEW_ROLE_AND_TENANT'
    WHEN authenticated_execute AND proname LIKE 'store_%' THEN 'STORE_RPC_REVIEW_ROLE_AND_TENANT'
    ELSE 'OTHER_REVIEW'
  END AS audit_queue
FROM f
WHERE anon_execute OR authenticated_execute
ORDER BY anon_execute DESC,audit_queue,signature;

ROLLBACK;
