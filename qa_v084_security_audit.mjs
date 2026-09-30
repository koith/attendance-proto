import fs from 'node:fs';
import assert from 'node:assert/strict';
const idx=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20260930002601_revoke_anon_admin_rpc_v084.sql','utf8');
const vm=idx.match(/APP_VERSION="v0\.(\d+)"/); assert(vm&&Number(vm[1])>=84);
for(const fn of ['admin_inventory_overview_v2()','admin_payroll_substitutions(bigint,text)']){
  assert(sql.includes('revoke execute on function public.'+fn+' from public, anon;'));
  assert(sql.includes('grant execute on function public.'+fn+' to authenticated, service_role;'));
}
for(const rule of [
  '.employee-list-mask{height:auto!important;max-height:none!important;min-height:0!important;overflow-y:visible!important',
  '.payroll-employee-grid{height:auto!important;min-height:0!important;max-height:none!important;overflow-y:visible!important'
]) assert(idx.includes(rule));
console.log('v0.84 security + expanding employee list regression QA PASS');
