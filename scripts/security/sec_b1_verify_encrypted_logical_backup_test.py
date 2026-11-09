#!/usr/bin/env python3
"""Synthetic-only tests. Never upload any real DB backup to CI."""
import importlib.util
import json
import secrets
import subprocess
import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape

SRC = Path(__file__).with_name('sec_b1_verify_encrypted_logical_backup.py')
spec = importlib.util.spec_from_file_location('verify', SRC)
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)

class TestPrivateOfflineSnapshot(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.addCleanup(self.d.cleanup)
        root=Path(self.d.name)
        names = sorted(verify.REQUIRED | {"session_guard.latest_session"})
        while len(names)<101:
            names.append('public.qa_synthetic_'+str(len(names)).zfill(3))
        rows=[]
        for i, name in enumerate(names):
            schema,table=name.split('.')
            data={'synthetic_id':i,'no_real_users':'fixture'}
            xml_text='<row><row_json>'+escape(json.dumps(data))+'</row_json></row>'
            rows.append({'schema':schema,'table':table,'columns':[{'name':'synthetic_id','type':'integer'}], 'row_xml':xml_text})
        snap={'format':'baekeok-readonly-encrypted-logical-db-snapshot-v1', 'captured_at':'synthetic-test-only',
              'table_count':101,'tables':rows,'functions':[{'name':'fake'}]*305,
              'sequences':[{'name':'fake'}]*37,'extensions':[], 'schemas':[]}
        plain=root/'synthetic.json';plain.write_text(json.dumps(snap))
        k=secrets.token_hex(32)
        self.key=root/'secret.json';self.key.write_text(json.dumps({'format':'baekeok-pgcrypto-logical-recovery-key-v1','passphrase_hex':k}))
        self.archive=root/'synthetic.pgp'
        p=subprocess.run(['gpg','--batch','--yes','--pinentry-mode','loopback',
           '--passphrase-fd','0','--symmetric','--cipher-algo','AES256',
           '--output',str(self.archive),str(plain)],input=(k+'\n').encode(),
           stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        self.assertEqual(p.returncode,0)

    def test_valid_all_101(self):
        x=verify.check(self.archive,self.key)
        self.assertEqual(x['status'],'PASS')
        self.assertEqual(x['tables_verified'],101)
        self.assertEqual(x['rows_redecoded_and_json_parsed'],101)
        self.assertFalse(x['database_sql_restore_performed'])

    def test_wrong_key_fails_closed(self):
        self.key.write_text(json.dumps({'format':'baekeok-pgcrypto-logical-recovery-key-v1','passphrase_hex':secrets.token_hex(32)}))
        with self.assertRaisesRegex(ValueError,'decryption failed'):
            verify.check(self.archive,self.key)

    def test_tampered_archive_sha_fails(self):
        import hashlib
        original=hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.archive.write_bytes(self.archive.read_bytes()+b'CORRUPTED')
        with self.assertRaisesRegex(ValueError,'SHA-256 mismatch'):
            verify.check(self.archive,self.key,original)

    def test_incomplete_manifest_fails(self):
        self.key.write_text(json.dumps({'format':'baekeok-pgcrypto-logical-recovery-key-v1','passphrase_hex':'invalid'}))
        with self.assertRaisesRegex(ValueError,'recovery-key format'):
            verify.check(self.archive,self.key)

if __name__ == '__main__':
    unittest.main(verbosity=2)