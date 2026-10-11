import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261012075500_private_substitution_helpers.sql','utf8');
assert.match(sql,/REVOKE ALL ON FUNCTION public\.substitution_is_working\(bigint\)\s+FROM PUBLIC, anon, authenticated;/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.substitution_schedule_conflict\(\s*bigint, timestamp without time zone, timestamp without time zone\s*\) FROM PUBLIC, anon, authenticated;/);
assert.equal((sql.match(/REVOKE ALL ON FUNCTION /g)||[]).length,2,'Only the two internal helpers should change');
assert.doesNotMatch(sql,/GRANT\s+EXECUTE|ALTER TABLE|DELETE FROM|UPDATE\s+public\.|DROP\s+FUNCTION/i);
for(const file of ['substitution_v1.js','substitution_v2.js','recipe_access_v220.js','index.html']){
  const contents=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(contents,/rpc\(['"]substitution_is_working['"]/,
    file+' must never rely on direct helper EXECUTE');
  assert.doesNotMatch(contents,/rpc\(['"]substitution_schedule_conflict['"]/,
    file+' must never rely on direct helper EXECUTE');
}
const protectedStaff=fs.readFileSync('supabase/migrations/20261011145000_staff_recipe_ready_guard.sql','utf8');
assert.match(protectedStaff,/public\.substitution_is_working\(p_employee_id\)/,
  'PIN-verified staff recipe endpoint still calls the internal helper as owner');
console.log('PASS no unscoped direct access to substitution attendance/schedule helper RPCs');
