-- AISEC-07 rollback: remove the dedicated backup login. The daily backup keeps
-- working because sec-backup-capture falls back to the legacy SUPABASE_DB_URL
-- secret whenever BACKUP_DB_READONLY_URL is empty. Remove that environment
-- secret FIRST, then run this. Owns no objects, so DROP ROLE is safe.
DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_reader') THEN
    REVOKE pg_read_all_data FROM backup_reader;
    ALTER ROLE backup_reader RESET ALL;
    DROP ROLE backup_reader;
  END IF;
END
$rb$;
