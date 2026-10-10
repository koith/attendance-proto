import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261011063000_store_owner_authorization_hardening.sql','utf8');
const section=(name,next)=>{
  const begin=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name);
  assert.ok(begin>=0,'Missing '+name);
  const end=next?sql.indexOf('CREATE OR REPLACE FUNCTION public.'+next,begin+1):sql.indexOf('REVOKE ALL ON FUNCTION',begin+1);
  assert.ok(end>begin,'Missing function boundary '+name);
  return sql.slice(begin,end);
};
const manage=section('can_manage_store','hq_assign_store_manager');
assert.match(manage,/a\.admin_role='STORE_MANAGER' AND a\.store_id=p_store_id/);
assert.match(manage,/s\.is_active/);
assert.match(manage,/s\.onboarding_status='READY'/);
assert.doesNotMatch(manage,/store_admin_memberships/,'Legacy membership must never authorize access');
const assign=section('hq_assign_store_manager','hq_store_manager_revoke');
assert.match(assign,/RETURN public\.hq_store_manager_assign\(p_email,p_store_id\)/);
assert.doesNotMatch(assign,/INSERT INTO public\.store_admin_memberships/);
const revoke=section('hq_store_manager_revoke','hq_store_onboarding_set');
assert.match(revoke,/CANNOT_REVOKE_LAST_READY_MANAGER/);
assert.match(revoke,/DELETE FROM public\.store_admin_memberships WHERE user_id=p_user_id/);
assert.match(revoke,/DELETE FROM public\.admin_users/);
assert.ok(revoke.indexOf('DELETE FROM public.store_admin_memberships')<revoke.indexOf('DELETE FROM public.admin_users'));
const onboarding=section('hq_store_onboarding_set','hq_store_activate');
assert.match(onboarding,/p_store_id=1 AND p_status<>'READY'/);
assert.match(onboarding,/p_status='READY' AND p_store_id<>1/);
assert.match(onboarding,/DEMO_SOURCE_REQUIRES_REVIEW/);
assert.match(onboarding,/DEMO_EMPLOYEES_REQUIRE_REVIEW/);
assert.match(onboarding,/STORE_MANAGER_REQUIRED/);
assert.match(onboarding,/FROM public\.admin_users/);
const activate=section('hq_store_activate','hq_store_catalog');
assert.match(activate,/onboarding_status='STAGED'/);
assert.match(activate,/RETURN public\.hq_store_onboarding_set\(p_store_id,'READY'\)/);
assert.doesNotMatch(activate,/UPDATE public\.stores/,'Legacy activation must delegate to gated API');
const catalog=section('hq_store_catalog',null);
assert.match(catalog,/FROM public\.admin_users a/);
assert.doesNotMatch(catalog,/store_admin_memberships/);
for(const name of ['can_manage_store(bigint)','hq_assign_store_manager(bigint,text)',
'hq_store_manager_revoke(uuid)','hq_store_onboarding_set(bigint,text)',
'hq_store_activate(bigint)','hq_store_catalog()']){
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name+' FROM PUBLIC,anon;'));
}
assert.doesNotMatch(sql,/DELETE FROM public\.(employees|attendance_events|payroll_snapshot)\b/i);
console.log('PASS owner revoke invalidates legacy membership; READY-only manager scope; demo activation paths unified');
