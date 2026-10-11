import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise actual standalone substitution branch selection in a sandbox.
// All employees, IDs and tabs below are synthetic; no live attendance writes.
const migration=fs.readFileSync('supabase/migrations/20261012074500_scope_legacy_substitution_roster.sql','utf8');
assert.match(migration,/CREATE OR REPLACE FUNCTION public\.list_active_employees\(\)/);
assert.match(migration,/public\.can_manage_store\(e\.store_id\)/,
  'Legacy authenticated employee list must obey HQ/READY-manager scope');
assert.match(migration,/SECURITY DEFINER/);
assert.equal((migration.match(/\$function\$;/g)||[]).length,1);
assert.doesNotMatch(migration,/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE\s+public\.employees/i);

for(const page of ['substitution_v1.js','substitution_v2.js']){
  const source=fs.readFileSync(page,'utf8');
  assert.doesNotMatch(source,/rpc\('list_active_employees'/,
    page+' must never call cross-store authenticated roster from anon client');
  assert.ok(source.includes("rpc('list_employees_state',{p_store_id:SUB_STORE_ID})"),
    page+' must request only the selected READY-store roster');
  assert.ok(source.includes("if(!SUB_STORE_ID)throw Error('INVALID_STORE')"),
    page+' must reject invalid/malicious store selectors');
  const first=source.indexOf('const SUB_STORE_ID=');
  const end=source.indexOf('async function init(){',first);
  assert.ok(first>0 && end>first,page+' must define selector before loading employees');
  const program=source.slice(first,end)+'\nSUB_STORE_ID;';
  for(const [search,expected] of [
    ['',1],['?store=1',1],['?store=283',283],['?store=2',2],
    ['?store=0',null],['?store=-1',null],['?store=abc',null],
    ['?store=1%20OR%201%3D1',null],['?store=0002',null],['?store=10000000000',null]
  ]){
    const result=vm.runInNewContext(program,{location:{search},URLSearchParams});
    assert.equal(result,expected,page+' unsafe store selector '+search);
  }
}
const html=fs.readFileSync('substitution.html','utf8');
const app=fs.readFileSync('index.html','utf8');
assert.match(html,/substitution_v2\.js\?v=20261012v236/);
assert.match(app,/const APP_VERSION="v0\.236"/);
assert.match(fs.readFileSync('substitution_v2.js','utf8'),
  /back\.href='index\.html\?mode=store&store='\+SUB_STORE_ID\+'#pos'/,
  'Return to the exact READY store when the standalone page closes');
console.log('PASS scoped substitution roster for 283 store selectors, legacy auth isolation, no data writes');
