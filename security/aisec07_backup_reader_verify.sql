-- AISEC-07 fail-closed verifier, run AS the backup login before every capture.
-- Raises (non-zero psql exit) unless the connected role is provably unable to
-- write. Prints one JSON line of counts only (no data, no names of tables).
DO $verify$
DECLARE
  r pg_roles%ROWTYPE;
  writable_tables int; creatable_schemas int; other_roles int; writer_roles int;
  definer_functions int; f record; callee record; static_ok boolean;
  unreviewed text[] := '{}'; readonly_list text[] := '{}';
  w record; guarded boolean; guard_fn regprocedure; ddl_fn regprocedure; ddl_guard_ok boolean;
  unguarded text[] := '{}'; guarded_list text[] := '{}'; residual_list text[] := '{}';
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
  -- Per (table, privilege). A write privilege granted to PUBLIC by an extension
  -- (pg_net) is neutralised ONLY by a valid guard: an enabled, BEFORE,
  -- statement-level trigger covering that exact operation and calling
  -- backup_guard.deny_backup_reader_write(), a function this login neither owns
  -- nor can replace (security/aisec07_backup_reader_net_guard.sql). Anything
  -- else is reported by name. An entry in the owner-approved accepted list
  -- (custom setting aisec07.accepted_residual, 'schema.table:PRIV,...', empty
  -- by default) is reported as a residual, never silently passed.
  guard_fn := to_regprocedure('backup_guard.deny_backup_reader_write()');
  ddl_fn := to_regprocedure('backup_guard.deny_backup_reader_ddl()');
  ddl_guard_ok := ddl_fn IS NOT NULL
    AND NOT pg_has_role((SELECT proowner FROM pg_proc WHERE oid = ddl_fn), 'USAGE')
    AND EXISTS (SELECT 1 FROM pg_event_trigger e WHERE e.evtfoid = ddl_fn AND e.evtevent = 'ddl_command_start'
                   AND e.evtenabled IN ('O','A') AND (e.evttags IS NULL OR cardinality(e.evttags) = 0));
  FOR w IN
    SELECT c.oid, n.nspname||'.'||c.relname AS rel, p.priv
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES','OWNER']
        || CASE WHEN current_setting('server_version_num')::int >= 170000 THEN ARRAY['MAINTAIN'] ELSE '{}'::text[] END) AS p(priv)
     WHERE c.relkind IN ('r','p','v','m','f')
       AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\_toast%'
       AND CASE WHEN p.priv = 'OWNER' THEN pg_has_role(c.relowner, 'USAGE') ELSE has_table_privilege(c.oid, p.priv) END
     ORDER BY 2, 3
  LOOP
    -- TRIGGER/REFERENCES are only usable through DDL, which the event-trigger
    -- guard rejects for this login.
    guarded := (w.priv IN ('TRIGGER','REFERENCES') AND ddl_guard_ok) OR (guard_fn IS NOT NULL
      AND NOT pg_has_role((SELECT proowner FROM pg_proc WHERE oid = guard_fn), 'USAGE')
      AND EXISTS (SELECT 1 FROM pg_trigger t
                   WHERE t.tgrelid = w.oid AND t.tgfoid = guard_fn AND t.tgenabled IN ('O','A')
                     AND (t.tgtype & 1) = 0 AND (t.tgtype & 2) = 2
                     AND (t.tgtype & CASE w.priv WHEN 'INSERT' THEN 4 WHEN 'DELETE' THEN 8
                                                 WHEN 'UPDATE' THEN 16 WHEN 'TRUNCATE' THEN 32 ELSE 0 END) <> 0));
    IF guarded THEN guarded_list := guarded_list || (w.rel||':'||w.priv);
    ELSIF (w.rel||':'||w.priv) = ANY (string_to_array(coalesce(current_setting('aisec07.accepted_residual', true), ''), ','))
      THEN residual_list := residual_list || (w.rel||':'||w.priv);
    ELSE unguarded := unguarded || (w.rel||':'||w.priv);
    END IF;
  END LOOP;
  writable_tables := cardinality(unguarded);
  SELECT count(*) INTO creatable_schemas FROM pg_namespace n
   WHERE has_schema_privilege(n.oid, 'CREATE') OR pg_has_role(n.nspowner, 'USAGE');
  IF writable_tables > 0 OR creatable_schemas > 0 OR has_database_privilege(current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'BACKUP_READER_HAS_WRITE_PRIVILEGE tables=% schemas=% unguarded=%', writable_tables, creatable_schemas, array_to_string(unguarded, ', ');
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
    'executable_security_definer_static_read_only', readonly_list,
    'extension_public_writes_guarded', guarded_list, 'ddl_guard', ddl_guard_ok, 'owner_accepted_residual_writes', residual_list);
END
$verify$;
