import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261011103500_confirmed_owner_activation_security.sql','utf8');
const ui=fs.readFileSync('hq_store_onboarding_ui.js','utf8');
const original=fs.readFileSync('supabase/migrations/20261011102000_store_provenance_review_and_activation.sql','utf8');
for(const sig of ['public.is_admin()','public.is_hq_admin()',
  'public.can_manage_store(p_store_id bigint)','public.hq_store_manager_revoke(p_user_id uuid)',
  'public.hq_stores_onboarding_list()','public.hq_store_onboarding_set(p_store_id bigint,p_status text)'])
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION '+sig),'Missing '+sig);
const parts=sql.split('CREATE OR REPLACE FUNCTION public.');
const critical=parts.filter(s=>/^(?:is_admin|is_hq_admin|can_manage_store|hq_stores_onboarding_list|hq_store_onboarding_set|hq_store_manager_revoke)\(/.test(s));
assert.equal(critical.length,6);
for(const s of critical){
  assert.match(s,/JOIN auth\.users u ON u\.id=a\.user_id/);
  assert.match(s,/u\.email_confirmed_at IS NOT NULL/);
  assert.match(s,/u\.deleted_at IS NULL/);
  assert.match(s,/NOT u\.is_anonymous/);
  assert.match(s,/u\.banned_until IS NULL OR u\.banned_until<now\(\)/);
}
assert.match(sql,/a\.user_id<>p_user_id/);
assert.match(sql,/CANNOT_REVOKE_LAST_READY_MANAGER/);
assert.match(sql,/CONFIRMED_STORE_MANAGER_REQUIRED/);
assert.match(sql,/v_review IS DISTINCT FROM 'VERIFIED'/);
assert.match(original,/PROVENANCE_VERIFICATION_REQUIRED/);
assert.match(ui,/Number\(store\?\.manager_count\|\|0\)>0/);
assert.match(ui,/이메일 확인 완료/);
assert.doesNotMatch(sql,/DELETE FROM public\.(?:employees|payroll_snapshot|attendance_events)/);
console.log('PASS confirmed active owner required for scoped access, activation, HQ permissions and safe revocation');
