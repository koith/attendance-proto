#!/usr/bin/env python3
"""Restore a PRIVATE encrypted logical backup to an ISOLATED local PostgreSQL.

Default mode reconstructs typed tables + enums, actual row values, PK/UNIQUE/FK
and NOT NULL constraints and standalone sequences with their archived position.
Every inserted batch is re-serialized from its typed value and compared with the
archived row, so a row count match alone can never report PASS for silently
altered values.

--with-schema-objects additionally rebuilds, from the same archive: roles
(always NOLOGIN, never superuser), allow-listed extensions, functions, views,
column defaults, identity and generated columns, CHECK constraints, secondary
indexes, RLS flags and policies, triggers, ownership and ACLs. It then re-reads
the restored catalog with the capture expressions and reports, per object
class, what is identical to the archive and what is not (the R3 receipt).
Archive DDL is never emitted as top-level script text: each statement is
validated as ONE statement of the expected kind and executed inside a
savepoint, so one unrestorable object is reported instead of hiding the rest.

Neither mode restores Auth/Storage SERVICES, Storage file blobs, Edge Functions
or provider-managed schemas. Therefore it is NOT full disaster recovery
acceptance. Never writes plaintext backup to a file.
"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
from decimal import Decimal
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

SCHEMAS = {'public', 'auth', 'storage', 'private', 'session_guard'}
FORMAT = 'baekeok-readonly-encrypted-logical-db-snapshot-v1'
IDENT = re.compile(r'^[a-zA-Z_][a-zA-Z_0-9]*$')
BASE_TYPES = {'text', 'bigint', 'uuid', 'boolean', 'integer', 'jsonb',
              'date', 'timestamp with time zone', 'timestamp without time zone',
              'time without time zone', 'text[]', 'smallint', 'inet', 'bytea', 'json', 'numeric'}
TYPE_PARAMS = re.compile(r'^(?:character varying|numeric)\(\d+(?:,\d+)?\)$')
# pg_get_constraintdef() output for PK/UNIQUE, matched in FULL. The DDL text is
# appended to generated SQL, so a prefix-only check would let archive content
# smuggle arbitrary statements after the column list.
_COLREF = r'(?:[a-z_][a-z_0-9]*|"[A-Za-z_][A-Za-z_0-9]*")'
_COLLIST = _COLREF + r'(?:, ' + _COLREF + r')*'
CONSTRAINT_DDL = re.compile(r'^(?:PRIMARY KEY|UNIQUE) \((' + _COLLIST + r')\)(?: INCLUDE \((' + _COLLIST + r')\))?'
                            r'(?: DEFERRABLE(?: INITIALLY (?:DEFERRED|IMMEDIATE))?)?$')
FK_DDL = re.compile(r'^FOREIGN KEY \(('+_COLLIST+r')\) REFERENCES '
                    r'(?:(('+_COLREF+r')\.)?('+_COLREF+r'))\(('+_COLLIST+r')\)'
                    r'(?: ON DELETE (CASCADE|RESTRICT|SET NULL))?$')
SEQ_TYPES = {'bigint', 'integer', 'smallint'}
NEXTVAL = re.compile(r"^nextval\('((?:\"?[A-Za-z_][A-Za-z_0-9]*\"?\.)?\"?[A-Za-z_][A-Za-z_0-9]*\"?)'::regclass\)$")
SUMMARY_TAG = 'SEC_RESTORE_SUMMARY:'


def quote(v):
    if not isinstance(v, str) or not IDENT.fullmatch(v):
        raise ValueError('unsafe SQL identifier in archive')
    return '"' + v + '"'


def require_type(v, allowed_enum):
    if v in BASE_TYPES or TYPE_PARAMS.fullmatch(v):
        return v
    if isinstance(v, str) and '.' in v:
        sch, typ = v.split('.', 1)
        if (sch, typ) in allowed_enum:
            return quote(sch) + '.' + quote(typ)
    raise ValueError('unsupported PostgreSQL column type; stop before restore')


def decode(archive, key_file, expected_sha256=''):
    archive = Path(archive)
    key_file = Path(key_file)
    if not archive.is_file() or not key_file.is_file():
        raise ValueError('encrypted snapshot or private key missing')
    ciphertext = archive.read_bytes()
    digest = hashlib.sha256(ciphertext).hexdigest()
    if expected_sha256 and digest.lower() != expected_sha256.lower():
        raise ValueError('encrypted SHA-256 mismatch')
    key = json.loads(key_file.read_text())
    secret = key.get('passphrase_hex', '')
    if key.get('format') not in ('baekeok-pgcrypto-logical-recovery-key-v1', 'baekeok-pgcrypto-logical-recovery-key-offline-v1'):
        raise ValueError('unexpected private recovery key format')
    if not re.fullmatch('[0-9a-f]{64}', secret):
        raise ValueError('invalid recovery key encoding')
    p = subprocess.run(['gpg', '--batch', '--no-tty', '--pinentry-mode', 'loopback',
                        '--passphrase-fd', '0', '--decrypt', str(archive)],
                       input=(secret+'\n').encode('ascii'),
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if p.returncode != 0:
        raise ValueError('decryption failed')
    try:
        result = json.loads(p.stdout)
    except (UnicodeError, json.JSONDecodeError):
        raise ValueError('invalid decrypted JSON') from None
    if result.get('format') != FORMAT:
        raise ValueError('unrecognized logical snapshot format')
    return result, digest


def parse_rows(table):
    tree = ET.fromstring('<snapshot_root>' + table.get('row_xml', '') + '</snapshot_root>')
    for row in tree.findall('.//row'):
        el = row.find('row_json')
        if el is None or not isinstance(el.text, str):
            raise ValueError('missing source row')
        obj = json.loads(el.text, parse_float=Decimal)
        if not isinstance(obj, dict):
            raise ValueError('source row not JSON object')
        yield obj, el.text


def constraint_ddl(ddl, colnames):
    """Return ddl only if it is exactly a PK/UNIQUE definition over known columns."""
    m = CONSTRAINT_DDL.fullmatch(ddl) if isinstance(ddl, str) else None
    if not m:
        # PG may include NULLS NOT DISTINCT or other novel syntax.
        raise ValueError('unrecognized PK/UNIQUE constraint; fail closed')
    for group in m.groups():
        for col in (group or '').split(', '):
            if col and col.strip('"') not in colnames:
                raise ValueError('unrecognized PK/UNIQUE constraint; fail closed')
    return ddl



def fk_ddl(definition, current_schema, colnames, table_columns):
    """Canonical FK DDL only for captured names and strict grammar."""
    m = FK_DDL.fullmatch(definition) if isinstance(definition,str) else None
    if m is None: raise ValueError('unrecognized FK definition; fail closed')
    src_cols, _, explicit_schema, ref_table, ref_cols, delete_action = m.groups()
    def bare(s):
        return s[1:-1] if s.startswith('"') and s.endswith('"') else s
    src=[bare(c) for c in src_cols.split(', ')]
    dst=[bare(c) for c in ref_cols.split(', ')]
    table=bare(ref_table)
    schema=bare(explicit_schema) if explicit_schema else None
    if schema is None:
        options=[(n,table) for n in ('public',current_schema) if (n,table) in table_columns]
        if not options: raise ValueError('FK target table not captured')
        schema=options[0][0]
    if len(src)!=len(dst) or not src or (schema,table) not in table_columns:
        raise ValueError('invalid FK arity or target')
    if any(c not in colnames for c in src) or any(c not in table_columns[(schema,table)] for c in dst):
        raise ValueError('FK references unknown columns')
    return ('FOREIGN KEY ('+', '.join(quote(c) for c in src)+
            ') REFERENCES '+quote(schema)+'.'+quote(table)+
            ' ('+', '.join(quote(c) for c in dst)+')'+
            (' ON DELETE '+delete_action if delete_action else ''))


def as_int(v):
    if isinstance(v, bool) or not isinstance(v, int):
        raise ValueError('invalid sequence metadata')
    return v


def roundtrip_predicate(columns):
    """SQL predicate: typed value r.col re-serializes to the archived JSON s.e."""
    parts = []
    for c in columns:
        name = quote(c['name'])
        key = "'" + c['name'] + "'"  # IDENT-validated by quote(): no quoting hazards
        if c['type'] == 'timestamp with time zone':
            # Rendering depends on the session time zone; compare the instant.
            parts.append('(s.e->>' + key + ')::timestamptz IS NOT DISTINCT FROM r.' + name)
        else:
            parts.append("coalesce(to_jsonb(r." + name + "),'null'::jsonb) = s.e->" + key)
    return ' AND '.join(parts)


def dollar(text, salt):
    n = 0
    while True:
        delim = '$BACKUP_' + str(salt) + '_' + str(n) + '$'
        if delim not in text:
            return delim + text + delim
        n += 1


# ---------------------------------------------------------------------------
# Schema-object phase (--with-schema-objects)
# ---------------------------------------------------------------------------
CATALOG_TAG = 'SEC_RESTORE_CATALOG:'
ERROR_TAG = 'SEC_RESTORE_ERROR:'
# Extensions that only add SQL-callable helpers. Anything else (pg_net, pg_cron,
# supabase_vault, pg_graphql ...) is provider infrastructure and is reported.
EXT_ALLOW = {'pgcrypto', 'uuid-ossp', 'citext', 'pg_trgm', 'btree_gin', 'btree_gist', 'hstore', 'unaccent'}
EXT_NAME = re.compile(r'^[a-z_][a-z0-9_-]{0,62}$')
ACLITEM = re.compile(r'^([A-Za-z_][A-Za-z_0-9]*|)=([a-zA-Z*]+)/(.+)$')
PRIVS = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE', 'D': 'TRUNCATE', 'x': 'REFERENCES',
         't': 'TRIGGER', 'm': 'MAINTAIN', 'X': 'EXECUTE', 'U': 'USAGE', 'C': 'CREATE'}
POLCMD = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE', '*': 'ALL'}
_ID = r'(?:[A-Za-z_][A-Za-z_0-9$]*|"[A-Za-z_0-9$]+")'
FUNC_HEAD = re.compile(r'^CREATE OR REPLACE (?:FUNCTION|PROCEDURE) (' + _ID + r')\.(' + _ID + r')\(')
FUNC_LANG = re.compile(r'\n LANGUAGE ([a-z_0-9]+)\n')
INDEX_HEAD = re.compile(r'^CREATE (?:UNIQUE )?INDEX (' + _ID + r') ON (?:ONLY )?(' + _ID + r')\.(' + _ID + r') '
                        r'USING (?:btree|hash|gin|gist|brin|spgist) \(')
_EVT = r'(?:INSERT|DELETE|TRUNCATE|UPDATE(?: OF ' + _ID + r'(?:, ' + _ID + r')*)?)'
TRIGGER_HEAD = re.compile(r'^CREATE (?:CONSTRAINT )?TRIGGER (' + _ID + r') (?:BEFORE|AFTER|INSTEAD OF) ' + _EVT +
                          r'(?: OR ' + _EVT + r')* ON (' + _ID + r')\.(' + _ID + r') ')
VIEW_HEAD = re.compile(r'^\s*(?:SELECT|WITH|VALUES)\b')
RELOPTION = re.compile(r'^[a-z_]+=[a-z0-9_]+$')


class Unsupported(ValueError):
    """Archive object that this tool refuses to turn into SQL (reported, never guessed)."""


def sql_skeleton(text):
    """Blank out quoted regions of ONE archived SQL fragment and fail closed.

    Refuses anything that could end the statement or hide text from this
    check: a ';' or backslash outside quotes, any comment, an unterminated
    quote, or parentheses that close more than they open. The result is used
    only for structural checks; the original text is what gets executed.
    """
    if not isinstance(text, str) or '\x00' in text:
        raise Unsupported('not SQL text')
    out = []
    depth = 0
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        prev = text[i-1] if i else ''
        if ch == "'":
            esc = prev in ('e', 'E') and not (i >= 2 and (text[i-2].isalnum() or text[i-2] in '_"$'))
            j = i + 1
            while True:
                if j >= n:
                    raise Unsupported('unterminated string')
                if esc and text[j] == '\\':
                    j += 2
                    continue
                if text[j] == "'":
                    if j + 1 < n and text[j+1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            out.append("''")
            i = j + 1
        elif ch == '"':
            j = i + 1
            while True:
                if j >= n:
                    raise Unsupported('unterminated identifier')
                if text[j] == '"':
                    if j + 1 < n and text[j+1] == '"':
                        j += 2
                        continue
                    break
                j += 1
            body = text[i+1:j]
            out.append('"' + body + '"' if re.fullmatch(r'[A-Za-z_0-9$]+', body) else '"?"')
            i = j + 1
        elif ch == '$' and not (prev.isalnum() or prev == '_'):
            m = re.match(r'\$([A-Za-z_][A-Za-z_0-9]*)?\$', text[i:])
            if m:
                end = text.find(m.group(0), i + len(m.group(0)))
                if end < 0:
                    raise Unsupported('unterminated dollar quote')
                out.append('$$')
                i = end + len(m.group(0))
            elif i + 1 < n and text[i+1].isdigit():
                out.append(ch)
                i += 1
            else:
                raise Unsupported('unexpected dollar sign')
        elif ch in ';\\' or text.startswith('--', i) or text.startswith('/*', i):
            raise Unsupported('statement terminator, backslash or comment in archived SQL')
        else:
            if ch in '([':
                depth += 1
            elif ch in ')]':
                depth -= 1
                if depth < 0:
                    raise Unsupported('unbalanced parentheses')
            out.append(ch)
            i += 1
    if depth:
        raise Unsupported('unbalanced parentheses')
    return ''.join(out)


def sql_expr(text):
    """Archived expression that is safe to embed INSIDE parentheses we add."""
    if not isinstance(text, str) or not text.strip():
        raise Unsupported('empty expression')
    sql_skeleton(text)
    return text


def _bare(ident):
    return ident[1:-1] if ident.startswith('"') else ident


def function_ddl(f):
    ddl = f.get('ddl')
    sk = sql_skeleton(ddl.rstrip() if isinstance(ddl, str) else None)
    m = FUNC_HEAD.match(sk)
    if not m or (_bare(m.group(1)), _bare(m.group(2))) != (f.get('schema'), f.get('name')):
        raise Unsupported('function definition does not match its metadata')
    lang = FUNC_LANG.search(sk)
    if not lang or lang.group(1) not in ('sql', 'plpgsql'):
        # C/internal functions belong to an extension; never load a library named by an archive.
        raise Unsupported('LANG')
    return ddl.rstrip()


def index_ddl(ddl, schema, table):
    m = INDEX_HEAD.match(sql_skeleton(ddl))
    if not m or (_bare(m.group(2)), _bare(m.group(3))) != (schema, table):
        raise Unsupported('index definition does not match its table')
    return _bare(m.group(1)), ddl


def trigger_ddl(ddl, schema, table):
    sk = sql_skeleton(ddl)
    m = TRIGGER_HEAD.match(sk)
    if not m or (_bare(m.group(2)), _bare(m.group(3))) != (schema, table) or ' EXECUTE FUNCTION ' not in sk:
        raise Unsupported('trigger definition does not match its table')
    return _bare(m.group(1)), ddl


def check_ddl(ddl):
    """CHECK (<expr>) with nothing after the closing parenthesis but known flags."""
    sk = sql_skeleton(ddl)
    if not sk.startswith('CHECK ('):
        raise Unsupported('not a CHECK constraint')
    depth = 0
    for pos in range(6, len(sk)):
        depth += sk[pos] in '(['
        depth -= sk[pos] in ')]'
        if depth == 0:
            break
    if sk[pos+1:] not in ('', ' NOT VALID', ' NO INHERIT', ' NO INHERIT NOT VALID'):
        raise Unsupported('unexpected text after CHECK expression')
    return ddl


def view_ddl(v):
    body = (v.get('definition') or '').rstrip()
    if body.endswith(';'):
        body = body[:-1]
    if not VIEW_HEAD.match(sql_skeleton(body)):
        raise Unsupported('view definition is not a query')
    opts = v.get('reloptions') or []
    if any(not isinstance(o, str) or not RELOPTION.fullmatch(o) for o in opts):
        raise Unsupported('view options')
    return ('CREATE ' + ('MATERIALIZED ' if v.get('kind') == 'm' else '') + 'VIEW ' +
            quote(v['schema']) + '.' + quote(v['name']) + (' WITH (' + ', '.join(opts) + ')' if opts else '') +
            ' AS ' + body)


def parse_acl(acl):
    """to_jsonb(aclitem[]) -> [(grantee or 'public', privilege letters)]."""
    items = []
    for item in acl:
        m = ACLITEM.fullmatch(item) if isinstance(item, str) else None
        if not m or any(ch not in PRIVS and ch != '*' for ch in m.group(2)):
            raise Unsupported('unrecognized ACL item')
        items.append((m.group(1) or 'public', m.group(2)))
    return items


def acl_sql(kind, obj, acl, target_major):
    stmts = ['REVOKE ALL ON ' + kind + ' ' + obj + ' FROM PUBLIC']
    for grantee, privs in parse_acl(acl):
        who = 'PUBLIC' if grantee == 'public' else quote(grantee)
        plain, opt = [], []
        for letter in re.findall(r'[a-zA-Z]\*?', privs):
            if letter[0] == 'm' and target_major < 17:
                continue
            (opt if letter.endswith('*') else plain).append(PRIVS[letter[0]])
        if plain:
            stmts.append('GRANT ' + ', '.join(plain) + ' ON ' + kind + ' ' + obj + ' TO ' + who)
        if opt:
            stmts.append('GRANT ' + ', '.join(opt) + ' ON ' + kind + ' ' + obj + ' TO ' + who + ' WITH GRANT OPTION')
    return '; '.join(stmts)


def norm_acl(acl, target_major):
    """Grantee -> privileges, ignoring the grantor (not reproducible without SET ROLE)."""
    if acl is None:
        return None
    merged = defaultdict(set)
    for grantee, privs in parse_acl(acl):
        merged[grantee] |= {l for l in re.findall(r'[a-zA-Z]\*?', privs) if not (l[0] == 'm' and target_major < 17)}
    return sorted((g, ''.join(sorted(p))) for g, p in merged.items() if p)


def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


def routine_ref(f):
    return quote(f['schema']) + '.' + quote(f['name']) + '(' + (sql_expr(f['identity']) if f.get('identity') else '') + ')'


PRELUDE_SQL = r"""
SET LOCAL standard_conforming_strings TO on;
SET LOCAL check_function_bodies TO off;
CREATE TEMP TABLE sec_obj_log(kind text, ident text, ok boolean, sqlstate text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.sec_log(k text, i text, good boolean, st text) RETURNS void LANGUAGE plpgsql AS $SEC$
BEGIN DELETE FROM sec_obj_log WHERE kind = k AND ident = i;
  INSERT INTO sec_obj_log VALUES (k, i, good, st); END $SEC$;
CREATE FUNCTION pg_temp.sec_try(k text, i text, ddl text, retry boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $SEC$
BEGIN
  IF retry AND EXISTS (SELECT 1 FROM sec_obj_log WHERE kind = k AND ident = i AND ok) THEN RETURN; END IF;
  BEGIN EXECUTE ddl;
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.sec_log(k, i, false, SQLSTATE); RETURN; END;
  PERFORM pg_temp.sec_log(k, i, true, NULL);
END $SEC$;
CREATE FUNCTION pg_temp.sec_must(tag text, ddl text) RETURNS void LANGUAGE plpgsql AS $SEC$
BEGIN EXECUTE ddl; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SEC_RESTORE_ERROR:%', tag; END $SEC$;
CREATE FUNCTION pg_temp.sec_role(n text, bypass boolean) RETURNS void LANGUAGE plpgsql AS $SEC$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = n) THEN PERFORM pg_temp.sec_log('role_preexisting', n, true, NULL); RETURN; END IF;
  EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION %s', n,
                 CASE WHEN bypass THEN 'BYPASSRLS' ELSE 'NOBYPASSRLS' END);
  PERFORM pg_temp.sec_log('role', n, true, NULL);
