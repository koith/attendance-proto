import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const sql=[
  '20261010235500_store_scoped_payroll_base.sql',
  '20261010235510_store_payroll_source_weekly_scope.sql',
  '20261010235520_store_scoped_payroll_close_reopen.sql',
  '20261010235530_store_payroll_admin_rpcs.sql'
].map(x=>fs.readFileSync('supabase/migrations/'+x,'utf8')).join('\n');
assert.match(html,/admin_store_payroll_period/);
assert.match(html,/admin_store_set_period_weeks/);
assert.match(html,/admin_store_snapshot/);
assert.match(html,/p_store_id:CURRENT_STORE_ID\|\|1/);
assert.doesNotMatch(html,/rpc\("admin_payroll_period"/);
assert.doesNotMatch(html,/rpc\("admin_snapshot"/);
assert.match(edge,/STORE_NOT_ONBOARDED/);
assert.match(edge,/STORE_SHEET_SYNC_NOT_CONFIGURED/);
assert.match(edge,/p_store_id:storeId,p_ym:ym,p_reason:reason/);
assert.match(edge,/\.eq\("id",storeId\)/);
assert.doesNotMatch(edge,/STORE_NOT_ENABLED/);
assert.match(sql,/PRIMARY KEY \(store_id,ym\)/);
assert.match(sql,/ON CONFLICT\(store_id,ym\)/);
assert.match(sql,/p_store_id\|\|':'\|\|p_ym/);
assert.match(sql,/p_store_id\|\|':'\|\|v_ym/);
assert.match(sql,/FROM public.payroll_snapshot WHERE store_id=p_store_id AND ym=p_ym/);
assert.match(sql,/FROM public.payroll_period WHERE store_id=p_store_id AND ym=p_ym/);
assert.match(sql,/public.can_manage_store\(p_store_id\)/);
assert.match(sql,/onboarding_status='READY'/);
assert.match(sql,/FROM public.payroll_snapshot s WHERE s.store_id=p_store_id AND s.ym=p_ym/);
console.log('PASS multi-store payroll period/snapshot/close/reopen/source isolation static QA');
