#!/usr/bin/env python3
"""Restore a PRIVATE encrypted logical backup to an ISOLATED local PostgreSQL.

Reconstructs typed tables + enums, actual row values, PK/UNIQUE/FK and NOT NULL
constraints and standalone sequences with their archived position. Every inserted batch is
re-serialized from its typed value and compared with the archived row, so a
row count match alone can never report PASS for silently altered values.
Does NOT reconstruct full production RLS, triggers, Auth services, extensions,
role grants, CHECK constraints or Storage file blobs. Therefore it is NOT
full disaster recovery acceptance. Never writes plaintext backup to a file.
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


def build_sql(snapshot):
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
        out('CREATE TABLE '+ident+' ('+', '.join(typed)+');')
        pred = roundtrip_predicate(columns)
        cnt = 0
        batch = []
        for obj, raw_json in parse_rows(t):
            if set(obj) != set(colnames):
                raise ValueError('missing/extra column in source row')
            batch.append(raw_json)
            cnt += 1
            if len(batch) >= 200:
                _insert_batch(out, ident, colnames, batch, cnt, pred)
                batch = []
        if batch: _insert_batch(out, ident, colnames, batch, cnt, pred)
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
        seqs[(sch, name)] = (None if last is None else as_int(last), as_int(q['start_value']), as_int(q['increment_by']))
        sid = quote(sch)+'.'+quote(name)
        out('CREATE SEQUENCE '+sid+' AS '+q['data_type']+' INCREMENT BY '+str(as_int(q['increment_by']))+
            ' MINVALUE '+str(as_int(q['min_value']))+' MAXVALUE '+str(as_int(q['max_value']))+
            ' START WITH '+str(as_int(q['start_value']))+' CACHE '+str(as_int(q['cache_size']))+
            (' CYCLE' if q.get('cycle') is True else ' NO CYCLE')+';')
        if last is not None:
            out("SELECT pg_temp.sec_assert(setval('"+sid+"'::regclass, "+str(as_int(last))+", true) = "+str(as_int(last))+", 'sequence position restore failed');")
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
            last, start, inc = seqs[key]
            if inc <= 0: continue
            # Next nextval() must not land on an existing key after recovery.
            limit = str(last) if last is not None else str(start - 1)
            label = t['schema']+'.'+t['table']+'.'+c['name']
            out("INSERT INTO sec_seq_behind SELECT '"+label+"' WHERE (SELECT max("+quote(c['name'])+") FROM "+ident+") > "+limit+";")
    out("SELECT '"+SUMMARY_TAG+"' || json_build_object('sequences_restored', "+str(len(seqs))+
        ", 'foreign_keys_restored', "+str(fk_count)+
        ", 'notnull_columns_restored', "+str(nn_count)+
        ", 'sequence_behind_data', (SELECT coalesce(json_agg(name ORDER BY name), '[]'::json) FROM sec_seq_behind))::text;")
    out('COMMIT;')
    return sql.getvalue(), row_counts, len(enums)


def _insert_batch(out, ident, columns, batch, count, pred):
    data='['+','.join(batch)+']'  # Preserve exact PostgreSQL numeric lexical representation
    value=dollar(data,count)
    col=', '.join(map(quote, columns))
    out('INSERT INTO '+ident+' ('+col+') SELECT '+col+' FROM jsonb_populate_recordset(NULL::'+ident+', '+value+'::jsonb) AS src;')
    # Same deterministic typed conversion as the INSERT above, re-serialized and
    # compared with the archived row: a lossy conversion fails the restore.
    out('SELECT pg_temp.sec_assert(NOT EXISTS (SELECT 1 FROM jsonb_array_elements('+value+'::jsonb) AS s(e) '
        'CROSS JOIN LATERAL jsonb_populate_record(NULL::'+ident+', s.e) AS r WHERE NOT ('+pred+")), 'restored value differs from archived row');")


def main(argv=None):
    ap=argparse.ArgumentParser(description='Restore verified encrypted logical DB into STRICTLY isolated local PostgreSQL')
    ap.add_argument('--archive',required=True,type=Path)
    ap.add_argument('--key-json',required=True,type=Path)
    ap.add_argument('--sha256',default='')
    ap.add_argument('--database',default='')
    ap.add_argument('--apply-isolated',action='store_true')
    args=ap.parse_args(argv)
    try:
        snap,digest=decode(args.archive,args.key_json,args.sha256)
        sql,rows,enum_count=build_sql(snap)
        total=sum(rows.values())
        summary={}
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
            cmd=['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','--dbname='+args.database]
            p=subprocess.run(cmd,input=sql.encode('utf8'),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            if p.returncode: raise ValueError('isolated PostgreSQL restore failed; SQL output suppressed')
            # Only the tagged line is read: identifiers and counts, never row data.
            tagged=[l for l in p.stdout.decode('utf8','replace').splitlines() if l.startswith(SUMMARY_TAG)]
            if len(tagged)!=1: raise ValueError('isolated PostgreSQL restore summary missing')
            summary=json.loads(tagged[0][len(SUMMARY_TAG):])
        print(json.dumps({'status':'PASS','tables':len(rows),'row_count':total,
                          'enums':enum_count,'pg_restore_applied':args.apply_isolated,
                          'stage_constraints':'PRIMARY KEY/UNIQUE/FOREIGN KEY/NOT NULL (policies, functions, grants NOT restored)',
                          'row_content_verified':args.apply_isolated,
                          'sequences_restored':summary.get('sequences_restored'),
                          'foreign_keys_restored':summary.get('foreign_keys_restored'),
                          'notnull_columns_restored':summary.get('notnull_columns_restored'),
                          'sequence_behind_data':summary.get('sequence_behind_data'),
                          'full_operational_restore':False,
                          'sha256_ciphertext':digest},ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({'status':'FAIL','reason':str(exc)}),file=sys.stderr)
        return 1

if __name__=='__main__': sys.exit(main())