-- AISEC-07: dedicated read-only database login for the automatic encrypted backup.
-- NOT applied by automation. The repository owner runs this once in the Supabase
-- SQL editor (as postgres) after explicit approval, then sets the password in a
-- SEPARATE statement that is never committed or pasted into chat:
--   ALTER ROLE backup_reader PASSWORD '<generated in a password manager>';
-- and stores the resulting connection string only as the production-backup
-- ENVIRONMENT secret BACKUP_DB_READONLY_URL. Idempotent; rollback:
-- security/aisec07_backup_reader_role_rollback.sql.
--
-- Privilege model:
--   pg_read_all_data  SELECT on every table/view/sequence and USAGE on every schema
--   BYPASSRLS         required so pg_dump can read RLS-protected tables in full
--   no write grant, no schema CREATE, no role/db creation, not superuser
-- default_transaction_read_only is defence-in-depth only (a session can override
-- it); the real boundary is the absence of write privileges, which
-- aisec07_backup_reader_verify.sql proves before every capture.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_reader') THEN
    CREATE ROLE backup_reader LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION BYPASSRLS CONNECTION LIMIT 3;
  ELSE
    ALTER ROLE backup_reader LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION BYPASSRLS CONNECTION LIMIT 3;
  END IF;
END
$role$;
GRANT pg_read_all_data TO backup_reader;
ALTER ROLE backup_reader SET default_transaction_read_only = on;
ALTER ROLE backup_reader SET idle_in_transaction_session_timeout = '30min';
