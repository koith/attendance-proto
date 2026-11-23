-- AISEC-07: neutralise the PUBLIC write privileges that pg_net grants on
-- net.http_request_queue / net._http_response for the backup login ONLY,
-- WITHOUT changing any extension grant. Statement-level BEFORE triggers owned
-- by postgres raise for backup_reader; the pg_net worker, postgres and every
-- other role are unaffected. Verified on supabase/postgres:17.12.0.002
-- (qa/security/backup_reader_supabase_extensions_e2e.sh). Idempotent.
-- Apply as postgres after explicit owner approval. Rollback:
-- security/aisec07_backup_reader_net_guard_rollback.sql
-- Also an event trigger that rejects ALL DDL from backup_reader, so the PUBLIC
-- TRIGGER/REFERENCES grants on net tables cannot be used to plant a trigger
-- (incl. pg_temp functions) or create temp objects.
-- NOT removable without changing extension grants (owner decision, see
-- docs/security/SOLE_OWNER_GITHUB_POLICY.md section 10):
--   net.http_request_queue / net._http_response MAINTAIN (LOCK/VACUUM: availability)
--   cron.job_run_details DELETE (run-history log; postgres has no TRIGGER there)
CREATE SCHEMA IF NOT EXISTS backup_guard;
REVOKE ALL ON SCHEMA backup_guard FROM PUBLIC;
CREATE OR REPLACE FUNCTION backup_guard.deny_backup_reader_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
BEGIN
  IF session_user = 'backup_reader' OR current_user = 'backup_reader' THEN
    RAISE EXCEPTION 'BACKUP_READER_WRITE_DENIED % on %.%', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION backup_guard.deny_backup_reader_write() FROM PUBLIC;
DO $g$
DECLARE t regclass;
BEGIN
  FOREACH t IN ARRAY ARRAY['net.http_request_queue'::regclass, 'net._http_response'::regclass] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = t AND tgname = 'aisec07_deny_backup_reader_dml') THEN
      EXECUTE format('CREATE TRIGGER aisec07_deny_backup_reader_dml BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION backup_guard.deny_backup_reader_write()', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = t AND tgname = 'aisec07_deny_backup_reader_truncate') THEN
      EXECUTE format('CREATE TRIGGER aisec07_deny_backup_reader_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION backup_guard.deny_backup_reader_write()', t);
    END IF;
  END LOOP;
END
$g$;
CREATE OR REPLACE FUNCTION backup_guard.deny_backup_reader_ddl() RETURNS event_trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
BEGIN
  IF session_user = 'backup_reader' THEN
    RAISE EXCEPTION 'BACKUP_READER_DDL_DENIED %', tg_tag USING ERRCODE = '42501';
  END IF;
END $f$;
REVOKE ALL ON FUNCTION backup_guard.deny_backup_reader_ddl() FROM PUBLIC;
DO $e$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'aisec07_deny_backup_reader_ddl') THEN
    CREATE EVENT TRIGGER aisec07_deny_backup_reader_ddl ON ddl_command_start
      EXECUTE FUNCTION backup_guard.deny_backup_reader_ddl();
  END IF;
END
$e$;
