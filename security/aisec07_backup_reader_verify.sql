-- AISEC-07 fail-closed verifier, run AS the backup login before every capture.
-- Raises (non-zero psql exit) unless the connected role is provably unable to
-- write. Prints one JSON line of counts only (no data, no names of tables).
DO $verify$
DECLARE
  r pg_roles%ROWTYPE;
  writable_tables int; creatable_schemas int; other_roles int; writer_roles int;
  definer_functions int; f record; callee record; static_ok boolean;
  unreviewed text[] := '{}'; readonly_list text[] := '{}';
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
  -- SECURITY DEFINER functions run with their OWNER's rights, so a backup login
  -- that can EXECUTE one may write through it (proven in qa/security/
  -- backup_reader_e2e.sh). Volatility is NOT a boundary: a STABLE wrapper can
  -- call a volatile writer. Fail closed unless every definer function this
  -- role can execute (any schema, extensions included) is provably read-only
  -- from its body: a single SQL-language SELECT/WITH/VALUES statement with no
  -- write/DDL/session keyword and no call to anything outside a fixed set of
  -- side-effect-free builtins. Anything else must have EXECUTE revoked from
  -- PUBLIC (owner change) before the backup login is accepted.
  SELECT count(*) INTO definer_functions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
     AND has_function_privilege(p.oid, 'EXECUTE');
  FOR f IN
    SELECT p.oid, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig,
           l.lanname, p.provolatile,
           lower(regexp_replace(coalesce(p.prosrc,''), '--[^\n]*|/\*.*?\*/', ' ', 'g')) AS src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
     WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
       AND has_function_privilege(p.oid, 'EXECUTE')
     ORDER BY 2
  LOOP
    static_ok := f.lanname = 'sql'
      AND f.src ~ '^\s*\(?\s*(select|with|values|table)\M'
      AND rtrim(btrim(f.src), '; ') !~ ';'
      AND f.src !~ '\m(insert|update|delete|merge|truncate|copy|call|perform|execute|do|alter|create|drop|grant|revoke|lock|notify|listen|unlisten|refresh|vacuum|analyze|cluster|reindex|set|reset|discard|prepare|deallocate|nextval|setval|set_config|import|load|comment|security|returning)\M'
      AND f.src !~ '\mfor\s+(update|share|no\s+key|key)\M';
    IF static_ok THEN
      FOR callee IN SELECT (m)[1] AS name FROM regexp_matches(f.src, '([a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?)\s*\(', 'g') AS m LOOP
        IF NOT callee.name = ANY (ARRAY[
          'select','from','join','where','and','or','not','on','as','when','then','else','in','exists','any','all','some',
          'over','filter','values','union','intersect','except','using','lateral','with','case','is','distinct','by','having',
          'limit','offset','array','row','cast','partition',
          'count','sum','min','max','avg','coalesce','nullif','greatest','least','lower','upper','btrim','trim','ltrim','rtrim',
          'length','char_length','concat','concat_ws','substring','substr','position','replace','split_part','left','right',
          'to_char','to_date','to_timestamp','date_trunc','date_part','extract','abs','round','floor','ceil','md5',
          'json_build_object','jsonb_build_object','json_build_array','jsonb_build_array','json_agg','jsonb_agg',
          'array_agg','string_agg','bool_and','bool_or','row_number','rank','dense_rank','to_jsonb','to_json'])
        THEN static_ok := false; END IF;
      END LOOP;
    END IF;
    IF NOT static_ok THEN unreviewed := unreviewed || f.sig; ELSE readonly_list := readonly_list || f.sig; END IF;
  END LOOP;
  IF cardinality(unreviewed) > 0 THEN
    RAISE EXCEPTION 'BACKUP_READER_EXECUTABLE_WRITE_CAPABLE_DEFINER % (revoke EXECUTE from PUBLIC first)', array_to_string(unreviewed, ', ');
  END IF;
  RAISE NOTICE 'BACKUP_READER_VERIFIED %', json_build_object('writable_tables', 0, 'creatable_schemas', 0,
    'extra_roles', 0, 'bypassrls', true, 'pg_read_all_data', true,
    'default_read_only', current_setting('default_transaction_read_only'),
    'executable_security_definer', definer_functions,
    'executable_security_definer_static_read_only', readonly_list);
END
$verify$;
