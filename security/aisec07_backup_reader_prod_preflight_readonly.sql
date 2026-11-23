-- AISEC-07 production preflight. READ-ONLY (SELECT only, no DDL/DML), run once
-- as `postgres` in the Supabase SQL editor BEFORE creating backup_reader.
-- Answers: can this role create the backup login, and which PUBLIC-executable
-- SECURITY DEFINER functions would make aisec07_backup_reader_verify.sql
-- refuse the backup? Output: names and booleans only, no row data.
BEGIN READ ONLY;
SELECT 'role_capability' AS section, json_build_object(
  'server_version_num', current_setting('server_version_num')::int,
  'current_user', current_user,
  'is_superuser', r.rolsuper,
  'has_createrole', r.rolcreaterole,
  'has_bypassrls', r.rolbypassrls,               -- needed to CREATE ROLE ... BYPASSRLS
  'pg_read_all_data_exists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pg_read_all_data'),
  'can_grant_pg_read_all_data', r.rolsuper OR EXISTS (
      SELECT 1 FROM pg_auth_members m WHERE m.roleid = 'pg_read_all_data'::regrole AND m.member = r.oid AND m.admin_option),
  'backup_reader_exists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_reader')
)::text AS result
FROM pg_roles r WHERE r.rolname = current_user;

-- SECURITY DEFINER functions any role (PUBLIC) can execute, classified with the
-- SAME rule as the backup verifier. Any 'BLOCKS_BACKUP' row must have EXECUTE
-- revoked from PUBLIC (after checking app callers) or the backup will refuse.
WITH f AS (
  SELECT p.oid, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig,
         l.lanname, p.provolatile,
         EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') AS extension_owned,
         lower(regexp_replace(coalesce(p.prosrc,''), '--[^\n]*|/\*.*?\*/', ' ', 'g')) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
   WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')
     AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
), c AS (
  SELECT f.*, (f.lanname = 'sql'
      AND f.src ~ '^\s*\(?\s*(select|with|values|table)\M'
      AND rtrim(btrim(f.src), '; ') !~ ';'
      AND f.src !~ '\m(insert|update|delete|merge|truncate|copy|call|perform|execute|do|alter|create|drop|grant|revoke|lock|notify|listen|unlisten|refresh|vacuum|analyze|cluster|reindex|set|reset|discard|prepare|deallocate|nextval|setval|set_config|import|load|comment|security|returning)\M'
      AND f.src !~ '\mfor\s+(update|share|no\s+key|key)\M'
      AND NOT EXISTS (
        SELECT 1 FROM regexp_matches(f.src, '([a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?)\s*\(', 'g') m
         WHERE NOT m[1] = ANY (ARRAY[
          'select','from','join','where','and','or','not','on','as','when','then','else','in','exists','any','all','some',
          'over','filter','values','union','intersect','except','using','lateral','with','case','is','distinct','by','having',
          'limit','offset','array','row','cast','partition',
          'count','sum','min','max','avg','coalesce','nullif','greatest','least','lower','upper','btrim','trim','ltrim','rtrim',
          'length','char_length','concat','concat_ws','substring','substr','position','replace','split_part','left','right',
          'to_char','to_date','to_timestamp','date_trunc','date_part','extract','abs','round','floor','ceil','md5',
          'json_build_object','jsonb_build_object','json_build_array','jsonb_build_array','json_agg','jsonb_agg',
          'array_agg','string_agg','bool_and','bool_or','row_number','rank','dense_rank','to_jsonb','to_json']))
    ) AS static_read_only
    FROM f
)
SELECT 'public_executable_security_definer' AS section, sig, lanname AS language, provolatile AS volatility,
       extension_owned, CASE WHEN static_read_only THEN 'OK_STATIC_READ_ONLY' ELSE 'BLOCKS_BACKUP' END AS verdict
  FROM c ORDER BY verdict DESC, sig;
ROLLBACK;
