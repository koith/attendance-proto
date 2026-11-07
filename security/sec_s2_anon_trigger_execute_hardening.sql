-- SEC-S2 2026-11-07: revoke only PUBLIC/anon EXECUTE on two internal trigger
-- functions. Both are installed on public.admin_users, RETURNS trigger, and
-- called by the database trigger mechanism, never by browser PostgREST RPCs.
-- This script does not mutate employees/attendance/payroll/auth/store records.
-- Execute transactionally with an authorized DBA/migration mechanism.
-- Do not generalize to PIN/token/public POS functions: guest UI requires them.
DO $sec_preflight$
DECLARE
  target regprocedure;
  function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.cancel_revoked_owner_invitation()',
    'public.store_assistant_invitation_default_permissions()'
  ] LOOP
    target:=to_regprocedure(function_name);
    IF target IS NULL THEN
      RAISE EXCEPTION 'SEC_S2_MISSING_FUNCTION: %',function_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid=target AND p.prorettype='trigger'::regtype AND p.prosecdef
    ) THEN
      RAISE EXCEPTION 'SEC_S2_NOT_EXPECTED_INTERNAL_TRIGGER: %',function_name;
    END IF;
    IF (SELECT count(*) FROM pg_trigger t
        WHERE t.tgfoid=target AND t.tgrelid='public.admin_users'::regclass
          AND NOT t.tgisinternal AND t.tgenabled='O')<>1 THEN
      RAISE EXCEPTION 'SEC_S2_TRIGGER_BINDING_CHANGED: %',function_name;
    END IF;
    IF NOT has_function_privilege('authenticated',target,'EXECUTE')
       OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN
      RAISE EXCEPTION 'SEC_S2_EXPECTED_AUTH_OR_SERVICE_GRANT_MISSING: %',function_name;
    END IF;
  END LOOP;
  IF has_table_privilege('anon','public.admin_users','INSERT')
     OR has_table_privilege('anon','public.admin_users','UPDATE') THEN
    RAISE EXCEPTION 'SEC_S2_ANON_ADMIN_USERS_TABLE_PERMISSION_CHANGED';
  END IF;
END
$sec_preflight$;

REVOKE EXECUTE ON FUNCTION public.cancel_revoked_owner_invitation()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.store_assistant_invitation_default_permissions()
  FROM PUBLIC, anon;

DO $sec_verify$
DECLARE
  target regprocedure;
  function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.cancel_revoked_owner_invitation()',
    'public.store_assistant_invitation_default_permissions()'
  ] LOOP
    target:=to_regprocedure(function_name);
    IF has_function_privilege('anon',target,'EXECUTE') THEN
      RAISE EXCEPTION 'SEC_S2_ANON_EXECUTE_NOT_REVOKED: %',function_name;
    END IF;
    IF NOT has_function_privilege('authenticated',target,'EXECUTE')
       OR NOT has_function_privilege('service_role',target,'EXECUTE')
       OR NOT has_function_privilege('postgres',target,'EXECUTE') THEN
      RAISE EXCEPTION 'SEC_S2_INTERNAL_FUNCTION_LOST_AUTHORIZED_GRANT: %',function_name;
    END IF;
  END LOOP;
END
$sec_verify$;

-- Emergency rollback only after separate review (do NOT run in normal QA):
-- GRANT EXECUTE ON FUNCTION public.cancel_revoked_owner_invitation() TO PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.store_assistant_invitation_default_permissions() TO PUBLIC, anon;
