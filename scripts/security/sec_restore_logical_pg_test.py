#!/usr/bin/env python3
"""Synthetic-only tests of the local PostgreSQL stage-restore generator."""
import contextlib
import io
import json
import secrets
import subprocess
import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape
import sec_restore_logical_pg as r


def fixture(root):
    must = {
        'public.employees','public.attendance_events','public.event_corrections',
        'public.stores','public.admin_users','public.employee_documents',
        'public.payroll_period','public.payroll_period_employee','public.payroll_snapshot',
        'auth.users','auth.sessions','auth.refresh_tokens','storage.objects',
        'private.attendance_mutation_audit_v1','session_guard.latest_session',
    }
    names=set(must)
    while len(names)<101: names.add('public.fixture_table_'+str(len(names)).zfill(3))
    tables=[]
    for i,fullname in enumerate(sorted(names)):
        schema,name=fullname.split('.')
        c=[{'name':'id','type':'bigint'}, {'name':'note','type':'text'}, {'name':'attrs','type':'jsonb'}]
        obj={'id':i+1,'note':"fixture ' \" \n 한글",'attrs':{'is_test':True,'serial':i}}
        if fullname=='auth.users':
            c.append({'name':'factor','type':'auth.factor_type'})
            obj['factor']='totp'
        if fullname=='storage.objects':
            c.append({'name':'tags','type':'text[]'})
            obj['tags']=['one','two']
        xml='<row><row_json>'+escape(json.dumps(obj,ensure_ascii=False))+'</row_json></row>'
        tables.append({'schema':schema,'table':name,'columns':c,'row_xml':xml,
                       'constraints':[{'type':'p','name':name+'_pkey','ddl':'PRIMARY KEY (id)'}]})
    snapshot={'format':r.FORMAT,'table_count':len(tables),'tables':tables,
              'enums':[{'schema':'auth','type':'factor_type','value':v,'order':i}
                       for i,v in enumerate(['totp','phone'])],
              'functions':[],'sequences':[]}
    plain=root/'fixture.json'; plain.write_text(json.dumps(snapshot,ensure_ascii=False))
    secret=secrets.token_hex(32)
    key=root/'key.json';key.write_text(json.dumps({'format':'baekeok-pgcrypto-logical-recovery-key-v1','passphrase_hex':secret}))
    archive=root/'fixture.pgp'
    p=subprocess.run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-fd','0',
                      '--symmetric','--cipher-algo','AES256','--output',str(archive),str(plain)],
                     input=(secret+'\n').encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    if p.returncode:raise RuntimeError('synthetic GPG fixture failed')
    return archive,key,snapshot


class TestIsolatedSQLRestore(unittest.TestCase):
    def setUp(self):
        d=tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.archive,self.key,self.snapshot=fixture(Path(d.name))

    def test_valid_backup_emits_101_typed_tables_and_row_proof(self):
        obj,digest=r.decode(self.archive,self.key)
        sql,counts,enums=r.build_sql(obj)
        self.assertEqual(len(counts),101)
        self.assertEqual(sum(counts.values()),101)
        self.assertEqual(enums,1)
        self.assertIn('CREATE TYPE "auth"."factor_type"',sql)
        self.assertIn('jsonb_populate_recordset(NULL::"auth"."users"',sql)
        self.assertIn('jsonb_populate_recordset(NULL::"storage"."objects"',sql)
        self.assertIn('PRIMARY KEY (id)',sql)
        self.assertTrue(sql.startswith('BEGIN;'))
        self.assertTrue(sql.rstrip().endswith('COMMIT;'))

    def test_wrong_key_fails_before_restore(self):
        obj=json.loads(self.key.read_text())
        obj['passphrase_hex']=secrets.token_hex(32)
        self.key.write_text(json.dumps(obj))
        with self.assertRaisesRegex(ValueError,'decryption failed'):
            r.decode(self.archive,self.key)

    def test_incorrect_digest_fails_before_decrypt(self):
        with self.assertRaisesRegex(ValueError,'SHA-256 mismatch'):
            r.decode(self.archive,self.key,'0'*64)

    def test_missing_table_manifest_fails(self):
        x=dict(self.snapshot);x['tables']=x['tables'][:-1]
        with self.assertRaisesRegex(ValueError,'manifest incomplete'):
            r.build_sql(x)

    def test_sql_injection_type_fails(self):
        x=json.loads(json.dumps(self.snapshot))
        x['tables'][0]['columns'][0]['type']='bigint); DROP TABLE auth.users; --'
        with self.assertRaisesRegex(ValueError,'unsupported PostgreSQL column type'):
            r.build_sql(x)

    def test_requires_isolated_dbname(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(r.main(['--archive',str(self.archive),'--key-json',str(self.key),
                                     '--database','postgres','--apply-isolated']),1)


if __name__=='__main__': unittest.main(verbosity=2)