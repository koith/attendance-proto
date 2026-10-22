import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261011130000_hq_sample_roster_activation_guard.sql','utf8');
const older=fs.readFileSync('supabase/migrations/20261011103500_confirmed_owner_activation_security.sql','utf8');
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.hq_store_onboarding_set\(/);
const gate=sql.split('CREATE OR REPLACE FUNCTION public.hq_store_sample_roster_counts()')[0];
assert.match(gate,/v_review IS DISTINCT FROM 'VERIFIED'/);
assert.match(gate,/u\.email_confirmed_at IS NOT NULL/);
assert.match(gate,/CONFIRMED_STORE_MANAGER_REQUIRED/);
assert.match(gate,/INHA_PRODUCTION_LOCK/);
assert.match(gate,/e\.store_id=p_store_id/);
assert.match(gate,/coalesce\(e\.memo,''\) ILIKE '%데모%'/);
assert.match(gate,/coalesce\(e\.memo,''\) ILIKE '%샘플%'/);
assert.match(gate,/e\.name ILIKE '%테스트%'/);
assert.match(gate,/DEMO_EMPLOYEES_REQUIRE_REVIEW/);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.hq_store_sample_roster_counts\(\)/);
assert.match(sql,/IF NOT public\.is_hq_admin\(\) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.hq_store_sample_roster_counts\(\) FROM PUBLIC,anon/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.hq_store_sample_roster_counts\(\) TO authenticated/);
assert.match(older,/PROVENANCE_VERIFICATION_REQUIRED/);
const statements=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
assert.doesNotMatch(statements,/\b(?:DELETE|TRUNCATE)\s+(?:FROM\s+)?public\.(?:stores|employees)/i);
assert.doesNotMatch(statements,/UPDATE public\.employees/i);
assert.equal((statements.match(/UPDATE public\.stores SET onboarding_status=p_status/g)||[]).length,1,
  'Existing HQ activation status transition must be the only store update');
const ui=fs.readFileSync('hq_store_onboarding_ui.js','utf8');
assert.match(ui,/rpc\("hq_store_sample_roster_counts"\)/);
assert.match(ui,/!result\.every\(Array\.isArray\)/,'All HQ RPC lists must be validated, including sample roster');
assert.match(ui,/activationBlockers\(store,proof,sampleEmployeeCount,primaryOwnerId,list\)\.length===0/);
assert.match(ui,/errors\.push\("샘플·데모 직원 검토"\)/);
assert.match(ui,/id="hqSampleRosterBlocker"/);
assert.match(ui,/id="hqSampleRosterSummary"/);
const predicate=ui.match(/const canActivate=([^;]+);/)?.[1];
assert.ok(predicate,'Activation readiness expression missing');
// Execute the shipped blocker helper, not a reimplementation of the old
// manager_count-only expression. Staged owner, sample roster, and other store
// membership are independent barriers.
const blockerStart=ui.indexOf('const activationBlockers=');
const blockerEnd=ui.indexOf('const readinessCsvCell=',blockerStart);
assert.ok(blockerStart>=0&&blockerEnd>blockerStart,'Shipped READY blocker helper missing');
const helper=ui.slice(blockerStart,blockerEnd);
const {runInNewContext}=await import('node:vm');
const canActivate=(selected,verified,manager_count,sampleEmployeeCount,primaryOwnerId,memberStore=2)=>{
  const store={id:selected,manager_count};
  const proof={decision:verified?'VERIFIED':'REJECTED'};
  const list=primaryOwnerId?[{store_id:memberStore,user_id:primaryOwnerId}]:[];
  return runInNewContext(helper+';('+predicate+')',
    {selected,store,proof,sampleEmployeeCount,primaryOwnerId,list});
};
assert.equal(canActivate(2,true,1,3,'owner-2'),false,'Seed staff must block even confirmed owner');
assert.equal(canActivate(2,true,1,0,'owner-2'),true,'Verified clean roster and linked primary owner permits READY');
assert.equal(canActivate(2,false,1,0,'owner-2'),false,'Unverified shop cannot activate');
assert.equal(canActivate(2,true,0,0,'owner-2'),false,'Zero confirmed managers cannot activate');
assert.equal(canActivate(2,true,1,0,null),false,'Unassigned primary owner cannot activate despite generic manager');
assert.equal(canActivate(2,true,1,0,'owner-2',3),false,'Other-store owner cannot activate');
assert.equal(canActivate(1,true,0,0,null),true,'Inha existing ready state remains unchanged');
console.log('PASS seeded sample+demo employees block READY activation; HQ-only aggregate, no deletion, Inha unchanged');
