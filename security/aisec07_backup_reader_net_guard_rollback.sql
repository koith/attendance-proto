-- AISEC-07 rollback of the backup-login guard (restores the exact prior state).
-- postgres does NOT own the net tables, so DROP TRIGGER would fail ("must be
-- owner of relation"); dropping OUR guard function with CASCADE removes the
-- dependent triggers (PostgreSQL checks ownership only on the named object).
-- Verified on supabase/postgres:17.12.0.002. After this the backup verifier
-- refuses the backup again (fail-closed).
DROP EVENT TRIGGER IF EXISTS aisec07_deny_backup_reader_ddl;
DROP FUNCTION IF EXISTS backup_guard.deny_backup_reader_ddl();
DROP FUNCTION IF EXISTS backup_guard.deny_backup_reader_write() CASCADE;
DROP SCHEMA IF EXISTS backup_guard;
