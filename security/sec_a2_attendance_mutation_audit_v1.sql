-- SEC-A2: append-only history of real attendance UPDATE and DELETE actions.
-- Does NOT edit existing operating rows. Real legacy VOID->ADD linkage is
-- separately unresolved; do not silently repair the historical eight rows.
-- Protected schema is not exposed in PostgREST (pg_catalog verified).
-- Use owner-authorized migration mechanism ONLY after PG16/17 acceptance.

DO $sec_a2_preflight$
DECLARE t_name text;
BEGIN
  IF to_regclass('private.attendance_mutation_audit_v1') IS NOT NULL THEN
    RAISE EXCEPTION 'SEC_A2_TABLE_ALREADY_EXISTS_STOP_FOR_REVIEW';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='private') THEN
    RAISE EXCEPTION 'SEC_A2_EXPECTED_PRIVATE_SCHEMA_MISSING';
  END IF;
  FOREACH t_name IN ARRAY ARRAY['attendance_events','event_corrections','correction_requests']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t_name AND c.relkind='r'
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'SEC_A2_SOURCE_TABLE_OR_RLS_CHANGED: %',t_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass('public.'||t_name)
        AND t.tgname IN ('sec_a2_mutation_audit_v1','sec_a2_protect_truncate_v1')
        AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'SEC_A2_EXISTING_TRIGGER_COLLISION: %',t_name;
    END IF;
  END LOOP;
  IF has_schema_privilege('anon','private','USAGE')
     OR has_schema_privilege('authenticated','private','USAGE') THEN
    RAISE EXCEPTION 'SEC_A2_PRIVATE_SCHEMA_NOT_PRIVATE';
  END IF;
END
$sec_a2_preflight$;

CREATE TABLE private.attendance_mutation_audit_v1 (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  txid bigint NOT NULL DEFAULT txid_current(),
  source_schema text NOT NULL,
  source_table text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('UPDATE','DELETE')),
  source_pk text,
  row_before jsonb NOT NULL,
  row_after jsonb,
  postgrest_role text,
  actor_uid text
);
ALTER TABLE private.attendance_mutation_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.attendance_mutation_audit_v1
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE private.attendance_mutation_audit_v1_audit_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX attendance_mutation_audit_v1_source_idx
  ON private.attendance_mutation_audit_v1 (source_schema,source_table,observed_at DESC);

CREATE FUNCTION private.sec_a2_capture_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private AS $sec_func$
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
END
$sec_func$;

CREATE FUNCTION private.sec_a2_block_truncate_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, private AS $sec_func$
BEGIN
  RAISE EXCEPTION 'SEC_A2_UNAUDITED_TRUNCATE_DENIED: %.%',TG_TABLE_SCHEMA,TG_TABLE_NAME;
END
$sec_func$;

REVOKE EXECUTE ON FUNCTION private.sec_a2_capture_mutation_v1()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION private.sec_a2_block_truncate_v1()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER sec_a2_mutation_audit_v1
  AFTER UPDATE OR DELETE ON public.attendance_events
  FOR EACH ROW EXECUTE FUNCTION private.sec_a2_capture_mutation_v1();
CREATE TRIGGER sec_a2_mutation_audit_v1
  AFTER UPDATE OR DELETE ON public.event_corrections
  FOR EACH ROW EXECUTE FUNCTION private.sec_a2_capture_mutation_v1();
CREATE TRIGGER sec_a2_mutation_audit_v1
  AFTER UPDATE OR DELETE ON public.correction_requests
  FOR EACH ROW EXECUTE FUNCTION private.sec_a2_capture_mutation_v1();

CREATE TRIGGER sec_a2_protect_truncate_v1
  BEFORE TRUNCATE ON public.attendance_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.sec_a2_block_truncate_v1();
CREATE TRIGGER sec_a2_protect_truncate_v1
  BEFORE TRUNCATE ON public.event_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION private.sec_a2_block_truncate_v1();
CREATE TRIGGER sec_a2_protect_truncate_v1
  BEFORE TRUNCATE ON public.correction_requests
  FOR EACH STATEMENT EXECUTE FUNCTION private.sec_a2_block_truncate_v1();

DO $sec_a2_verify$
DECLARE
  t_name text;
BEGIN
  FOREACH t_name IN ARRAY ARRAY['attendance_events','event_corrections','correction_requests']
  LOOP
    IF (SELECT count(*) FROM pg_trigger t
        WHERE t.tgrelid=to_regclass('public.'||t_name)
          AND t.tgname IN ('sec_a2_mutation_audit_v1','sec_a2_protect_truncate_v1')
          AND t.tgenabled='O')<>2 THEN
      RAISE EXCEPTION 'SEC_A2_TRIGGER_INSTALL_FAILED %',t_name;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','private.sec_a2_capture_mutation_v1()','EXECUTE')
     OR has_function_privilege('authenticated','private.sec_a2_capture_mutation_v1()','EXECUTE')
     OR has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
     OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT') THEN
    RAISE EXCEPTION 'SEC_A2_AUDIT_PUBLIC_ACCESS_DETECTED';
  END IF;
END
$sec_a2_verify$;

-- Live hosted synthetic self-test: uses ONLY a disposable temporary row.
-- The intentional exception below rolls back ALL temporary-table mutations
-- AND the temporary audit rows via a PL/pgSQL subtransaction. Real operating
-- attendance, corrections and requests records are NEVER written.
DO $sec_a2_disposable_verify$
DECLARE
  n_before bigint;
  n_sample bigint;
BEGIN
  SELECT count(*) INTO n_before FROM private.attendance_mutation_audit_v1;
  BEGIN
    CREATE TEMP TABLE sec_a2_temp_fixture (id bigint PRIMARY KEY, reason text) ON COMMIT DROP;
    CREATE TRIGGER sec_a2_fixture_audit
      AFTER UPDATE OR DELETE ON sec_a2_temp_fixture
      FOR EACH ROW EXECUTE FUNCTION private.sec_a2_capture_mutation_v1();
    INSERT INTO sec_a2_temp_fixture(id,reason) VALUES (1900801,'SEC_A2_SYNTHETIC_ONLY');
    UPDATE sec_a2_temp_fixture SET reason='SEC_A2_SYNTHETIC_UPDATED' WHERE id=1900801;
    DELETE FROM sec_a2_temp_fixture WHERE id=1900801;
    SELECT count(*) INTO n_sample FROM private.attendance_mutation_audit_v1
      WHERE source_table='sec_a2_temp_fixture';
    IF n_sample<>2 THEN
      RAISE EXCEPTION 'SEC_A2_LIVE_TEMP_TRIGGER_TEST_FAILED %',n_sample;
    END IF;
    RAISE EXCEPTION 'SEC_A2_EXPECTED_SUBTRANSACTION_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'SEC_A2_EXPECTED_SUBTRANSACTION_ROLLBACK' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>n_before THEN
    RAISE EXCEPTION 'SEC_A2_SELFTEST_AUDIT_ROWS_NOT_ROLLED_BACK';
  END IF;
  IF to_regclass('pg_temp.sec_a2_temp_fixture') IS NOT NULL THEN
    RAISE EXCEPTION 'SEC_A2_SELFTEST_TEMP_TABLE_LEAKED';
  END IF;
END
$sec_a2_disposable_verify$;
