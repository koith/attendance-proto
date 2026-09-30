import fs from 'node:fs';
import assert from 'node:assert/strict';
const idx=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20260930002601_revoke_anon_admin_rpc_v084.sql','utf8');
assert(idx.includes('APP_VERSION="v0.84"'));
for(const fn of ['admin_inventory_overview_v2()','admin_payroll_substitutions(bigint,text)']){
  assert(sql.includes('revoke execute on function public.'+fn+' from public, anon;'));
  assert(sql.includes('grant execute on function public.'+fn+' to authenticated, service_role;'));
}
console.log('v0.84 security audit QA PASS');
