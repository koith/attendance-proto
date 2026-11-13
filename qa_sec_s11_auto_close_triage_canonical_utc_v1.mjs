// SEC-S11: disposable PostgreSQL 16/17 *real SQL* regression.
// This test NEVER connects to the live Supabase host and never supplies a real PIN,
// employee, event ID, access key, or amount. On failure, fail closed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const file='security/readonly_auto_close_triage_20261105.sql';
const fixture='qa/sec_s11_auto_close_triage_canonical_utc_fixture.sql';
const query=fs.readFileSync(file,'utf8');
const setup=fs.readFileSync(fixture,'utf8');

assert.match(query,/public\.attendance_correction_effective_utc\(c\.new_event_at,c\.created_by,c\.created_at\)/);
assert.ok((query.match(/public\.attendance_correction_effective_utc\(c\.new_event_at,c\.created_by,c\.created_at\)/g)||[]).length===2,
  'Both edited original and added correction require the canonical production converter');
assert.match(query,/WHERE a\.reason='SYSTEM_STORE_CLOSE'/);
assert.match(query,/c\.reason !~ '\[\[\]VOID_ADD/);
assert.doesNotMatch(query,/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE)\b/im,
  'Review query must contain only a SELECT');
assert.match(setup,/synthetic-only disposable PG16\/17 fixture/);
assert.ok(!/supabase\.co|https?:\/\//.test(setup), 'Fixtures cannot use production host');
// NO operating host, no password requirement: GitHub ephemeral PG service only.
const env={...process.env,PGHOST:'localhost',PGPORT:'5432',
  PGUSER:'postgres',PGPASSWORD:'sec_s11_synthetic_only',PGDATABASE:'sec_s11_fixture'};
const r=spawnSync('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
  '-f',fixture,'-f',file],{encoding:'utf8',env,timeout:60000,maxBuffer:1024*1024});
assert.equal(r.status,0,(r.stderr||'').slice(-900));
const lines=r.stdout.trim().split(/\r?\n/).filter(x=>/^2026-10\|/.test(x));
assert.equal(lines.length,1,'Expected a single synthetic October month');
const cols=lines[0].split('|');
assert.deepEqual(cols.slice(0,14),[
  '2026-10', '2','2','0','0', '2',
  '0','0','0', '1','1', '2','0','0'
], 'Corrected KST->UTC pairing should remove false missing-IN and expose one intervening OUT');
assert.equal(cols[14],'1.00','Only unmatched synthetic event has nominal one-hour span');
console.log('PASS SEC-S11 real PG'+process.env.TEST_PG_MAJOR+
  ' synthetic UTC correction parity: missing_in=0,intervening_out=1,'+
  'nominal_nonpayable_hours=1.00; no live DB calls');
