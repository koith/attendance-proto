#!/usr/bin/env python3
"""Synthetic-only tests of the local PostgreSQL stage-restore generator."""
import base64
import contextlib
import hashlib
import io
import json
import os
from unittest import mock
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

    def test_full_precision_numeric_lexeme_is_never_converted_to_float(self):
        from xml.sax.saxutils import escape
        x=json.loads(json.dumps(self.snapshot))
        table=next(z for z in x['tables'] if z['schema']=='public' and z['table']=='payroll_snapshot')
        table['columns'].append({'name':'precise_amount','type':'numeric'})
        amount='12345678901234567890.1234567890123456789012345'
        raw='{"id":9,"note":"fixture","attrs":{"test":true},"precise_amount":'+amount+'}'
        table['row_xml']='<row><row_json>'+escape(raw)+'</row_json></row>'
        statement,counts,_=r.build_sql(x)
        self.assertIn(amount,statement)
        self.assertNotIn('1.2345678901234567e+19',statement)

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

    def test_constraint_ddl_cannot_smuggle_sql_from_archive(self):
        for ddl in ('PRIMARY KEY (id); CREATE TABLE public.injected_by_archive(x int)',
                    'PRIMARY KEY (id) -- trailing', 'UNIQUE (id)) ; DROP SCHEMA auth CASCADE; --',
                    'UNIQUE NULLS NOT DISTINCT (id)', 'PRIMARY KEY (no_such_column)'):
            x=json.loads(json.dumps(self.snapshot))
            x['tables'][0]['constraints'][0]['ddl']=ddl
            with self.assertRaisesRegex(ValueError,'unrecognized PK/UNIQUE constraint'):
                r.build_sql(x)

    def test_real_pg_constraint_forms_are_accepted(self):
        for ddl in ('PRIMARY KEY (id)','UNIQUE (id, note)','PRIMARY KEY (id) INCLUDE (note)',
                    'UNIQUE (id) DEFERRABLE INITIALLY DEFERRED'):
            x=json.loads(json.dumps(self.snapshot))
            x['tables'][0]['constraints'][0]['ddl']=ddl
            sql,_,_=r.build_sql(x)
            self.assertIn(ddl+';',sql)

    def test_every_batch_is_content_checked_and_sequences_restored(self):
        x=json.loads(json.dumps(self.snapshot))
        x['sequences']=[{'schemaname':'public','sequencename':'employees_id_seq','data_type':'bigint',
                         'start_value':1,'min_value':1,'max_value':9223372036854775807,
                         'increment_by':1,'cycle':False,'cache_size':1,'last_value':41}]
        sql,counts,_=r.build_sql(x)
        self.assertEqual(sql.count('restored value differs from archived row'),len(counts))
        self.assertIn('CREATE SEQUENCE "public"."employees_id_seq" AS bigint',sql)
        self.assertIn('''setval('"public"."employees_id_seq"'::regclass, 41, true)''',sql)
        self.assertIn(r.SUMMARY_TAG,sql)

    def test_invalid_sequence_metadata_fails_closed(self):
        base={'schemaname':'public','sequencename':'s','data_type':'bigint','start_value':1,'min_value':1,
              'max_value':10,'increment_by':1,'cycle':False,'cache_size':1,'last_value':None}
        for bad in ({'schemaname':'pg_catalog'},{'data_type':'bigint; DROP TABLE x'},
                    {'increment_by':'1; DROP TABLE x'},{'sequencename':'s"; DROP TABLE x; --'}):
            x=json.loads(json.dumps(self.snapshot)); x['sequences']=[dict(base,**bad)]
            with self.assertRaises(ValueError):
                r.build_sql(x)

    def test_refuses_remote_pg_host_even_with_isolated_dbname(self):
        with mock.patch.dict('os.environ', {'PGHOST':'prod.db.example.com'}, clear=False):
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(r.main(['--archive',str(self.archive),
                                         '--key-json',str(self.key),
                                         '--database','sec_restore_qa',
                                         '--apply-isolated']),1)

    def test_requires_isolated_dbname(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(r.main(['--archive',str(self.archive),'--key-json',str(self.key),
                                     '--database','postgres','--apply-isolated']),1)


# ---------------------------------------------------------------------------
# E2E: the REAL capture SQL -> encrypted archive -> isolated restore -> compare
# with the source database. Synthetic rows only. Needs a disposable local
# PostgreSQL (PG* environment) and is opt-in: SEC_RESTORE_E2E=1.
# ---------------------------------------------------------------------------
E2E_SCHEMAS=('public','auth','storage','private','session_guard')
E2E_SOURCE_SQL = r"""
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA private; CREATE SCHEMA session_guard;
CREATE TYPE auth.aal_level AS ENUM ('aal1','aal2','aal3');
CREATE TYPE auth.factor_type AS ENUM ('totp','webauthn','phone');
CREATE TYPE storage.buckettype AS ENUM ('STANDARD','ANALYTICS');

CREATE TABLE public.stores(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name text NOT NULL, is_active boolean DEFAULT true, onboarding_status text, opened_on date);
CREATE TABLE public.employees(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, store_id bigint REFERENCES public.stores(id), employee_no integer, name text NOT NULL,
  wage integer, juhyu_hours numeric, tax_rate numeric(6,4), memo text, is_active boolean, UNIQUE(store_id,employee_no));
CREATE TABLE public.attendance_events(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, employee_id bigint, event_type text, event_at timestamp without time zone,
  server_received_at timestamp without time zone, client_reported_at timestamp with time zone, device_id text, voided boolean DEFAULT false);
CREATE TABLE public.event_corrections(id bigint PRIMARY KEY, event_id bigint, reason text, created_at timestamptz DEFAULT now());
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY, admin_role text, store_ids text[]);
CREATE TABLE public.employee_documents(id bigint PRIMARY KEY, employee_id bigint, storage_path text, meta jsonb);
CREATE TABLE public.payroll_period(id bigint PRIMARY KEY, ym text UNIQUE, closed_at timestamptz);
CREATE TABLE public.payroll_period_employee(period_id bigint, employee_id bigint, PRIMARY KEY(period_id,employee_id));
CREATE TABLE public.payroll_snapshot(id bigint PRIMARY KEY, employee_id bigint, gross numeric, net numeric(14,2), detail jsonb, work_start time without time zone);
CREATE TABLE public.employment_contract_workdays(id bigint PRIMARY KEY, weekday smallint, planned_start time, planned_end time);
CREATE TABLE public.legacy_serial(id bigserial PRIMARY KEY, v text);
CREATE TABLE public.seq_lag_probe(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, v text);
CREATE TABLE auth.users(id uuid PRIMARY KEY, aud character varying(255), email character varying(255), encrypted_password character varying(255),
  raw_app_meta_data jsonb, email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
  confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED, is_sso_user boolean DEFAULT false);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid, aal auth.aal_level, refreshed_at timestamp without time zone, ip inet, user_agent text, not_after timestamptz);
CREATE TABLE auth.refresh_tokens(id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, token character varying(255) UNIQUE, revoked boolean, session_id uuid);
CREATE TABLE auth.audit_log_entries(id uuid PRIMARY KEY, payload json, ip_address character varying(64));
CREATE TABLE auth.identities(id uuid PRIMARY KEY, identity_data jsonb NOT NULL, email text GENERATED ALWAYS AS (lower(identity_data->>'email')) STORED);
CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY, factor_type auth.factor_type, secret text);
CREATE TABLE auth.sso_providers(id uuid PRIMARY KEY, resource_id text);            -- empty table
CREATE TABLE auth.saml_providers(id uuid PRIMARY KEY, metadata_xml text);          -- empty table
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], type storage.buckettype DEFAULT 'STANDARD');
CREATE TABLE storage.objects(id uuid PRIMARY KEY, bucket_id text, name text, metadata jsonb, path_tokens text[] GENERATED ALWAYS AS (string_to_array(name,'/')) STORED, version text);
CREATE TABLE storage.migrations(id integer PRIMARY KEY, name character varying(100) UNIQUE, hash character varying(40), executed_at timestamp);
CREATE TABLE private.attendance_mutation_audit_v1(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_uid uuid, action text, old_row jsonb, new_row jsonb, at timestamptz);
CREATE TABLE private.kiosk_token(id bigint PRIMARY KEY, token_digest bytea, expires_at timestamptz);
CREATE TABLE session_guard.latest_session(user_id uuid PRIMARY KEY, session_id uuid, updated_at timestamptz);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_admin_read ON public.employees FOR SELECT TO authenticated USING (store_id = 1);
CREATE POLICY emp_everyone_none ON public.employees FOR SELECT TO PUBLIC USING (false);

INSERT INTO public.stores VALUES (1,'fixture store',true,'READY','2026-08-01'),(2,E'Tab\there & <b>"q"</b> ]]> ''sq''',false,NULL,NULL);
INSERT INTO public.employees VALUES
 (1,1,1,'fixture A',12500,4.4,0.0330,E'line1\nline2\r\ncarriage & <tag> \\backslash $BACKUP_1_0$ 😀 한글',true),
 (2,1,2,'same name',10030,0,0.0330,NULL,true),(3,2,1,'same name',9860,3.123456789012345678901234567890,NULL,'',false);
INSERT INTO public.attendance_events(id,employee_id,event_type,event_at,server_received_at,client_reported_at,device_id,voided) VALUES
 (9007199254740993,1,'IN','2026-10-31 23:59:59.999999','2026-11-01 00:00:00','2026-10-31 23:59:59.123456+09','PC',false),
 (2,1,'OUT','2026-11-01 02:10:00','2026-11-01 02:10:01',NULL,NULL,true);
INSERT INTO public.event_corrections VALUES (1,2,'fixture reason','2026-11-01 03:00:00+00');
INSERT INTO public.admin_users VALUES ('00000000-0000-0000-0000-0000000000a1','owner',ARRAY['1','2',NULL,'a,b','c"d','']);
INSERT INTO public.employee_documents VALUES (1,1,'contracts/1/fixture.pdf','{"k":[1,2,{"n":null}],"big":123456789012345678901234567890,"s":"é\n"}');
INSERT INTO public.payroll_period VALUES (1,'2026-10','2026-11-05 10:00:00+09');
INSERT INTO public.payroll_period_employee VALUES (1,1),(1,2);
INSERT INTO public.payroll_snapshot VALUES (1,1,12345678901234567890.1234567890123456789012345,2037660.00,'{"gross":2107200,"rate":0.033}','09:14:00'),(2,2,0.1,-0.50,'{}',NULL);
INSERT INTO public.employment_contract_workdays VALUES (1,1,'09:00','14:30:00');
INSERT INTO auth.users(id,aud,email,encrypted_password,raw_app_meta_data,email_confirmed_at,phone_confirmed_at) VALUES
 ('00000000-0000-0000-0000-0000000000a1','authenticated','a@example.test','synthetic-hash-only','{"provider":"email"}','2026-09-01 00:00:00+00',NULL),
 ('00000000-0000-0000-0000-0000000000a2','authenticated','b@example.test',NULL,'{}','2026-09-02 00:00:00+00','2026-09-03 00:00:00+00');
INSERT INTO auth.sessions VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','aal1','2026-11-01 01:02:03','203.0.113.7','Mozilla/5.0 (iPhone)',NULL);
INSERT INTO auth.refresh_tokens(id,token,revoked,session_id) VALUES (1,'synthetic-token-1',false,'00000000-0000-0000-0000-0000000000b1');
INSERT INTO auth.audit_log_entries VALUES ('00000000-0000-0000-0000-0000000000c1','{"action" : "login",  "actor":"a", "n": 1.50}','203.0.113.7');
INSERT INTO auth.identities(id,identity_data) VALUES ('00000000-0000-0000-0000-0000000000d1','{"email":"A@Example.Test","sub":"x"}');
INSERT INTO auth.mfa_factors VALUES ('00000000-0000-0000-0000-0000000000e1','totp','synthetic');
INSERT INTO storage.buckets VALUES ('fixture-docs','fixture-docs',false,52428800,ARRAY['application/pdf','image/png'],'STANDARD');
INSERT INTO storage.objects(id,bucket_id,name,metadata,version) VALUES ('00000000-0000-0000-0000-0000000000f1','fixture-docs','contracts/1/fixture.pdf','{"size":26890252,"mimetype":"application/pdf"}','v1');
INSERT INTO storage.migrations VALUES (0,'create-migrations-table','e18db593bcde2aca2a408c4d1100f6abba2195df','2026-08-25 12:00:00');
INSERT INTO private.attendance_mutation_audit_v1(actor_uid,action,old_row,new_row,at) VALUES (NULL,'VOID','{"id":2}',NULL,'2026-11-01 02:11:00+00');
INSERT INTO private.kiosk_token VALUES (1,decode('00ff10deadbeef5c27','hex'),'2026-11-01 10:00:00+00');
INSERT INTO session_guard.latest_session VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','2026-11-01 01:02:03+00');
INSERT INTO public.legacy_serial(v) VALUES ('a'),('b'),('c');
INSERT INTO public.seq_lag_probe(id,v) VALUES (500,'explicit id beyond its never-used sequence');
-- Identity sequences advanced past explicitly inserted keys, as on a healthy source.
SELECT setval(pg_get_serial_sequence('public.stores','id'),(SELECT max(id) FROM public.stores));
SELECT setval(pg_get_serial_sequence('public.employees','id'),(SELECT max(id) FROM public.employees));
SELECT setval(pg_get_serial_sequence('public.attendance_events','id'),(SELECT max(id) FROM public.attendance_events));
SELECT setval(pg_get_serial_sequence('auth.refresh_tokens','id'),(SELECT max(id) FROM auth.refresh_tokens));
-- Table count comparable to the real scope; half deliberately empty.
DO $$ BEGIN FOR i IN 1..80 LOOP
  EXECUTE format('CREATE TABLE public.filler_%s(id bigint PRIMARY KEY, note text, attrs jsonb, at timestamptz)', lpad(i::text,3,'0'));
  IF i % 2 = 0 THEN EXECUTE format('INSERT INTO public.filler_%s SELECT g, ''row ''||g, jsonb_build_object(''g'',g), ''2026-01-01''::timestamptz + g*interval ''1 min'' FROM generate_series(1,%s) g', lpad(i::text,3,'0'), 250+i); END IF;
END LOOP; END $$;
"""

def _psql(db, sql, check=True):
    p=subprocess.run(['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-d',db],input=sql.encode('utf8'),
                     stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if check and p.returncode: raise RuntimeError('fixture psql failed: '+p.stderr.decode('utf8','replace')[-600:])
    return p.stdout.decode('utf8')


@unittest.skipUnless(os.environ.get('SEC_RESTORE_E2E')=='1','needs a disposable local PostgreSQL (SEC_RESTORE_E2E=1)')
class TestRealCaptureSqlToPostgresE2E(unittest.TestCase):
    SRC='sec_capture_src_e2e'; DST='sec_restore_e2e'; LOSSY='sec_restore_e2e_lossy'

    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(); root=Path(cls.tmp.name)
        for db in (cls.SRC,cls.DST,cls.LOSSY):
            _psql('postgres','DROP DATABASE IF EXISTS '+db+';'); _psql('postgres','CREATE DATABASE '+db+' TEMPLATE template0;')
        _psql(cls.SRC,"ALTER DATABASE "+cls.SRC+" SET timezone TO 'UTC';")
        _psql(cls.SRC,E2E_SOURCE_SQL)
        capture=(Path(__file__).resolve().parents[2]/'security'/'sec_b1_readonly_logical_capture.sql').read_text()
        secret=secrets.token_hex(32)
        parts=[json.loads(l) for l in _psql(cls.SRC,capture.replace('__SECRET_FROM_PRIVATE_ESCROW__',secret)).splitlines() if l.strip()]
        parts.sort(key=lambda z:z['chunk'])
        assert parts and len(parts)==parts[0]['count']
        cipher=base64.b64decode(''.join(z['data'] for z in parts))
        cls.sha=hashlib.sha256(cipher).hexdigest()
        assert cls.sha==parts[0]['cipher_sha256'] and len(cipher)==parts[0]['cipher_bytes']
        cls.archive=root/'real_capture.pgp'; cls.archive.write_bytes(cipher)
        cls.key=root/'key.json'
        cls.key.write_text(json.dumps({'format':'baekeok-pgcrypto-logical-recovery-key-v1','passphrase_hex':secret}))
        cls.snapshot,_=r.decode(cls.archive,cls.key,cls.sha)
        out=io.StringIO(); err=io.StringIO()
        with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
            cls.rc=r.main(['--archive',str(cls.archive),'--key-json',str(cls.key),'--sha256',cls.sha,
                           '--database',cls.DST,'--apply-isolated'])
        cls.result=json.loads(out.getvalue()) if cls.rc==0 else {'stderr':err.getvalue()}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def _tables(self,db):
        return _psql(db,"SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                        "WHERE n.nspname IN "+str(E2E_SCHEMAS)+" AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY 1;").split()

    def test_restore_passes_with_content_verification(self):
        self.assertEqual(self.rc,0,self.result)
        self.assertEqual(self.result['status'],'PASS')
        self.assertIs(self.result['row_content_verified'],True)
        self.assertIs(self.result['full_operational_restore'],False)
        self.assertEqual(self.result['tables'],len(self._tables(self.SRC)))

    def test_every_table_matches_source_rows_and_content(self):
        src=self._tables(self.SRC)
        self.assertGreaterEqual(len(src),100)
        self.assertEqual(src,self._tables(self.DST))
        total=0
        for full in src:
            s,n=full.split('.')
            q=("SET timezone TO 'UTC'; SELECT count(*)||':'||md5(coalesce(string_agg(j, E'\\n' ORDER BY j),'')) "
               "FROM (SELECT row_to_json(x)::jsonb::text AS j FROM \""+s+"\".\""+n+"\" x) y;")
            a=_psql(self.SRC,q).strip().splitlines()[-1]; b=_psql(self.DST,q).strip().splitlines()[-1]
            self.assertEqual(a,b,'restored content differs: '+full)
            total+=int(a.split(':')[0])
        self.assertEqual(total,self.result['row_count'])

    def test_sequences_restored_at_source_position(self):
        q=("SELECT coalesce(json_object_agg(schemaname||'.'||sequencename, last_value),'{}')::text FROM pg_sequences "
           "WHERE schemaname IN "+str(E2E_SCHEMAS)+";")
        src=json.loads(_psql(self.SRC,q)); dst=json.loads(_psql(self.DST,q))
        self.assertGreaterEqual(len(src),6)
        self.assertEqual(src,dst)
        self.assertEqual(self.result['sequences_restored'],len(src))

    def test_sequence_behind_restored_data_is_reported(self):
        # Only the deliberately broken probe: its next nextval() would collide with an existing key.
        self.assertEqual(self.result['sequence_behind_data'],['public.seq_lag_probe.id'])

    def test_capture_stores_policy_roles_by_name_not_cluster_oid(self):
        emp=next(t for t in self.snapshot['tables'] if (t['schema'],t['table'])==('public','employees'))
        roles={p['name']:p['roles'] for p in emp['policies']}
        self.assertEqual(roles,{'emp_admin_read':['authenticated'],'emp_everyone_none':['public']})
        self.assertIs(emp['rls'],True)

    def test_value_altered_by_typed_restore_fails_and_rolls_back(self):
        d=Path(self.tmp.name)/'lossy'; d.mkdir()
        _,key,snap=fixture(d)
        snap=json.loads(json.dumps(snap))
        t=next(z for z in snap['tables'] if z['table']=='payroll_snapshot')
        t['columns'].append({'name':'net','type':'numeric(6,2)'})
        t['row_xml']='<row><row_json>'+escape('{"id":1,"note":"x","attrs":{},"net":1234.567}')+'</row_json></row>'
        plain=d/'lossy.json'; plain.write_text(json.dumps(snap,ensure_ascii=False))
        archive=d/'lossy.pgp'; secret=json.loads(key.read_text())['passphrase_hex']
        p=subprocess.run(['gpg','--batch','--yes','--pinentry-mode','loopback','--passphrase-fd','0','--symmetric',
                          '--cipher-algo','AES256','--output',str(archive),str(plain)],
                         input=(secret+'\n').encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        self.assertEqual(p.returncode,0)
        with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            rc=r.main(['--archive',str(archive),'--key-json',str(key),'--database',self.LOSSY,'--apply-isolated'])
        self.assertEqual(rc,1)
        left=_psql(self.LOSSY,"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                              "WHERE n.nspname IN "+str(E2E_SCHEMAS)+" AND c.relkind='r';").strip()
        self.assertEqual(left,'0')



    def test_archived_foreign_keys_and_notnull_are_restored(self):
        src_fk=int(_psql(self.SRC,"SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public';").strip())
        dst_fk=int(_psql(self.DST,"SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public';").strip())
        self.assertGreaterEqual(src_fk,1)
        self.assertEqual(src_fk,dst_fk)
        self.assertEqual(self.result['foreign_keys_restored'],src_fk)
        q=("SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid "
           "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' "
           "AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull;")
        self.assertEqual(_psql(self.SRC,q).strip(),_psql(self.DST,q).strip())
        self.assertGreater(self.result['notnull_columns_restored'],0)


class TestFKMetadataValidation(unittest.TestCase):
    def setUp(self):
        d=tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.archive,self.key,self.snapshot=fixture(Path(d.name))

    def _example(self, ddl):
        obj=json.loads(json.dumps(self.snapshot))
        t=next(t for t in obj['tables'] if t['schema']=='public' and t['table']=='employees')
        t['constraints'].append({'name':'fake_fk_test','type':'f','ddl':ddl})
        return obj

    def test_canonical_fk_restore(self):
        d='FOREIGN KEY (id) REFERENCES public.stores(id) ON DELETE CASCADE'
        sql,_,_=r.build_sql(self._example(d))
        self.assertIn('ADD CONSTRAINT "fake_fk_test" FOREIGN KEY ("id") REFERENCES "public"."stores" ("id") ON DELETE CASCADE',sql)
        self.assertIn("'foreign_keys_restored', 1",sql)

    def test_fails_closed_on_injected_unknown_and_ambiguous_fk(self):
        attempts=[
          'FOREIGN KEY (id) REFERENCES public.stores(id); DROP TABLE auth.users;',
          'FOREIGN KEY (id) REFERENCES public.no_such_table(id)',
          'FOREIGN KEY (id) REFERENCES public.stores(no_such_column)',
          'FOREIGN KEY (no_such_column) REFERENCES public.stores(id)',
          'FOREIGN KEY (id) REFERENCES public.stores(id) ON DELETE EXECUTE',
          'FOREIGN KEY (id) REFERENCES public.stores(id) ON UPDATE CASCADE'
        ]
        for ddl in attempts:
            with self.subTest(ddl=ddl), self.assertRaises(ValueError):
                r.build_sql(self._example(ddl))

    def test_notnull_stage_constraint(self):
        obj=json.loads(json.dumps(self.snapshot))
        t=next(t for t in obj['tables'] if t['schema']=='public' and t['table']=='stores')
        t['columns'][1]['notnull']=True
        sql,_,_=r.build_sql(obj)
        self.assertIn('ALTER TABLE "public"."stores" ALTER COLUMN "note" SET NOT NULL;',sql)
        self.assertIn("'notnull_columns_restored', 1",sql)


if __name__=='__main__': unittest.main(verbosity=2)