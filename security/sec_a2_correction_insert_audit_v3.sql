-- SEC-A2 v3: preserve new manual correction and correction-request INSERT history
-- in the existing private, immutable audit table. Never backfill historical data.
-- No writes to attendance_events/event_corrections/correction_requests existing rows.
DO $sec_a2_v3_pre$
DECLARE src text;
BEGIN
  IF to_regclass('private.attendance_mutation_audit_v1') IS NULL
     OR to_regprocedure('private.sec_a2_capture_mutation_v1()') IS NULL
     OR to_regprocedure('private.sec_a2_reject_audit_mutation_v2()') IS NULL
     OR to_regprocedure('private.sec_a2_capture_correction_insert_v3()') IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.attendance_mutation_audit_v1'::regclass AND relrowsecurity)
  THEN RAISE EXCEPTION 'SEC_A2_V3_SOURCE_AUDIT_NOT_READY_OR_ALREADY_INSTALLED'; END IF;
  IF has_schema_privilege('anon','private','USAGE')
     OR has_schema_privilege('authenticated','private','USAGE')
     OR has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
     OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT')
  THEN RAISE EXCEPTION 'SEC_A2_V3_AUDIT_ACL_DRIFT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid='private.attendance_mutation_audit_v1'::regclass
        AND attname='row_before' AND attnotnull)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
       WHERE conrelid='private.attendance_mutation_audit_v1'::regclass
         AND conname='attendance_mutation_audit_v1_operation_check'
         AND pg_get_constraintdef(oid) LIKE '%UPDATE%'
         AND pg_get_constraintdef(oid) LIKE '%DELETE%')
     OR EXISTS (SELECT 1 FROM private.attendance_mutation_audit_v1
                WHERE operation NOT IN ('UPDATE','DELETE'))
  THEN RAISE EXCEPTION 'SEC_A2_V3_AUDIT_SHAPE_DRIFT'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
    AND tgenabled='O' AND tgname IN ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2'))<>2
  THEN RAISE EXCEPTION 'SEC_A2_V3_IMMUTABILITY_GUARDS_NOT_ACTIVE'; END IF;
  FOREACH src IN ARRAY ARRAY['event_corrections','correction_requests'] LOOP
    IF (SELECT count(*) FROM pg_trigger
        WHERE tgrelid=to_regclass('public.'||src)
          AND tgenabled='O' AND tgname IN ('sec_a2_mutation_audit_v1','sec_a2_protect_truncate_v1'))<>2
       OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||src)
                 AND tgname='sec_a2_correction_insert_audit_v3')
    THEN RAISE EXCEPTION 'SEC_A2_V3_SOURCE_TRIGGER_DRIFT: %',src; END IF;
  END LOOP;
END $sec_a2_v3_pre$;

-- Allow INSERT with row_before NULL; keep existing UPDATE and DELETE semantics.
ALTER TABLE private.attendance_mutation_audit_v1
  ALTER COLUMN row_before DROP NOT NULL;
ALTER TABLE private.attendance_mutation_audit_v1
  DROP CONSTRAINT attendance_mutation_audit_v1_operation_check;
ALTER TABLE private.attendance_mutation_audit_v1
  ADD CONSTRAINT attendance_mutation_audit_v1_operation_check
  CHECK (operation IN ('INSERT','UPDATE','DELETE'));
ALTER TABLE private.attendance_mutation_audit_v1
  ADD CONSTRAINT attendance_mutation_audit_v3_row_shape_check
  CHECK (
    (operation='INSERT' AND row_before IS NULL AND row_after IS NOT NULL)
    OR (operation='UPDATE' AND row_before IS NOT NULL AND row_after IS NOT NULL)
    OR (operation='DELETE' AND row_before IS NOT NULL AND row_after IS NULL)
  );

CREATE FUNCTION private.sec_a2_capture_correction_insert_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $sec_a2_v3_insert$
BEGIN
 IF TG_OP<>'INSERT' OR TG_TABLE_SCHEMA<>'public'
    OR TG_TABLE_NAME NOT IN ('event_corrections','correction_requests') THEN
   RAISE EXCEPTION 'SEC_A2_V3_UNEXPECTED_TRIGGER_CONTEXT: %.% %',TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP;
 END IF;
 INSERT INTO private.attendance_mutation_audit_v1
  (source_schema,source_table,operation,source_pk,row_before,row_after,postgrest_role,actor_uid)
 VALUES
  (TG_TABLE_SCHEMA,TG_TABLE_NAME,'INSERT',to_jsonb(NEW)->>'id',NULL,
   to_jsonb(NEW),current_setting('role',true),
   nullif(current_setting('request.jwt.claim.sub',true),''));
 RETURN NEW;
END
$sec_a2_v3_insert$;
REVOKE EXECUTE ON FUNCTION private.sec_a2_capture_correction_insert_v3()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sec_a2_correction_insert_audit_v3
 AFTER INSERT ON public.event_corrections FOR EACH ROW
 EXECUTE FUNCTION private.sec_a2_capture_correction_insert_v3();
CREATE TRIGGER sec_a2_correction_insert_audit_v3
 AFTER INSERT ON public.correction_requests FOR EACH ROW
 EXECUTE FUNCTION private.sec_a2_capture_correction_insert_v3();

DO $sec_a2_v3_post$
DECLARE src text;
BEGIN
 FOREACH src IN ARRAY ARRAY['event_corrections','correction_requests'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger
     WHERE tgrelid=to_regclass('public.'||src)
       AND tgenabled='O' AND tgname='sec_a2_correction_insert_audit_v3')
  THEN RAISE EXCEPTION 'SEC_A2_V3_INSERT_TRIGGER_MISSING: %',src; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_trigger
     WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
       AND tgenabled='O' AND tgname IN
           ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2'))<>2
    OR has_function_privilege('anon','private.sec_a2_capture_correction_insert_v3()','EXECUTE')
    OR has_function_privilege('authenticated','private.sec_a2_capture_correction_insert_v3()','EXECUTE')
 THEN RAISE EXCEPTION 'SEC_A2_V3_PRIVACY_OR_APPEND_ONLY_GUARD_FAILURE'; END IF;
END
$sec_a2_v3_post$;
