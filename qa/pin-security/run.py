#!/usr/bin/env python3
"""Real PostgreSQL integration; isolated fixture only. Never reads a live DSN."""
import os,subprocess,json,pathlib,concurrent.futures,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
PSQL=os.environ.get('PIN_QA_PSQL','psql'); DB=os.environ.get('PGDATABASE','audit_pin')
assert DB.startswith(('audit_pin','pin_fixture')), 'disposable database name required'
passed=0
def sql(q):
 p=subprocess.run([PSQL,'-X','-v','ON_ERROR_STOP=1','-At',DB,'-c',q],capture_output=True,text=True)
 if p.returncode: raise AssertionError(p.stderr[-3000:])
 return p.stdout.strip().splitlines()
def call(q,role='anon'):
 r=sql('set role '+role+'; select '+q+'; reset role;')
 return json.loads(next(s for s in r if s[:1] in '{['))
def ok(b,label):
 global passed
 assert b,label
 passed+=1;print('PASS',label,flush=True)
def view(e,pin):return f"public.my_events({e},'{pin}','2026-10-01','2026-11-01')"
def reset(e):sql(f"select setval('pin_private.e_{e}',1,true)")
if '--baseline' in sys.argv:
 for _ in range(6): call(view(710001,'0000'))
 r=call(view(710001,'1234'))
 # A security regression test must fail against the observed original functions.
 ok(r.get('error')=='RATE_LIMITED','baseline blocks correct PIN after repeated wrong attempts')
 sys.exit(0)
# Install default-OFF via separate psql before running this suite.
ok(call(view(710001,'1234'))['ok'],'default OFF preserves original PIN success')
sql('update pin_private.settings set enabled=true')
# Snapshot all business table contents after installation, before legitimate actions.
def business():return sql("select jsonb_object_agg(t.n,t.d) from (select c.relname n, md5(coalesce((xpath('/row/s/text()',query_to_xml(format('select string_agg(to_jsonb(x)::text,%L order by to_jsonb(x)::text) s from public.%I x',chr(10),c.relname),false,true,'')))[1]::text,'')) d from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') t;")
before=business()
# Cross-RPC budget and different "devices" must share one employee state.
r=call("punch(710001,'0000','PC',NULL)");ok(r['error']=='BAD_PIN','first punch wrong PIN rejected')
call(view(710001,'0000'))
call("request_correction(710001,'0000','WRONG_TIME',NULL,'2026-10-31 09:00','IN','synthetic')")
call("staff_actual_attendance(710001,'0000','2026-10-01','2026-11-01')")
r=call("substitution_request_list(710001,'0000')")
ok(r['error']=='RATE_LIMITED','five failures across all PIN RPC families share a lock')
r=call("punch(710001,'1234','MOBILE',NULL)");ok(r['error']=='RATE_LIMITED','correct PIN/device switch cannot bypass active lock')
ok(1<=r['retry_after_seconds']<=900,'bounded temporary retry period')
ok(business()==before,'failed/locked attempts change NO business rows')
# State cannot be rolled back by a caller-controlled response/transaction failure.
for _ in range(5):sql('begin; set role anon; select '+view(710002,'0000')+'; rollback;')
ok(call(view(710002,'1234'))['error']=='RATE_LIMITED','intentional ROLLBACK cannot erase failure budget')
# Independent employee/store unaffected; no store-wide denial or IP dependence.
ok(call(view(710004,'1234'))['ok'],'other store employee remains usable')
ok(call(view(710005,'1234'))['ok'],'same shop colleague remains usable')
# Existing employee lifecycle, unknown/deactivated, NULL and oversized PIN handling.
for p in ['NULL',"''","repeat('0',1000)","'x'"]:
 r=call(f"my_events(710006,{p},'2026-10-01','2026-11-01')")
 ok(not r['ok'],'malformed PIN rejected')
ok(call(view(710006,'1234'))['ok'],'correct PIN before lock clears failures')
sql("insert into employees values(710041,'Synthetic new employee',41,710001,true,extensions.crypt('5678',extensions.gen_salt('bf',4)))")
ok(call(view(710041,'5678'))['ok'],'new employee automatically receives private guard state')
ok(not call(view(999999,'1234'))['ok'],'unknown employee rejected without allocating state')
sql('update employees set is_active=false where id=710041')
ok(not call(view(710041,'5678'))['ok'],'inactive employee denied')
sql('update employees set is_active=true where id=710041')
# Simulate expiry WITHOUT waiting or altering production time.
sql("select setval('pin_private.e_710001',(floor(extract(epoch from clock_timestamp()))::bigint-901)*10+5,true)")
ok(call(view(710001,'1234'))['ok'],'lock expires automatically')
# Unchanged success contracts: old PC/default parameters, mobile, substitute, records/corrections.
r=call("punch(710007,'1234')");ok(r['ok'] and r['type']=='IN','legacy PC punch default arguments -> IN')
r=call("punch(710007,'1234','MOBILE',NULL)");ok(r['ok'] and r['type']=='OUT','mobile next punch -> OUT')
ok(len(call(view(710007,'1234'))['events'])==2,'own PIN records preserve IN/OUT')
r=call("request_correction(710007,'1234','WRONG_TIME',NULL,'2026-10-31 09:00','IN','synthetic request')");ok(r['ok'] and r['id']>0,'existing correction submission contract')
r=call("staff_actual_attendance(710007,'1234','2026-10-01','2026-11-01')");ok(r['ok'] and r['employee']['id']==710007,'staff attendance contract')
r=call("request_correction(710004,'1234','WRONG_TIME',1,'2026-10-31 09:00','IN','cross')");ok(r['error']=='EVENT_EMPLOYEE_MISMATCH','other employee event access remains blocked')
ok(call(view(710003,'1234'))['error']=='STORE_NOT_READY','STAGED store remains blocked')
# All 15 guarded source functions have exact signatures, controlled anonymous access.
ok(sql("select count(*) from pin_private.source_archive")[0]=='15','all fifteen verification/caller functions covered')
ok(sql("select has_function_privilege('anon','pin_private.verify(bigint,text,bigint)','EXECUTE')")[0]=='f','internal verification RPC inaccessible directly')
ok(sql("select has_schema_privilege('anon','pin_private','USAGE')")[0]=='f','guard schema not public')
ok(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='pin_private' and c.relkind='S' and CASE WHEN c.relkind='S' THEN has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') ELSE false END")[0]=='0','caller cannot read/reset nontransactional counters')
# Concurrent failures across separate actual PostgreSQL sessions: no lost updates.
reset(710008)
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 results=list(pool.map(lambda _:call(view(710008,'0000')),range(12)))
ok(sum(x.get('error')=='BAD_PIN' for x in results)==4 and sum(x.get('error')=='RATE_LIMITED' for x in results)==8,'12 simultaneous attempts stop on fifth failure, no race')
print('PIN_SECURITY_SQL_PASS',passed)