END $SEC$;
CREATE FUNCTION pg_temp.sec_member(r text, m text) RETURNS void LANGUAGE plpgsql AS $SEC$
BEGIN
  IF (SELECT rolsuper FROM pg_roles WHERE rolname = r) IS NOT FALSE OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = m) THEN
    PERFORM pg_temp.sec_log('membership_skipped', r || '<-' || m, true, NULL); RETURN; END IF;
  PERFORM pg_temp.sec_try('membership', r || '<-' || m, format('GRANT %I TO %I', r, m));
END $SEC$;
CREATE FUNCTION pg_temp.sec_ext(n text, s text) RETURNS void LANGUAGE plpgsql AS $SEC$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = n) THEN PERFORM pg_temp.sec_log('extension', n, true, NULL); RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = n) THEN
    PERFORM pg_temp.sec_log('extension', n, false, 'UNAVL'); RETURN; END IF;
  PERFORM pg_temp.sec_try('extension', n, format('CREATE SCHEMA IF NOT EXISTS %I; CREATE EXTENSION %I WITH SCHEMA %I', s, n, s));
END $SEC$;
"""

# The restored catalog, read with the SAME expressions as the capture statement.
PROBE_SQL = r"""
SELECT 'SEC_RESTORE_CATALOG:' || jsonb_build_object(
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'owner',c.relowner::regrole::text,
   'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'relacl',to_jsonb(c.relacl),
   'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum),'[]'::jsonb)
     FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'ddl',pg_get_constraintdef(con.oid)) ORDER BY con.conname),'[]'::jsonb) FROM pg_constraint con WHERE con.conrelid=c.oid),
   'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(idx.indexrelid) ORDER BY idx.indexrelid),'[]'::jsonb) FROM pg_index idx WHERE idx.indrelid=c.oid),
   'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('ddl',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
   'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT coalesce(jsonb_agg(CASE WHEN o.r=0 THEN 'public' ELSE pg_get_userbyid(o.r) END ORDER BY o.ord),'[]'::jsonb) FROM unnest(p.polroles) WITH ORDINALITY AS o(r,ord)),'using',pg_get_expr(p.polqual,p.polrelid),'with_check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid)
   ) ORDER BY n.nspname,c.relname),'[]'::jsonb)
   FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
   WHERE n.nspname IN ('public','auth','storage','private','session_guard') AND c.relkind IN ('r','p') AND NOT c.relispartition),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'ddl',pg_get_functiondef(p.oid),'acl',to_jsonb(p.proacl),'owner',p.proowner::regrole::text)),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage','private','session_guard') AND p.prokind IN ('f','p')),
 'views',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid,true),'kind',c.relkind,'owner',c.relowner::regrole::text,'acl',to_jsonb(c.relacl),'reloptions',to_jsonb(c.reloptions))),'[]'::jsonb) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage','private','session_guard') AND c.relkind IN ('v','m')),
 'sequences',(SELECT coalesce(jsonb_agg(jsonb_build_object('schemaname',s.schemaname,'sequencename',s.sequencename,'data_type',s.data_type,'start_value',s.start_value,'min_value',s.min_value,'max_value',s.max_value,'increment_by',s.increment_by,'cycle',s.cycle,'cache_size',s.cache_size,'last_value',s.last_value)),'[]'::jsonb) FROM pg_sequences s WHERE s.schemaname IN ('public','auth','storage','private','session_guard')),
 'extensions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',extname,'schema',extnamespace::regnamespace::text)),'[]'::jsonb) FROM pg_extension),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner::regrole::text,'acl',to_jsonb(nspacl))) FROM pg_namespace WHERE nspname IN ('public','auth','storage','private','session_guard')),
 'enums',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'type',t.typname,'value',e.enumlabel,'order',e.enumsortorder) ORDER BY n.nspname,t.typname,e.enumsortorder),'[]'::jsonb) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','storage','private','session_guard')),
 'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',r.rolname)),'[]'::jsonb) FROM pg_roles r)
)::text;
"""


def emit_prelude(out, snapshot, search_path):
    """Before any table exists: helpers, roles, extensions, first function pass."""
    out('SET LOCAL search_path TO ' + ', '.join(quote(s) for s in search_path) + ';')
    out(PRELUDE_SQL)
    for role in snapshot.get('roles') or []:
        name = role.get('name')
        if isinstance(name, str) and IDENT.fullmatch(name) and not name.startswith('pg_'):
            out('SELECT pg_temp.sec_role(' + lit(name) + ', ' + ('true' if role.get('bypassrls') is True else 'false') + ');')
    for ext in snapshot.get('extensions') or []:
        name, schema = ext.get('name'), ext.get('schema')
        if name == 'plpgsql':
            continue
        if name in EXT_ALLOW and EXT_NAME.fullmatch(name) and isinstance(schema, str) and IDENT.fullmatch(schema):
            out('SELECT pg_temp.sec_ext(' + lit(name) + ', ' + lit(schema) + ');')
        else:
            out('SELECT pg_temp.sec_log(' + lit('extension') + ', ' + lit(str(name)[:63]) + ", false, 'NOTAL');")
    emit_functions(out, snapshot, retry=False)


def emit_functions(out, snapshot, retry):
    for n, f in enumerate(snapshot.get('functions') or []):
        ident = str(f.get('schema')) + '.' + str(f.get('name')) + '(' + str(f.get('identity') or '') + ')'
        try:
            if f.get('schema') not in SCHEMAS:
                raise Unsupported('function outside expected schema')
            ddl = function_ddl(f)
        except Unsupported as exc:
            if not retry:
                out('SELECT pg_temp.sec_log(' + lit('function_skipped_language' if str(exc) == 'LANG' else 'function') +
                    ', ' + lit(ident) + ", false, 'UNSUP');")
            continue
        out('SELECT pg_temp.sec_try(' + lit('function') + ', ' + lit(ident) + ', ' + dollar(ddl, 'f' + str(n)) +
            ', ' + ('true' if retry else 'false') + ');')


def emit_views(out, snapshot, retry):
    for n, v in enumerate(snapshot.get('views') or []):
        ident = str(v.get('schema')) + '.' + str(v.get('name'))
        try:
            if v.get('schema') not in SCHEMAS:
                raise Unsupported('view outside expected schema')
            ddl = view_ddl(v)
        except (Unsupported, ValueError):
            if not retry:
                out('SELECT pg_temp.sec_log(' + lit('view') + ', ' + lit(ident) + ", false, 'UNSUP');")
            continue
        out('SELECT pg_temp.sec_try(' + lit('view') + ', ' + lit(ident) + ', ' + dollar(ddl, 'v' + str(n)) +
            ', ' + ('true' if retry else 'false') + ');')


def emit_schema_objects(out, snapshot, tables, seqs, inline_generated, target_major):
    """After data, keys and sequences: everything else, triggers last."""
    serial = [0]

    def attempt(kind, ident, build):
        """build() returns SQL or raises; an unsupported object is logged, not guessed."""
        serial[0] += 1
        try:
            ddl = build()
        except (Unsupported, ValueError, KeyError, TypeError):
            out('SELECT pg_temp.sec_log(' + lit(kind) + ', ' + lit(ident) + ", false, 'UNSUP');")
            return
        out('SELECT pg_temp.sec_try(' + lit(kind) + ', ' + lit(ident) + ', ' + dollar(ddl, 'o' + str(serial[0])) + ');')

    ordered = sorted(tables, key=lambda z: (z['schema'], z['table']))
    for _ in range(3):  # functions and views may depend on tables and on each other
        emit_functions(out, snapshot, retry=True)
        emit_views(out, snapshot, retry=True)

    for t in ordered:
        schema, name = t['schema'], t['table']
        tid = quote(schema) + '.' + quote(name)
        label = schema + '.' + name
        backing = {c['name'] for c in t.get('constraints', []) if c.get('type') in ('p', 'u')}
        for c in t['columns']:
            col = quote(c['name'])
            clabel = label + '.' + c['name']
            if c.get('generated'):
                if (schema, name, c['name']) not in inline_generated:
                    out('SELECT pg_temp.sec_log(' + lit('generated_kept_as_values') + ', ' + lit(clabel) + ", false, 'DEMOT');")
                continue
            if c.get('identity') in ('a', 'd'):
                key = (schema, name + '_' + c['name'] + '_seq')
                how = 'ALWAYS' if c['identity'] == 'a' else 'BY DEFAULT'
                if key in seqs:
                    q = seqs[key]['meta']
                    sid = quote(key[0]) + '.' + quote(key[1])
                    opts = ('SEQUENCE NAME ' + sid + ' INCREMENT BY ' + str(as_int(q['increment_by'])) +
                            ' MINVALUE ' + str(as_int(q['min_value'])) + ' MAXVALUE ' + str(as_int(q['max_value'])) +
                            ' START WITH ' + str(as_int(q['start_value'])) + ' CACHE ' + str(as_int(q['cache_size'])) +
                            (' CYCLE' if q.get('cycle') is True else ' NO CYCLE'))
                    last = q.get('last_value')
                    ddl = ('DROP SEQUENCE ' + sid + '; ALTER TABLE ' + tid + ' ALTER COLUMN ' + col +
                           ' ADD GENERATED ' + how + ' AS IDENTITY (' + opts + ')' +
                           ('' if last is None else "; SELECT setval('" + sid + "'::regclass, " + str(as_int(last)) + ', true)'))
                    attempt('identity', clabel, lambda ddl=ddl: ddl)
                else:
                    out('SELECT pg_temp.sec_log(' + lit('identity') + ', ' + lit(clabel) + ", false, 'NOSEQ');")
                continue
            if c.get('default') is not None:
                attempt('default', clabel, lambda c=c, col=col: 'ALTER TABLE ' + tid + ' ALTER COLUMN ' + col +
                        ' SET DEFAULT (' + sql_expr(c['default']) + ')')
                m = NEXTVAL.fullmatch(c['default']) if isinstance(c['default'], str) else None
                if m:
                    ref = m.group(1).replace('"', '')
                    key = tuple(ref.split('.', 1)) if '.' in ref else (schema, ref)
                    if key not in seqs and '.' not in ref:
                        key = ('public', ref)
                    if key in seqs:
                        attempt('sequence_owned_by', clabel, lambda key=key, col=col: 'ALTER SEQUENCE ' + quote(key[0]) + '.' +
                                quote(key[1]) + ' OWNED BY ' + tid + '.' + col)
        for c in t.get('constraints', []):
            clabel = label + '.' + str(c.get('name'))
            if c.get('type') == 'c':
                attempt('check', clabel, lambda c=c: 'ALTER TABLE ' + tid + ' ADD CONSTRAINT ' + quote(c['name']) + ' ' + check_ddl(c['ddl']))
            elif c.get('type') not in ('p', 'u', 'f'):
                out('SELECT pg_temp.sec_log(' + lit('constraint_other') + ', ' + lit(clabel) + ", false, 'UNSUP');")
        for n, ddl in enumerate(t.get('indexes') or []):
            try:
                iname, ddl = index_ddl(ddl, schema, name)
            except Unsupported:
                out('SELECT pg_temp.sec_log(' + lit('index') + ', ' + lit(label + '#' + str(n)) + ", false, 'UNSUP');")
                continue
            if iname not in backing:  # PK/UNIQUE indexes already exist with their constraint
                attempt('index', schema + '.' + iname, lambda ddl=ddl: ddl)

    for t in ordered:
        schema, name = t['schema'], t['table']
        tid = quote(schema) + '.' + quote(name)
        label = schema + '.' + name
        if t.get('rls') is True:
            attempt('rls', label, lambda: 'ALTER TABLE ' + tid + ' ENABLE ROW LEVEL SECURITY')
        if t.get('force_rls') is True:
            attempt('rls_force', label, lambda: 'ALTER TABLE ' + tid + ' FORCE ROW LEVEL SECURITY')
        for p in t.get('policies') or []:
            plabel = label + '.' + str(p.get('name'))
            roles = p.get('roles')
            if 'role_oids' not in p:
                # Archive captured before roles were stored by name: only OIDs of
                # the source cluster. OID 0 (PUBLIC) is the one portable value.
                if [str(r) for r in (roles or [])] != ['0']:
                    out('SELECT pg_temp.sec_log(' + lit('policy_roles_only_as_source_oid') + ', ' + lit(plabel) + ", false, 'RECAP');")
                    continue
                roles = ['public']

            def build(p=p, roles=roles):
                who = ', '.join('PUBLIC' if r == 'public' else quote(r) for r in roles)
                if not who:
                    raise Unsupported('policy without roles')
                return ('CREATE POLICY ' + quote(p['name']) + ' ON ' + tid +
                        ' AS ' + ('PERMISSIVE' if p['permissive'] is True else 'RESTRICTIVE') +
                        ' FOR ' + POLCMD[p['cmd']] + ' TO ' + who +
                        ('' if p.get('using') is None else ' USING (' + sql_expr(p['using']) + ')') +
                        ('' if p.get('with_check') is None else ' WITH CHECK (' + sql_expr(p['with_check']) + ')'))
            attempt('policy', plabel, build)
        if t.get('owner'):
            attempt('owner', label, lambda t=t: 'ALTER TABLE ' + tid + ' OWNER TO ' + quote(t['owner']))
        if t.get('relacl') is not None:
            attempt('acl', label, lambda t=t: acl_sql('TABLE', tid, t['relacl'], target_major))

    for f in snapshot.get('functions') or []:
        ident = str(f.get('schema')) + '.' + str(f.get('name')) + '(' + str(f.get('identity') or '') + ')'
        try:
            function_ddl(f)
        except Unsupported:
            continue  # already logged by the function pass
        if f.get('owner'):
            attempt('owner', ident, lambda f=f: 'ALTER ROUTINE ' + routine_ref(f) + ' OWNER TO ' + quote(f['owner']))
        if f.get('acl') is not None:
            attempt('acl', ident, lambda f=f: acl_sql('ROUTINE', routine_ref(f), f['acl'], target_major))
    for v in snapshot.get('views') or []:
        ident = str(v.get('schema')) + '.' + str(v.get('name'))
        if v.get('owner'):
            attempt('owner', ident, lambda v=v: 'ALTER TABLE ' + quote(v['schema']) + '.' + quote(v['name']) + ' OWNER TO ' + quote(v['owner']))
        if v.get('acl') is not None:
            attempt('acl', ident, lambda v=v: acl_sql('TABLE', quote(v['schema']) + '.' + quote(v['name']), v['acl'], target_major))
    for s in snapshot.get('schemas') or []:
        if s.get('name') not in SCHEMAS:
            continue
        if s.get('owner'):
            attempt('owner', 'schema ' + s['name'], lambda s=s: 'ALTER SCHEMA ' + quote(s['name']) + ' OWNER TO ' + quote(s['owner']))
        if s.get('acl') is not None:
            attempt('acl', 'schema ' + s['name'], lambda s=s: acl_sql('SCHEMA', quote(s['name']), s['acl'], target_major))
    for m in snapshot.get('role_memberships') or []:
        role, member = m.get('role'), m.get('member')
        if all(isinstance(x, str) and IDENT.fullmatch(x) and not x.startswith('pg_') for x in (role, member)):
            out('SELECT pg_temp.sec_member(' + lit(role) + ', ' + lit(member) + ');')

    # Triggers last: nothing they could fire on is written after this point.
    for t in ordered:
        schema, name = t['schema'], t['table']
        tid = quote(schema) + '.' + quote(name)
        for n, trg in enumerate(t.get('triggers') or []):
            try:
                tname, ddl = trigger_ddl(trg.get('ddl'), schema, name)
                state = {'O': '', 'D': 'DISABLE', 'R': 'ENABLE REPLICA', 'A': 'ENABLE ALWAYS'}[trg.get('enabled')]
            except (Unsupported, KeyError):
                out('SELECT pg_temp.sec_log(' + lit('trigger') + ', ' + lit(schema + '.' + name + '#' + str(n)) + ", false, 'UNSUP');")
                continue
            attempt('trigger', schema + '.' + name + '.' + tname, lambda ddl=ddl, state=state, tname=tname:
                    ddl + ('; ALTER TABLE ' + tid + ' ' + state + ' TRIGGER ' + quote(tname) if state else ''))

    out(PROBE_SQL)


def compare_catalog(snapshot, restored, target_major):
    """R3 receipt: archive metadata vs restored catalog, per class. Names only."""
    report = {}
    not_captured = set()

    def diff(cls, want, got, extra=True):
        r = report.setdefault(cls, {'archived': 0, 'identical': 0, 'different': [], 'missing': [], 'extra': []})
        r['archived'] += len(want)
        for k, v in want.items():
            if k not in got:
                r['missing'].append(k)
            elif got[k] == v:
                r['identical'] += 1
            else:
                r['different'].append(k)
        if extra:
            r['extra'] += [k for k in got if k not in want]

    def acl(v):
        try:
            return norm_acl(v, target_major)
        except Unsupported:
            return 'unparseable'

    def named(ddl, pattern):
        m = pattern.match(ddl) if isinstance(ddl, str) else None
        return _bare(m.group(1)) if m else str(ddl)[:80]

    name_of_index = re.compile(r'^CREATE (?:UNIQUE )?INDEX (' + _ID + r') ')
    name_of_trigger = re.compile(r'^CREATE (?:CONSTRAINT )?TRIGGER (' + _ID + r') ')

    def table_maps(doc, reference=None):
        m = defaultdict(dict)
        for t in doc.get('tables') or []:
            label = t['schema'] + '.' + t['table']
            ref = (reference or {}).get(label, t)
            m['table'][label] = True
            m['table_owner'][label] = t.get('owner')
            m['table_rls'][label] = (t.get('rls'), t.get('force_rls') if 'force_rls' in ref else None)
            m['table_acl'][label] = acl(t.get('relacl'))
            for pos, c in enumerate(t.get('columns') or []):
                m['column'][label + '.' + c['name']] = (pos, c.get('type'), c.get('notnull'), c.get('identity'),
                                                        c.get('generated'), c.get('default'))
            for c in t.get('constraints') or []:
                m['constraint'][label + '.' + c['name']] = (c.get('type'), c.get('ddl'))
            for ddl in t.get('indexes') or []:
                m['index'][t['schema'] + '.' + named(ddl, name_of_index)] = ddl
            for trg in t.get('triggers') or []:
                m['trigger'][label + '.' + named(trg.get('ddl'), name_of_trigger)] = (trg.get('ddl'), trg.get('enabled'))
            by_name = {p.get('name'): p for p in ref.get('policies') or []}
            for p in t.get('policies') or []:
                src = by_name.get(p.get('name'))
                roles_known = ('role_oids' in p) if reference is None else (src is None or 'role_oids' in src)
                if reference is None and 'role_oids' not in p:
                    not_captured.add('policy roles by name (archive predates the capture fix)')
                m['policy'][label + '.' + str(p.get('name'))] = (
                    p.get('cmd'), p.get('permissive'), sorted(map(str, p.get('roles') or [])) if roles_known else None,
                    p.get('using'), p.get('with_check'))
        return m

    want = table_maps(snapshot)
    got = table_maps(restored, {t['schema'] + '.' + t['table']: t for t in snapshot.get('tables') or []})
    for cls in ('table', 'column', 'constraint', 'index', 'trigger', 'table_rls', 'policy', 'table_owner', 'table_acl'):
        diff(cls, want[cls], got[cls])

    def keyed(doc, section, key, value):
        return {key(x): value(x) for x in doc.get(section) or []}

    fkey = lambda f: str(f.get('schema')) + '.' + str(f.get('name')) + '(' + str(f.get('identity') or '') + ')'
    diff('function', keyed(snapshot, 'functions', fkey, lambda f: f.get('ddl')), keyed(restored, 'functions', fkey, lambda f: f.get('ddl')))
    diff('function_acl', keyed(snapshot, 'functions', fkey, lambda f: acl(f.get('acl'))), keyed(restored, 'functions', fkey, lambda f: acl(f.get('acl'))))
    if all('owner' in f for f in snapshot.get('functions') or []):
        diff('function_owner', keyed(snapshot, 'functions', fkey, lambda f: f.get('owner')), keyed(restored, 'functions', fkey, lambda f: f.get('owner')))
    elif snapshot.get('functions'):
        not_captured.add('function owner')
    vkey = lambda v: str(v.get('schema')) + '.' + str(v.get('name'))
    diff('view', keyed(snapshot, 'views', vkey, lambda v: (v.get('kind'), v.get('definition'))),
         keyed(restored, 'views', vkey, lambda v: (v.get('kind'), v.get('definition'))))
    if all('owner' in v for v in snapshot.get('views') or []):
        attrs = lambda v: (v.get('owner'), acl(v.get('acl')), sorted(v.get('reloptions') or []))
        diff('view_owner_acl_options', keyed(snapshot, 'views', vkey, attrs), keyed(restored, 'views', vkey, attrs))
    elif snapshot.get('views'):
        not_captured.add('view owner, ACL and options')
    skey = lambda q: str(q.get('schemaname')) + '.' + str(q.get('sequencename'))
    sval = lambda q: tuple(q.get(k) for k in ('data_type', 'start_value', 'min_value', 'max_value', 'increment_by', 'cycle', 'cache_size', 'last_value'))
    diff('sequence', keyed(snapshot, 'sequences', skey, sval), keyed(restored, 'sequences', skey, sval))

    def enum_map(doc):
        m = defaultdict(list)
        for e in doc.get('enums') or []:
            m[e['schema'] + '.' + e['type']].append(e['value'])
        return dict(m)
    diff('enum', enum_map(snapshot), enum_map(restored))
    diff('schema', keyed(snapshot, 'schemas', lambda s: s.get('name'), lambda s: (s.get('owner'), acl(s.get('acl')))),
         keyed(restored, 'schemas', lambda s: s.get('name'), lambda s: (s.get('owner'), acl(s.get('acl')))))
    diff('extension', keyed(snapshot, 'extensions', lambda e: e.get('name'), lambda e: e.get('schema')),
         keyed(restored, 'extensions', lambda e: e.get('name'), lambda e: e.get('schema')), extra=False)
    diff('role', keyed(snapshot, 'roles', lambda r: r.get('name'), lambda r: True),
         keyed(restored, 'roles', lambda r: r.get('name'), lambda r: True), extra=False)
    if snapshot.get('tables') and not all('force_rls' in t for t in snapshot['tables']):
        not_captured.add('FORCE ROW LEVEL SECURITY flag')
    if snapshot.get('roles') and not all('bypassrls' in r for r in snapshot['roles']):
        not_captured.add('role BYPASSRLS attribute')
    not_captured |= {'sequence owner and ACL', 'column-level ACL', 'default privileges', 'comments',
                     'role passwords and settings (by design)'}
    equivalent = all(not (r['different'] or r['missing'] or r['extra']) for r in report.values())
    for r in report.values():
        for k in ('different', 'missing', 'extra'):
            r[k + '_count'] = len(r[k])
            r[k] = sorted(map(str, r[k]))[:40]
    return {'equivalent': equivalent, 'classes': report, 'not_captured_by_archive': sorted(not_captured)}


def build_sql(snapshot, schema_objects=False, plain_generated=frozenset(), target_major=17,
              search_path=('public', 'extensions')):
    tables = snapshot.get('tables')
    if not isinstance(tables, list) or len(tables) < 100 or snapshot.get('table_count') != len(tables):
        raise ValueError('table manifest incomplete')
    observed = {(t['schema'], t['table']) for t in tables}
    if len(observed) != len(tables) or {s for s, _ in observed} != SCHEMAS:
        raise ValueError('duplicate table or missing required schema')
    enums = defaultdict(list)
    for e in snapshot.get('enums', []):
        k = (e['schema'], e['type'])
        if e['schema'] not in SCHEMAS:
            raise ValueError('enum outside expected schema')
        enums[k].append((float(e['order']), e['value']))
    sql = io.StringIO()
    def out(s): sql.write(s+'\n')
    out('BEGIN;')
    out("SET LOCAL client_min_messages TO warning;")
    out("SET LOCAL statement_timeout TO '10min';")
    out("SET LOCAL bytea_output TO 'hex';")
    out("CREATE FUNCTION pg_temp.sec_assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS "
        "$SEC$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION '%', msg; END IF; END $SEC$;")
    out('CREATE TEMP TABLE sec_seq_behind(name text) ON COMMIT DROP;')
    for s in sorted(SCHEMAS):
        out('CREATE SCHEMA IF NOT EXISTS '+quote(s)+';')
    inline_generated = set()
    if schema_objects:
        emit_prelude(out, snapshot, search_path)
    for (sch,typ), values in sorted(enums.items()):
        literals = ', '.join("'" + v.replace("'", "''") + "'" for _, v in sorted(values))
        out('CREATE TYPE '+quote(sch)+'.'+quote(typ)+' AS ENUM ('+literals+');')
    row_counts = {}
    for t in sorted(tables, key=lambda z:(z['schema'],z['table'])):
        schema, name = t['schema'], t['table']
        if schema not in SCHEMAS: raise ValueError('unexpected schema')
        ident = quote(schema)+'.'+quote(name)
        columns = t.get('columns')
        if not isinstance(columns, list) or not columns: raise ValueError('columns missing')
        colnames = [c['name'] for c in columns]
        if len(set(colnames)) != len(colnames): raise ValueError('duplicate column')
        typed = [quote(c['name'])+' '+require_type(c['type'], enums) for c in columns]
        # Staging tables deliberately omit generated/default/identity behavior,
        # to preserve the values present in the encrypted row snapshot.
        gen = [c['name'] for c in columns if schema_objects and c.get('generated') == 's'
               and '*' not in plain_generated and schema+'.'+name not in plain_generated]
        if gen:
            try:
                typed = [d+(' GENERATED ALWAYS AS ('+sql_expr(c.get('default'))+') STORED' if c['name'] in gen else '')
                         for d, c in zip(typed, columns)]
            except Unsupported:
                gen = []
                typed = [quote(c['name'])+' '+require_type(c['type'], enums) for c in columns]
        if gen:
            # Real generated columns: only base columns are inserted and the
            # recomputed values must equal the archived ones.
            inline_generated |= {(schema, name, g) for g in gen}
            out("SELECT pg_temp.sec_must('generated:"+schema+'.'+name+"', "+dollar('CREATE TABLE '+ident+' ('+', '.join(typed)+')', 'g')+');')
        else:
            out('CREATE TABLE '+ident+' ('+', '.join(typed)+');')
        pred = roundtrip_predicate(columns)
        exact_json = any(c['type'] == 'json' for c in columns)
        stored = None
        if gen:
            cmp_cols = ', '.join(quote(c['name'])+('::text' if c['type'] == 'json' else '') for c in columns)
            stored = (cmp_cols, 'generated:'+schema+'.'+name)
        colnames_all = colnames
        colnames = [n for n in colnames if n not in gen]
        cnt = 0
        batch = []
        for obj, raw_json in parse_rows(t):
            if set(obj) != set(colnames_all):
                raise ValueError('missing/extra column in source row')
            batch.append(raw_json)
            cnt += 1
            if len(batch) >= 200:
                _insert_batch(out, ident, colnames, batch, cnt, pred, stored, exact_json)
                batch = []
        if batch: _insert_batch(out, ident, colnames, batch, cnt, pred, stored, exact_json)
        row_counts[ident] = cnt
        out("DO $QA$ BEGIN IF (SELECT count(*) FROM "+ident+") <> "+str(cnt)+" THEN "+
            "RAISE EXCEPTION 'isolated row count mismatch'; END IF; END $QA$;")
    # Validate relational integrity on captured data after loading all tables.
    # Every FK identifier and target must exist in the captured metadata.
    archived_cols={(t['schema'],t['table']):{c['name'] for c in t['columns']} for t in tables}
    fk_count=0
    nn_count=0
    for t in sorted(tables, key=lambda z:(z['schema'],z['table'])):
        ident=quote(t['schema'])+'.'+quote(t['table'])
        colnames=archived_cols[t['schema'],t['table']]
        for c in t.get('constraints', []):
            if c['type'] in ('p','u'):
                ddl=constraint_ddl(c.get('ddl',''), colnames)
                out('ALTER TABLE '+ident+' ADD CONSTRAINT '+quote(c['name'])+' '+ddl+';')
    for t in sorted(tables, key=lambda z:(z['schema'],z['table'])):
        ident=quote(t['schema'])+'.'+quote(t['table'])
        colnames=archived_cols[t['schema'],t['table']]
        for c in t['columns']:
            if c.get('notnull') is True:
                out('ALTER TABLE '+ident+' ALTER COLUMN '+quote(c['name'])+' SET NOT NULL;')
                nn_count += 1
        for c in t.get('constraints', []):
            if c['type']=='f':
                ddl=fk_ddl(c.get('ddl',''),t['schema'],colnames,archived_cols)
                out('ALTER TABLE '+ident+' ADD CONSTRAINT '+quote(c['name'])+' '+ddl+';')
                fk_count += 1
    # Standalone sequences at their archived position. Staging tables carry no
    # defaults/identity, so sequences are restored as independent objects and the
    # archived position is checked against the restored data of the column that
    # consumed it (serial default, or identity by PostgreSQL's naming rule).
    seqs={}
    for q in snapshot.get('sequences', []):
        sch, name = q.get('schemaname'), q.get('sequencename')
        if sch not in SCHEMAS or q.get('data_type') not in SEQ_TYPES or (sch, name) in seqs:
            raise ValueError('invalid sequence metadata')
        last = q.get('last_value')
        seqs[(sch, name)] = {'pos': (None if last is None else as_int(last), as_int(q['start_value']), as_int(q['increment_by'])), 'meta': q}
        sid = quote(sch)+'.'+quote(name)
        out('CREATE SEQUENCE '+sid+' AS '+q['data_type']+' INCREMENT BY '+str(as_int(q['increment_by']))+
            ' MINVALUE '+str(as_int(q['min_value']))+' MAXVALUE '+str(as_int(q['max_value']))+
            ' START WITH '+str(as_int(q['start_value']))+' CACHE '+str(as_int(q['cache_size']))+
            (' CYCLE' if q.get('cycle') is True else ' NO CYCLE')+';')
        if last is not None:
            out("SELECT pg_temp.sec_assert(setval('"+sid+"'::regclass, "+str(as_int(last))+", true) = "+str(as_int(last))+", 'sequence position restore failed');")
    if schema_objects:
        emit_schema_objects(out, snapshot, tables, seqs, inline_generated, target_major)
    for t in sorted(tables, key=lambda z:(z['schema'],z['table'])):
        ident=quote(t['schema'])+'.'+quote(t['table'])
        for c in t['columns']:
            if c['type'] not in SEQ_TYPES: continue
            m = NEXTVAL.fullmatch(c.get('default') or '')
            if m:
                ref = m.group(1).replace('"','')
                key = tuple(ref.split('.',1)) if '.' in ref else (t['schema'], ref)
                if key not in seqs and '.' not in ref: key = ('public', ref)
            elif c.get('identity') in ('a','d'):
                key = (t['schema'], t['table']+'_'+c['name']+'_seq')
            else: continue
            if key not in seqs: continue
            last, start, inc = seqs[key]['pos']
            if inc <= 0: continue
            # Next nextval() must not land on an existing key after recovery.
            limit = str(last) if last is not None else str(start - 1)
            label = t['schema']+'.'+t['table']+'.'+c['name']
            out("INSERT INTO sec_seq_behind SELECT '"+label+"' WHERE (SELECT max("+quote(c['name'])+") FROM "+ident+") > "+limit+";")
    out("SELECT '"+SUMMARY_TAG+"' || json_build_object('sequences_restored', "+str(len(seqs))+
        ", 'foreign_keys_restored', "+str(fk_count)+
        ", 'notnull_columns_restored', "+str(nn_count)+
        ", 'sequence_behind_data', (SELECT coalesce(json_agg(name ORDER BY name), '[]'::json) FROM sec_seq_behind)"+
        (", 'objects', (SELECT coalesce(json_object_agg(kind, j), '{}'::json) FROM (SELECT kind, json_build_object("
         "'ok', count(*) FILTER (WHERE ok), 'failed', coalesce(json_agg(ident || ' [' || sqlstate || ']' ORDER BY ident) "
         "FILTER (WHERE NOT ok), '[]'::json)) AS j FROM sec_obj_log GROUP BY kind) AS x)" if schema_objects else '')+
        ")::text;")
    out('COMMIT;')
    return sql.getvalue(), row_counts, len(enums)


def _insert_batch(out, ident, columns, batch, count, pred, stored=None, exact_json=False):
    data='['+','.join(batch)+']'  # Preserve exact PostgreSQL numeric lexical representation
    value=dollar(data,count)
    col=', '.join(map(quote, columns))
    # A json (not jsonb) column keeps its exact archived text only when the
    # batch is never normalized through jsonb on its way into the table.
    populate = 'json_populate_recordset(NULL::'+ident+', '+value+'::json)' if exact_json else 'jsonb_populate_recordset(NULL::'+ident+', '+value+'::jsonb)'
    out('INSERT INTO '+ident+' ('+col+') SELECT '+col+' FROM '+populate+' AS src;')
    # Same deterministic typed conversion as the INSERT above, re-serialized and
    # compared with the archived row: a lossy conversion fails the restore.
    out('SELECT pg_temp.sec_assert(NOT EXISTS (SELECT 1 FROM jsonb_array_elements('+value+'::jsonb) AS s(e) '
        'CROSS JOIN LATERAL jsonb_populate_record(NULL::'+ident+', s.e) AS r WHERE NOT ('+pred+")), 'restored value differs from archived row');")
    if stored:
        # Table has real generated columns: the STORED row (recomputed by
        # PostgreSQL) must equal the archived row, including those columns.
        out('SELECT pg_temp.sec_assert(NOT EXISTS (SELECT '+stored[0]+' FROM jsonb_populate_recordset(NULL::'+ident+', '+value+
            '::jsonb) EXCEPT SELECT '+stored[0]+' FROM '+ident+"), '"+ERROR_TAG+stored[1]+"');")


def _target_major(database):
    p=subprocess.run(['psql','-X','-q','-At','--dbname='+database,'-c','SHOW server_version_num'],
                     stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    text=p.stdout.decode('ascii','replace').strip()
    if p.returncode or not text.isdigit(): raise ValueError('isolated PostgreSQL not reachable')
    return int(text)//10000


def main(argv=None):
    ap=argparse.ArgumentParser(description='Restore verified encrypted logical DB into STRICTLY isolated local PostgreSQL')
    ap.add_argument('--archive',required=True,type=Path)
    ap.add_argument('--key-json',required=True,type=Path)
    ap.add_argument('--sha256',default='')
    ap.add_argument('--database',default='')
    ap.add_argument('--apply-isolated',action='store_true')
    ap.add_argument('--with-schema-objects',action='store_true',
                    help='also rebuild functions, views, defaults, identity, CHECK, indexes, RLS, triggers, owners, ACLs and compare the catalog')
    ap.add_argument('--capture-search-path',default='public,extensions',
                    help='search_path of the session that ran the capture (decides how archived expressions were qualified)')
    args=ap.parse_args(argv)
    try:
        schema_mode=args.with_schema_objects
        search_path=tuple(x.strip() for x in args.capture_search_path.split(','))
        if not all(IDENT.fullmatch(x) for x in search_path): raise ValueError('invalid capture search_path')
        if schema_mode and not re.fullmatch('[0-9a-fA-F]{64}',args.sha256):
            # This mode executes DDL stored in the archive; bind it to the custody receipt.
            raise ValueError('--with-schema-objects requires the custody --sha256 of the archive')
        snap,digest=decode(args.archive,args.key_json,args.sha256)
        major=17
        if args.apply_isolated:
            if not re.fullmatch('sec_restore_[a-z0-9_]{1,32}',args.database):
                raise ValueError('restoration allowed only in explicitly named isolated sec_restore_* database')
            # A named database alone is insufficient: libpq can target a REMOTE
            # server via PGHOST/PGHOSTADDR/PGSERVICE. Refuse any nonlocal route.
            local = ('', 'localhost', '127.0.0.1', '::1')
            if (os.environ.get('PGHOST', '') not in local or
                os.environ.get('PGHOSTADDR', '') not in local or
                os.environ.get('PGSERVICE', '') or
                os.environ.get('PGSERVICEFILE', '')):
                raise ValueError('non-local PostgreSQL target refused')
            if schema_mode: major=_target_major(args.database)
        plain=set()
        summary={}; restored=None
        while True:
            sql,rows,enum_count=build_sql(snap,schema_mode,frozenset(plain),major,search_path)
            if not args.apply_isolated: break
            cmd=['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','--dbname='+args.database]
            p=subprocess.run(cmd,input=sql.encode('utf8'),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            if p.returncode:
                # stderr may quote row data: only our own tag (table names) is ever read from it.
                tagged=set(re.findall(re.escape(ERROR_TAG)+r'generated:([A-Za-z_0-9]+\.[A-Za-z_0-9]+)',p.stderr.decode('utf8','replace')))
                if schema_mode and tagged-plain: plain|=tagged; continue
                if schema_mode and '*' not in plain: plain.add('*'); continue
                raise ValueError('isolated PostgreSQL restore failed; SQL output suppressed')
            # Only tagged lines are read: identifiers, counts and catalog metadata, never row data.
            lines=p.stdout.decode('utf8','replace').splitlines()
            tagged=[l for l in lines if l.startswith(SUMMARY_TAG)]
            if len(tagged)!=1: raise ValueError('isolated PostgreSQL restore summary missing')
            summary=json.loads(tagged[0][len(SUMMARY_TAG):])
            if schema_mode:
                catalog=[l for l in lines if l.startswith(CATALOG_TAG)]
                if len(catalog)!=1: raise ValueError('isolated PostgreSQL catalog receipt missing')
                restored=json.loads(catalog[0][len(CATALOG_TAG):])
            break
        total=sum(rows.values())
        result={'status':'PASS','tables':len(rows),'row_count':total,
                'enums':enum_count,'pg_restore_applied':args.apply_isolated,
                'stage_constraints':'PRIMARY KEY/UNIQUE/FOREIGN KEY/NOT NULL (policies, functions, grants NOT restored)',
                'row_content_verified':args.apply_isolated,
                'sequences_restored':summary.get('sequences_restored'),
                'foreign_keys_restored':summary.get('foreign_keys_restored'),
                'notnull_columns_restored':summary.get('notnull_columns_restored'),
                'sequence_behind_data':summary.get('sequence_behind_data'),
                'full_operational_restore':False,
                'sha256_ciphertext':digest}
        if schema_mode:
            result['stage_constraints']='PRIMARY KEY/UNIQUE/FOREIGN KEY/NOT NULL + schema objects (see schema_objects, catalog_receipt)'
            result['schema_objects_requested']=True
            if restored is not None:
                objects=summary.get('objects') or {}
                for v in objects.values():
                    v['failed_count']=len(v['failed']); v['failed']=v['failed'][:40]
                receipt=compare_catalog(snap,restored,major)
                result.update({'target_server_major':major,'schema_objects':objects,
                               'generated_columns_kept_as_values':sorted(plain),
                               'catalog_receipt':receipt,
                               'database_schema_equivalent':receipt['equivalent']})
        print(json.dumps(result,ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({'status':'FAIL','reason':str(exc)}),file=sys.stderr)
        return 1


if __name__=='__main__': sys.exit(main())