-- SEC-A2 v4 (candidate, NON-OPERATING): capture current PostgREST JWT claims
-- for new audit events. Never rewrite historical audit rows or original events.
-- Apply only after isolated PG16/17 tests, preflight and recovery authorization.
DO $a2v4_pre$
BEGIN
  IF to_regclass('private.attendance_mutation_audit_v1') IS NULL
     OR to_regprocedure('private.sec_a2_capture_mutation_v1()') IS NULL
     OR to_regprocedure('private.sec_a2_capture_correction_insert_v3()') IS NULL
     OR to_regprocedure('private.sec_a2_request_identity_v4()') IS NOT NULL
  THEN RAISE EXCEPTION 'SEC_A2_V4_EXPECTED_BASELINE_MISSING_OR_INSTALLED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.attendance_mutation_audit_v1'::regclass AND relrowsecurity)
     OR has_schema_privilege('anon','private','USAGE')
     OR has_schema_privilege('authenticated','private','USAGE')
     OR has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
     OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT')
  THEN RAISE EXCEPTION 'SEC_A2_V4_PRIVATE_AUDIT_ACL_DRIFT'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE
      (tgrelid IN ('public.attendance_events'::regclass,'public.event_corrections'::regclass,'public.correction_requests'::regclass)
        AND tgname IN ('sec_a2_mutation_audit_v1','sec_a2_protect_truncate_v1')
        AND tgenabled='O')
      OR (tgrelid IN ('public.event_corrections'::regclass,'public.correction_requests'::regclass)
        AND tgname='sec_a2_correction_insert_audit_v3' AND tgenabled='O'))<>8
  THEN RAISE EXCEPTION 'SEC_A2_V4_SOURCE_TRIGGER_DRIFT'; END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
        AND tgname IN ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2')
        AND tgenabled='O')<>2
  THEN RAISE EXCEPTION 'SEC_A2_V4_APPEND_ONLY_GUARD_DRIFT'; END IF;
END $a2v4_pre$;

-- No SECURITY DEFINER here; only source audit triggers call this through their
-- existing SECURITY DEFINER functions. The values are only *request claims*
-- already verified by PostgREST, not a cryptographic identity attestation from
-- arbitrary direct SQL sessions. Legacy GUC fallback is used ONLY if the modern
-- aggregate is absent; never fall back to a stale legacy sub if modern claims
-- are present but omit a subject.
CREATE FUNCTION private.sec_a2_request_identity_v4()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $a2v4_identity$
DECLARE
  raw_claims text := nullif(current_setting('request.jwt.claims',true),'');
  claims jsonb;
  subject text;
  claimed_role text;
BEGIN
  IF raw_claims IS NOT NULL THEN
    claims := raw_claims::jsonb;
    IF jsonb_typeof(claims) <> 'object' THEN
      RETURN jsonb_build_object('actor_uid',NULL,'postgrest_role',NULL);
    END IF;
    subject := nullif(claims->>'sub','');
    claimed_role := nullif(claims->>'role','');
  ELSE
    subject := nullif(current_setting('request.jwt.claim.sub',true),'');
    claimed_role := nullif(current_setting('request.jwt.claim.role',true),'');
  END IF;
  -- Audit attribution is an optional UUID, never arbitrary user-supplied text.
  IF subject IS NOT NULL AND
     subject !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    subject := NULL;
  END IF;
  RETURN jsonb_build_object('actor_uid',subject,
    'postgrest_role',coalesce(claimed_role,nullif(current_setting('role',true),'')));
END $a2v4_identity$;
REVOKE ALL ON FUNCTION private.sec_a2_request_identity_v4() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve both trigger names, source tables, operation shapes and all stored rows.
CREATE OR REPLACE FUNCTION private.sec_a2_capture_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $a2v4_capture$
DECLARE ctx jsonb;
BEGIN
  IF TG_OP NOT IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'SEC_A2_UNEXPECTED_MUTATION_OPERATION %',TG_OP;
  END IF;
  ctx := private.sec_a2_request_identity_v4();
  INSERT INTO private.attendance_mutation_audit_v1
    (source_schema,source_table,operation,source_pk,row_before,row_after,postgrest_role,actor_uid)
  VALUES
    (TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP,
     to_jsonb(OLD)->>'id',to_jsonb(OLD),
     CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
     ctx->>'postgrest_role',ctx->>'actor_uid');
  RETURN CASE WHEN TG_OP='UPDATE' THEN NEW ELSE OLD END;
END $a2v4_capture$;

CREATE OR REPLACE FUNCTION private.sec_a2_capture_correction_insert_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private
AS $a2v4_insert$
DECLARE ctx jsonb;
BEGIN
 IF TG_OP<>'INSERT' OR TG_TABLE_SCHEMA<>'public'
    OR TG_TABLE_NAME NOT IN ('event_corrections','correction_requests') THEN
   RAISE EXCEPTION 'SEC_A2_V3_UNEXPECTED_TRIGGER_CONTEXT: %.% %',TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP;
 END IF;
 ctx := private.sec_a2_request_identity_v4();
 INSERT INTO private.attendance_mutation_audit_v1
  (source_schema,source_table,operation,source_pk,row_before,row_after,postgrest_role,actor_uid)
 VALUES
  (TG_TABLE_SCHEMA,TG_TABLE_NAME,'INSERT',to_jsonb(NEW)->>'id',NULL,
   to_jsonb(NEW),ctx->>'postgrest_role',ctx->>'actor_uid');
 RETURN NEW;
END $a2v4_insert$;

DO $a2v4_post$
BEGIN
 IF has_function_privilege('anon','private.sec_a2_request_identity_v4()','EXECUTE')
  OR has_function_privilege('authenticated','private.sec_a2_request_identity_v4()','EXECUTE')
  OR has_function_privilege('anon','private.sec_a2_capture_mutation_v1()','EXECUTE')
  OR has_function_privilege('authenticated','private.sec_a2_capture_mutation_v1()','EXECUTE')
  OR has_function_privilege('anon','private.sec_a2_capture_correction_insert_v3()','EXECUTE')
  OR has_function_privilege('authenticated','private.sec_a2_capture_correction_insert_v3()','EXECUTE')
 THEN RAISE EXCEPTION 'SEC_A2_V4_PRIVATE_FUNCTION_ACL_DRIFT'; END IF;
 IF (SELECT count(*) FROM pg_trigger
   WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
     AND tgname IN ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2')
     AND tgenabled='O')<>2
 THEN RAISE EXCEPTION 'SEC_A2_V4_APPEND_ONLY_NOT_PRESERVED'; END IF;
END $a2v4_post$;
