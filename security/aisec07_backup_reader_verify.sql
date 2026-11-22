-- AISEC-07 fail-closed verifier, run AS the backup login before every capture.
-- Raises (non-zero psql exit) unless the connected role is provably unable to
-- write. Prints one JSON line of counts only (no data, no names of tables).
DO $verify$
DECLARE
  r pg_roles%ROWTYPE;
  writable_tables int; creatable_schemas int; other_roles int; writer_roles int;
  definer_functions int;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = current_user;
  IF r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication THEN
    RAISE EXCEPTION 'BACKUP_READER_NOT_LEAST_PRIVILEGE role attributes';
  END IF;
  IF NOT r.rolbypassrls THEN
    RAISE EXCEPTION 'BACKUP_READER_MISSING_BYPASSRLS full dump impossible';
  END IF;
  IF NOT pg_has_role(current_user, 'pg_read_all_data', 'USAGE') THEN
    RAISE EXCEPTION 'BACKUP_READER_MISSING_PG_READ_ALL_DATA';
  END IF;
  -- Every role reachable from current_user, except itself and pg_read_all_data.
  WITH RECURSIVE m(roleid) AS (
    SELECT roleid FROM pg_auth_members WHERE member = r.oid
    UNION SELECT a.roleid FROM pg_auth_members a JOIN m ON a.member = m.roleid)
  SELECT count(*) FILTER (WHERE g.rolname <> 'pg_read_all_data'),
         count(*) FILTER (WHERE g.rolname IN ('pg_write_all_data','pg_database_owner','pg_write_server_files','pg_execute_server_program'))
    INTO other_roles, writer_roles
    FROM m JOIN pg_roles g ON g.oid = m.roleid;
  IF other_roles > 0 OR writer_roles > 0 THEN
    RAISE EXCEPTION 'BACKUP_READER_EXTRA_ROLE_MEMBERSHIP %', other_roles;
  END IF;
  SELECT count(*) INTO writable_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r','p','v','m','f')
     AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_toast%'
     AND (has_table_privilege(c.oid, 'INSERT') OR has_table_privilege(c.oid, 'UPDATE')
       OR has_table_privilege(c.oid, 'DELETE') OR has_table_privilege(c.oid, 'TRUNCATE')
       OR has_table_privilege(c.oid, 'TRIGGER') OR pg_has_role(c.relowner, 'USAGE'));
  SELECT count(*) INTO creatable_schemas FROM pg_namespace n
   WHERE has_schema_privilege(n.oid, 'CREATE') OR pg_has_role(n.nspowner, 'USAGE');
  IF writable_tables > 0 OR creatable_schemas > 0 OR has_database_privilege(current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'BACKUP_READER_HAS_WRITE_PRIVILEGE tables=% schemas=%', writable_tables, creatable_schemas;
  END IF;
  -- Residual (reported, not fatal): SECURITY DEFINER functions executable by
  -- this role run with their owner's rights; application RPCs must keep their
  -- own auth checks. Counted so the owner can review the number over time.
  SELECT count(*) INTO definer_functions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
     AND has_function_privilege(p.oid, 'EXECUTE');
  RAISE NOTICE 'BACKUP_READER_VERIFIED %', json_build_object('writable_tables', 0, 'creatable_schemas', 0,
    'extra_roles', 0, 'bypassrls', true, 'pg_read_all_data', true,
    'default_read_only', current_setting('default_transaction_read_only'),
    'residual_security_definer_executable', definer_functions);
END
$verify$;
