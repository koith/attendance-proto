#!/usr/bin/env python3
"""Restore a PRIVATE encrypted logical backup to an ISOLATED local PostgreSQL.

Reconstructs typed tables + enums, actual row values, PK/UNIQUE constraints.
Does NOT reconstruct full production RLS, triggers, Auth services, extensions,
role grants, sequences, FK checks or Storage file blobs. Therefore it is NOT
full disaster recovery acceptance. Never writes plaintext backup to a file.
"""
import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
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
        obj = json.loads(el.text)
        if not isinstance(obj, dict):
            raise ValueError('source row not JSON object')
        yield obj


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
        cnt = 0
        batch = []
        for obj in parse_rows(t):
            if set(obj) != set(colnames):
                raise ValueError('missing/extra column in source row')
            batch.append(obj)
            cnt += 1
            if len(batch) >= 200:
                _insert_batch(out, ident, colnames, batch, cnt)
                batch = []
        if batch: _insert_batch(out, ident, colnames, batch, cnt)
        row_counts[ident] = cnt
        out("DO $QA$ BEGIN IF (SELECT count(*) FROM "+ident+") <> "+str(cnt)+" THEN "+
            "RAISE EXCEPTION 'isolated row count mismatch'; END IF; END $QA$;")
    # Staging PK/UNIQUE constraints can validate duplicate-free restore.
    # Foreign keys and CHECK constraints intentionally excluded; requires full
    # platform schema bootstrap for operational restoration.
    for t in sorted(tables, key=lambda z:(z['schema'],z['table'])):
        ident=quote(t['schema'])+'.'+quote(t['table'])
        for c in t.get('constraints', []):
            if c['type'] in ('p','u'):
                ddl=c.get('ddl','')
                if not re.match(r'^(?:PRIMARY KEY|UNIQUE)\s*\(',ddl):
                    # PG may include NULLS NOT DISTINCT or other novel syntax.
                    raise ValueError('unrecognized PK/UNIQUE constraint; fail closed')
                out('ALTER TABLE '+ident+' ADD CONSTRAINT '+quote(c['name'])+' '+ddl+';')
    out('COMMIT;')
    return sql.getvalue(), row_counts, len(enums)


def _insert_batch(out, ident, columns, batch, count):
    data=json.dumps(batch,ensure_ascii=False,separators=(',',':'))
    value=dollar(data,count)
    col=', '.join(map(quote, columns))
    out('INSERT INTO '+ident+' ('+col+') SELECT '+col+' FROM jsonb_populate_recordset(NULL::'+ident+', '+value+'::jsonb) AS src;')


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
        if args.apply_isolated:
            if not re.fullmatch('sec_restore_[a-z0-9_]{1,32}',args.database):
                raise ValueError('restoration allowed only in explicitly named isolated sec_restore_* database')
            cmd=['psql','-X','-q','-v','ON_ERROR_STOP=1','--dbname='+args.database]
            p=subprocess.run(cmd,input=sql.encode('utf8'),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if p.returncode: raise ValueError('isolated PostgreSQL restore failed; SQL output suppressed')
        print(json.dumps({'status':'PASS','tables':len(rows),'row_count':total,
                          'enums':enum_count,'pg_restore_applied':args.apply_isolated,
                          'stage_constraints':'PRIMARY KEY/UNIQUE only',
                          'full_operational_restore':False,
                          'sha256_ciphertext':digest},ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({'status':'FAIL','reason':str(exc)}),file=sys.stderr)
        return 1

if __name__=='__main__': sys.exit(main())