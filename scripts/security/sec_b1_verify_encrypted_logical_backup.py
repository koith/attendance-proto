#!/usr/bin/env python3
"""Read-only offline verification for an AES-256 PGP-encrypted 101-table logical
snapshot. Never prints employee records, auth material, secret or decrypted rows.
Requires GPG; plaintext is held in volatile process memory only.
"""
import argparse
import collections
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REQUIRED = {
    'public.employees','public.attendance_events','public.event_corrections',
    'public.stores','public.admin_users','public.employee_documents',
    'public.payroll_period','public.payroll_period_employee','public.payroll_snapshot',
    'auth.users','auth.sessions','auth.refresh_tokens','storage.objects',
    'private.attendance_mutation_audit_v1',
}
REQUIRED_SCHEMAS = {'public','auth','storage','private','session_guard'}


def check(archive: Path, keyfile: Path, expected_sha256: str = ''):
    if not archive.is_file() or not keyfile.is_file():
        raise ValueError('backup or recovery key inaccessible')
    h = hashlib.sha256()
    with archive.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    digest = h.hexdigest()
    if expected_sha256 and digest != expected_sha256:
        raise ValueError('encrypted archive SHA-256 mismatch')
    k = json.loads(keyfile.read_text())
    secret = k.get('passphrase_hex', '')
    if k.get('format') != 'baekeok-pgcrypto-logical-recovery-key-v1' or not re.fullmatch(r'[0-9a-f]{64}', secret):
        raise ValueError('invalid private recovery-key format')
    # GPG stdin is exclusively the passphrase; ciphertext is an input file.
    # The decrypted text is never written to disk, stderr, logs or stdout.
    p = subprocess.run([
        'gpg','--batch','--no-tty','--pinentry-mode','loopback',
        '--passphrase-fd','0','--decrypt',str(archive)
    ], input=(secret+'\n').encode('ascii'), stdout=subprocess.PIPE,
       stderr=subprocess.DEVNULL, check=False)
    if p.returncode:
        raise ValueError('archive decryption failed (key mismatch or tampering)')
    try:
        snap = json.loads(p.stdout)
    except (UnicodeError,json.JSONDecodeError):
        raise ValueError('decrypted payload is not valid JSON') from None
    if snap.get('format') != 'baekeok-readonly-encrypted-logical-db-snapshot-v1':
        raise ValueError('backup format mismatch')
    tables = snap.get('tables',[])
    if snap.get('table_count') != len(tables) or len(tables)<100:
        raise ValueError('table manifest coverage mismatch')
    coverage={}; rows=0; examined=0
    # Physically rehydrate every decrypted row into an isolated, memory-only
    # database. This verifies replayable row content, NOT PostgreSQL DDL restore.
    isolated=sqlite3.connect(':memory:')
    isolated.execute('CREATE TABLE restored (schema_name TEXT NOT NULL, table_name TEXT NOT NULL, row_json TEXT NOT NULL)')
    for item in tables:
        key=item['schema']+'.'+item['table']
        if key in coverage:raise ValueError('duplicate table in manifest')
        if not isinstance(item.get('columns'), list) or not item['columns']:
            raise ValueError('missing table column/DDL metadata')
        serialized=item.get('row_xml','')
        n=0
        if serialized:
            tree=ET.fromstring('<snapshot_root>'+serialized+'</snapshot_root>')
            for el in tree.findall('.//row'):
                payload=el.find('row_json')
                if payload is None or not payload.text or not isinstance(json.loads(payload.text),dict):
                    raise ValueError('missing/invalid actual row JSON in backup')
                isolated.execute('INSERT INTO restored VALUES (?,?,?)', (item['schema'],item['table'],payload.text))
                n+=1;examined+=1
        replayed=isolated.execute('SELECT count(*) FROM restored WHERE schema_name=? AND table_name=?', (item['schema'],item['table'])).fetchone()[0]
        if replayed!=n: raise ValueError('isolated data rehydration count mismatch')
        coverage[key]=n;rows+=n
    if not REQUIRED.issubset(coverage.keys()):
        raise ValueError('required employee/payroll/Auth/Storage table missing')
    schema_names=set(item['schema'] for item in tables)
    if schema_names!=REQUIRED_SCHEMAS:
        raise ValueError('schema coverage mismatch')
    if rows!=examined:
        raise ValueError('actual row count mismatch')
    isolated_total=isolated.execute('SELECT count(*) FROM restored').fetchone()[0]
    if isolated_total!=rows:
        raise ValueError('isolated rehydration total mismatch')
    isolated.close()
    if len(snap.get('functions',[]))<250 or len(snap.get('sequences',[]))<30:
        raise ValueError('functions/sequences restore metadata missing')
    return {
        'status':'PASS','archive_sha256':digest,
        'ciphertext_bytes':archive.stat().st_size,
        'source_capture_time':snap.get('captured_at'),
        'tables_verified':len(coverage),'rows_redecoded_and_json_parsed':rows,
        'isolated_in_memory_rehydrated_rows':isolated_total,
        'tables_by_schema':dict(sorted(collections.Counter(item['schema'] for item in tables).items())),
        'functions':len(snap['functions']),'sequences':len(snap['sequences']),
        'extensions':len(snap.get('extensions',[])),
        'key_location_independent_of_drive':True,
        'database_sql_restore_performed':False,
    }


def main():
    a=argparse.ArgumentParser(description='Private offline encrypted snapshot verifier')
    a.add_argument('--archive',type=Path,required=True)
    a.add_argument('--key-json',type=Path,required=True)
    a.add_argument('--expected-sha256',default='')
    args=a.parse_args()
    try:
        result=check(args.archive,args.key_json,args.expected_sha256)
    except Exception as exc:
        print(json.dumps({'status':'FAIL','reason':str(exc)},ensure_ascii=False),file=sys.stderr)
        return 1
    print(json.dumps(result,ensure_ascii=False))
    return 0


if __name__=='__main__':
    sys.exit(main())