import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20261010114500_hq_real_sales_store_attendance_scope.sql','utf8');
const html=fs.readFileSync('index.html','utf8');
const guards=fs.readFileSync('supabase/migrations/20261010122500_admin_rpc_store_hq_scope.sql','utf8');
assert.match(migration,/t\.is_demo IS FALSE/);
assert.doesNotMatch(migration,/\bfactor\b|\b0\.82\b/);
assert.match(migration,/GROUP BY s\.source_store_key HAVING count\(\*\)=1/);
assert.match(migration,/public\.can_manage_store\(p_store_id\)/);
assert.match(migration,/ev\.substitute_for_employee_id/);
assert.match(migration,/e\.store_id=p_store_id/g);
assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.admin_store_events/);
assert.match(html,/rpc\("admin_store_events",\{p_store_id:CURRENT_STORE_ID/);
assert.match(html,/rpc\("admin_store_events_with_corrections",\{p_store_id:CURRENT_STORE_ID/);
assert.match(html,/시연용 거래는 매출 집계에서 제외했습니다/);
assert.match(html,/rpc\\("admin_store_pending_requests",\\{p_store_id:CURRENT_STORE_ID/);
for(const name of ['admin_grant','admin_revoke','admin_list_auth_users','admin_list_admins']){
  const start=guards.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(start>=0,name+' function is missing');
  assert.match(guards.slice(start,start+1800),/public\\.is_hq_admin\\(\\)/,name+' must be HQ-only');
}
for(const name of ['admin_correct_event','admin_update_employee','admin_retire_employee','admin_deactivate_employee']){
  const start=guards.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
  assert.ok(start>=0,name+' function is missing');
  assert.match(guards.slice(start,start+1900),/public\\.can_manage_store\\(/,name+' must be store-scoped');
}
assert.match(guards,/EVENT_EMPLOYEE_MISMATCH/);
assert.match(html,/const APP_VERSION="v0\.191"/);
assert.match(html,/id="hqHome" aria-label="백억커피" style=/);
console.log('PASS: HQ dashboard shows attributable actual sales and store attendance remains scoped');
