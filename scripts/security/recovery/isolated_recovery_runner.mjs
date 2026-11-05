// SEC continuity B: SYNTHETIC restore-state rehearsal, not real backup restoration.
// Each psql call verifies the actual backend and a run-specific fixture marker in
// the SAME session as the following SQL. Refuses dirty/nonlocal/nonfixture DBs.
// Usage: PGDATABASE=pin_fixture_new_local PIN_QA_PSQL=psql node isolated_recovery_runner.mjs
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const DB=process.env.PGDATABASE||'';
const PSQL=process.env.PIN_QA_PSQL||'psql';
if(!/^(audit_pin|pin_fixture)[a-z0-9_]*$/.test(DB)){
 console.error('ISOLATION_REFUSED: disposable PGDATABASE required');process.exit(2);
}
const nonce=randomBytes(24).toString('hex');
// The server itself must report a local database with the disposable name.
const backendCheck=`do $g$ begin
 if current_database() !~ '^(audit_pin|pin_fixture)[a-z0-9_]*$' then raise exception 'ISOLATION_ABORT_DATABASE'; end if;
 if coalesce(host(inet_server_addr()),'socket') not in ('socket','127.0.0.1','::1') then raise exception 'ISOLATION_ABORT_SERVER'; end if;
 end $g$;`;
// The initial call refuses ALL existing application/provider tables, even in
// unrelated schemas. There is NO DROP SCHEMA/TABLE and NO overwrite behavior.
const emptyCheck=`do $e$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%'
  and n.nspname not like 'pg_temp_%' and c.relkind in ('r','p','m','f','S'))
 then raise exception 'ISOLATION_ABORT_DIRTY_DATABASE'; end if;
 end $e$;`;
const markerCheck=`do $m$ begin
 if not exists(select 1 from public.__sec_recovery_fixture where nonce='${nonce}')
 then raise exception 'ISOLATION_ABORT_FIXTURE_MISMATCH'; end if;
 end $m$;`;
function psql(sql,{initial=false}={}){
 const guard=backendCheck+(initial?emptyCheck:markerCheck);
 // -c sends the guard AND the payload in one backend session; any SQL error
 // rejects the whole -c batch (with ON_ERROR_STOP) before running payload.
 const out=execFileSync(PSQL,['-X','-v','ON_ERROR_STOP=1','-At','--dbname',DB,'-c',guard+' '+sql],
  {encoding:'utf8',stdio:['ignore','pipe','pipe']});
 return out.trim().split('\n').filter(s=>s!=='DO'&&s!=='CREATE TABLE'&&s!=='INSERT 0 1'&&s!=='CREATE SCHEMA').join('\n').trim();
}
const checks=[];
function check(label,condition,detail){checks.push({label,ok:!!condition,detail});}
try{
 // Atomic first connection: verify fresh disposable backend before creating
 // a random per-run sentinel. Any existing user table causes a hard refusal.
 psql(`create table public.__sec_recovery_fixture(nonce text primary key);
       insert into public.__sec_recovery_fixture values('${nonce}');`,{initial:true});
 // Reconstruct a tiny synthetic schema; never destructively reset public.
 psql(`create schema if not exists auth;
       create table public.attendance_events(
         id bigint generated always as identity primary key,
         employee_id bigint,store_id bigint,event_type text,event_at timestamptz);
       create table auth.users(id uuid primary key,email text);`);
 psql(`insert into public.attendance_events(employee_id,store_id,event_type,event_at)
       select g,(g%3)+1,'IN',now() from generate_series(1,10) g;
       select setval(pg_get_serial_sequence('public.attendance_events','id'),10,true);`);
 psql(`alter table public.attendance_events enable row level security;
       create policy tenant_isolation on public.attendance_events
       using (store_id=current_setting('app.store_id',true)::bigint);`);
 psql(`insert into auth.users values
       ('00000000-0000-0000-0000-000000000001','a@example.test'),
       ('00000000-0000-0000-0000-000000000002','b@example.test');`);
 check('ddl.business_table',psql("select to_regclass('public.attendance_events') is not null")==='t','business table exists');
 check('ddl.auth_users',psql("select to_regclass('auth.users') is not null")==='t','synthetic auth.users exists');
 check('data.business_rows',psql('select count(*) from public.attendance_events')==='10','10 synthetic rows');
 check('data.auth_users',psql('select count(*) from auth.users')==='2','2 synthetic Auth rows');
 const next=Number(psql(`insert into public.attendance_events(employee_id,store_id,event_type,event_at)
  values(99,1,'IN',now()) returning id`).split('\n').filter(s=>/^\d+$/.test(s)).at(-1));
 check('sequence.advanced',next===11,'expected next identity 11, got '+next);
 check('rls.enabled',psql("select relrowsecurity from pg_class where oid='public.attendance_events'::regclass")==='t','RLS on');
 check('rls.policy',psql("select count(*) from pg_policies where schemaname='public' and tablename='attendance_events' and policyname='tenant_isolation'")==='1','tenant policy present');
 // A temporary non-superuser role, only in this disposable PostgreSQL cluster.
 psql(`do $r$ begin if not exists(select 1 from pg_roles where rolname='recovery_probe')
  then create role recovery_probe nologin; end if; end $r$;
  grant usage on schema public to recovery_probe;
  grant select on public.attendance_events to recovery_probe;`);
 const seen=psql(`set role recovery_probe;set app.store_id='999';
  select count(*) from public.attendance_events;reset role;`).split('\n').filter(s=>/^\d+$/.test(s)).at(-1);
 check('rls.isolates',seen==='0','wrong tenant sees 0 rows as non-superuser');
 const passed=checks.filter(x=>x.ok).length;
 console.log(JSON.stringify({result:passed===checks.length?'RUNNER_VERIFIED_SYNTHETIC':'RUNNER_FAILED',
  checks_total:checks.length,checks_passed:passed,failures:checks.filter(x=>!x.ok),
  note:'Synthetic only. No actual encrypted backup restored, no GoTrue/Storage service recovery.'},null,2));
 process.exit(passed===checks.length?0:1);
}catch(e){
 console.error('ISOLATED_FIXTURE_RUN_FAILED: '+String(e.message).slice(0,600));
 process.exit(2);
}
