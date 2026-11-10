-- SEC-A2 v4: rollback only JWT-capture behavior; never delete/modify audit rows.
-- Back to deployed v1/v3 audit-capture behavior, preserve source triggers.
DO $a2v4_rollback_pre$
BEGIN
 IF to_regprocedure('private.sec_a2_request_identity_v4()') IS NULL
 OR to_regprocedure('private.sec_a2_capture_mutation_v1()') IS NULL
 OR to_regprocedure('private.sec_a2_capture_correction_insert_v3()') IS NULL
 THEN RAISE EXCEPTION 'SEC_A2_V4_ROLLBACK_UNEXPECTED_STATE'; END IF;
END $a2v4_rollback_pre$;

CREATE OR REPLACE FUNCTION private.sec_a2_capture_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $sec_func$
BEGIN
  IF TG_OP NOT IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'SEC_A2_UNEXPECTED_MUTATION_OPERATION %',TG_OP;
  END IF;
  INSERT INTO private.attendance_mutation_audit_v1
    (source_schema,source_table,operation,source_pk,row_before,row_after,postgrest_role,actor_uid)
  VALUES
    (TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP,
     to_jsonb(OLD)->>'id',to_jsonb(OLD),
     CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
     current_setting('role',true),nullif(current_setting('request.jwt.claim.sub',true),''));
  RETURN CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END;
END $sec_func$;

CREATE OR REPLACE FUNCTION private.sec_a2_capture_correction_insert_v3()
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
END $sec_a2_v3_insert$;

DROP FUNCTION private.sec_a2_request_identity_v4();

DO $a2v4_rollback_post$
BEGIN
 IF to_regprocedure('private.sec_a2_request_identity_v4()') IS NOT NULL
 OR (SELECT count(*) FROM pg_trigger
   WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
     AND tgname IN ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2')
     AND tgenabled='O')<>2
 THEN RAISE EXCEPTION 'SEC_A2_V4_ROLLBACK_GUARD_CHANGED'; END IF;
END $a2v4_rollback_post$;
