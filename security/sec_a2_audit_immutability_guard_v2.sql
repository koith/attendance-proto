-- SEC-A2 v2: make captured attendance audit rows append-only for routine SQL.
-- Review-only until isolated PG16/17 checks pass. This does not mutate
-- attendance, correction, or request data; privileged superusers can still
-- disable triggers, so this is NOT cryptographic tamper resistance.
DO $sec_a2_v2_preflight$
DECLARE
  src text;
BEGIN
  IF to_regclass('private.attendance_mutation_audit_v1') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_class
       WHERE oid='private.attendance_mutation_audit_v1'::regclass
         AND relkind='r' AND relrowsecurity
     ) THEN
    RAISE EXCEPTION 'SEC_A2_V2_EXPECTED_PRIVATE_AUDIT_TABLE_MISSING_OR_RLS_OFF';
  END IF;
  IF has_schema_privilege('anon','private','USAGE')
     OR has_schema_privilege('authenticated','private','USAGE')
     OR has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
     OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT')
     OR has_table_privilege('service_role','private.attendance_mutation_audit_v1','SELECT') THEN
    RAISE EXCEPTION 'SEC_A2_V2_AUDIT_ACL_DRIFT';
  END IF;
  FOREACH src IN ARRAY ARRAY[
     'attendance_events','event_corrections','correction_requests'
  ] LOOP
    IF (SELECT count(*) FROM pg_trigger
        WHERE tgrelid=to_regclass('public.'||src)
          AND tgname IN ('sec_a2_mutation_audit_v1','sec_a2_protect_truncate_v1')
          AND tgenabled='O')<>2 THEN
      RAISE EXCEPTION 'SEC_A2_V2_SOURCE_TRIGGER_DRIFT: %',src;
    END IF;
  END LOOP;
  IF to_regprocedure('private.sec_a2_reject_audit_mutation_v2()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
         AND tgname IN ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2')
     ) THEN
    RAISE EXCEPTION 'SEC_A2_V2_ALREADY_INSTALLED_STOP_FOR_REVIEW';
  END IF;
END
$sec_a2_v2_preflight$;

CREATE FUNCTION private.sec_a2_reject_audit_mutation_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $sec_a2_v2_trigger$
BEGIN
  RAISE EXCEPTION 'SEC_A2_AUDIT_IMMUTABLE_DENIED: %', TG_OP
    USING ERRCODE='42501';
  RETURN NULL;
END
$sec_a2_v2_trigger$;
REVOKE EXECUTE ON FUNCTION private.sec_a2_reject_audit_mutation_v2()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sec_a2_audit_no_rewrite_v2
BEFORE UPDATE OR DELETE ON private.attendance_mutation_audit_v1
FOR EACH ROW EXECUTE FUNCTION private.sec_a2_reject_audit_mutation_v2();

CREATE TRIGGER sec_a2_audit_no_truncate_v2
BEFORE TRUNCATE ON private.attendance_mutation_audit_v1
FOR EACH STATEMENT EXECUTE FUNCTION private.sec_a2_reject_audit_mutation_v2();

DO $sec_a2_v2_verify$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
        AND tgname IN ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2')
        AND tgenabled='O')<>2 THEN
    RAISE EXCEPTION 'SEC_A2_V2_AUDIT_GUARD_INSTALL_FAILED';
  END IF;
  IF has_function_privilege('anon','private.sec_a2_reject_audit_mutation_v2()','EXECUTE')
     OR has_function_privilege('authenticated','private.sec_a2_reject_audit_mutation_v2()','EXECUTE') THEN
    RAISE EXCEPTION 'SEC_A2_V2_PUBLIC_TRIGGER_EXECUTE';
  END IF;
END
$sec_a2_v2_verify$;
