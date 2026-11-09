-- Backup-only SELECT: all 101 production public/auth/storage/private/session_guard tables
-- and schema/function/sequence/view/trigger/ACL metadata in a single PostgreSQL
-- statement snapshot. Never run with a key committed to source control.
-- Inject random, separately escrowed 64-hex passphrase into __SECRET_FROM_PRIVATE_ESCROW__.
WITH tbl AS MATERIALIZED (
 SELECT n.nspname AS sn, c.relname AS tn,
 jsonb_build_object(
  'schema',n.nspname,'table',c.relname,'owner',c.relowner::regrole::text,
  'rls',c.relrowsecurity,'relacl',to_jsonb(c.relacl),
  'row_xml',query_to_xml(format('SELECT row_to_json(r)::text AS row_json FROM %I.%I AS r',n.nspname,c.relname),false,true,'')::text,
  'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum),'[]'::jsonb)
     FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'ddl',pg_get_constraintdef(con.oid)) ORDER BY con.conname),'[]'::jsonb) FROM pg_constraint con WHERE con.conrelid=c.oid),
  'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(idx.indexrelid) ORDER BY idx.indexrelid),'[]'::jsonb) FROM pg_index idx WHERE idx.indrelid=c.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('ddl',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'permissive',p.polpermissive,'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid)
 ) AS item
 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname IN ('public','auth','storage','private','session_guard') AND c.relkind IN ('r','p') AND NOT c.relispartition
), backup AS MATERIALIZED (
 SELECT jsonb_build_object(
  'format','baekeok-readonly-encrypted-logical-db-snapshot-v1',
  'project','waluhdgqhwjjwmflhrle',
  'captured_at',transaction_timestamp()::text,
  'server_version',current_setting('server_version'),
  'database',current_database(),
  'scope',jsonb_build_array('public','auth','storage','private','session_guard'),
  'table_count',(SELECT count(*) FROM tbl),
  'tables',(SELECT jsonb_agg(item ORDER BY sn,tn) FROM tbl),
  'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'ddl',pg_get_functiondef(p.oid),'acl',to_jsonb(p.proacl)) ORDER BY n.nspname,p.proname),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage','private','session_guard')),
  'views',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true),'kind',c.relkind) ORDER BY n.nspname,c.relname),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','private','session_guard') AND c.relkind IN ('v','m')),
  'sequences',(SELECT coalesce(jsonb_agg(jsonb_build_object('schemaname',s.schemaname,'sequencename',s.sequencename,'data_type',s.data_type,'start_value',s.start_value,'min_value',s.min_value,'max_value',s.max_value,'increment_by',s.increment_by,'cycle',s.cycle,'cache_size',s.cache_size,'last_value',s.last_value) ORDER BY s.schemaname,s.sequencename),'[]'::jsonb) FROM pg_sequences s WHERE s.schemaname IN ('public','auth','storage','private','session_guard')),
  'extensions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',extname,'schema',extnamespace::regnamespace::text,'version',extversion) ORDER BY extname),'[]'::jsonb) FROM pg_extension),
  'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner::regrole::text,'acl',to_jsonb(nspacl)) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','auth','storage','private','session_guard')),
  'enums',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'type',t.typname,'value',e.enumlabel,'order',e.enumsortorder) ORDER BY n.nspname,t.typname,e.enumsortorder),'[]'::jsonb) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','storage','private','session_guard')),
  'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',r.rolname,'canlogin',r.rolcanlogin,'inherit',r.rolinherit,'createrole',r.rolcreaterole,'superuser',r.rolsuper,'connlimit',r.rolconnlimit) ORDER BY r.rolname),'[]'::jsonb) FROM pg_roles r),
  'role_memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',m.roleid::regrole::text,'member',m.member::regrole::text,'grantor',m.grantor::regrole::text) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m)
 )::text AS payload
), sealed AS MATERIALIZED (
 SELECT CASE WHEN '__SECRET_FROM_PRIVATE_ESCROW__' ~ '^[a-f0-9]{64}$'
          THEN pgp_sym_encrypt(payload,'__SECRET_FROM_PRIVATE_ESCROW__','cipher-algo=aes256,compress-algo=1,compress-level=6')
          ELSE NULL::bytea END AS cipher,
        octet_length(payload) AS plaintext_bytes
 FROM backup
), encoded AS MATERIALIZED (
 SELECT translate(encode(cipher,'base64'),E'\n','') AS b64,
        encode(digest(cipher,'sha256'),'hex') AS sha256_cipher,
        octet_length(cipher) AS cipher_bytes,
        plaintext_bytes
 FROM sealed
)
SELECT jsonb_build_object('chunk',s.part,'data',substr(e.b64,(s.part-1)*12000+1,12000),
 'count',ceil(length(e.b64)::numeric/12000)::int,
 'cipher_sha256',e.sha256_cipher,'cipher_bytes',e.cipher_bytes,'plain_bytes',e.plaintext_bytes,
 'base64_length',length(e.b64)) AS sealed_part
FROM encoded e
CROSS JOIN LATERAL generate_series(1,ceil(length(e.b64)::numeric/12000)::int) s(part)
ORDER BY s.part;