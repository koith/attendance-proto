import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const edge=readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const start=edge.indexOf('    if(mode==="issue_store_owner_temporary_password"){');
const end=edge.indexOf('\n    if(mode===',start+20);
const block=edge.slice(start,end);
assert.ok(block.indexOf('actor.adminRole!=="HQ"')>=0);
assert.ok(block.indexOf('service_store_owner_opening_preflight')>=0);
assert.ok(block.indexOf('actor.adminRole!=="HQ"')<block.indexOf('service_store_owner_opening_preflight'));
assert.ok(block.indexOf('service_store_owner_opening_preflight')<block.indexOf('service_store_owner_temp_existing_lookup'));
assert.equal((block.match(/p_auto_open_after_accept:autoOpen/g)||[]).length,3);
const resend=block.slice(block.indexOf('if(body.resend_only===true){'),block.indexOf('\n      if(autoOpen){'));
assert.match(resend,/service_store_owner_invitation_resend_preflight/);
assert.doesNotMatch(resend,/service_store_owner_temp_issue|service_native_owner_invitation_issue|updateUserById|deleteUser/);
assert.match(resend,/RESEND_CANNOT_CHANGE_OPENING_APPROVAL/);
for(const file of ['hq_owner_console.js','hq_store_onboarding_ui.js']){
 const s=readFileSync(file,'utf8');
 const first=s.indexOf('async function invite('),last=s.indexOf('\n}',first)+2;
 const source=s.slice(first,last);
 assert.match(source,/"issue_store_owner_temporary_password"/);
 const invoke=async(role='OWNER',resendOnly=false)=>{
  let sent;
  const context={CONFIG:{SUPABASE_URL:'https://fixture.invalid'},Auth:{token:'fixture-token'},
   fetch:async(_u,o)=>{sent=JSON.parse(o.body);return {ok:true,json:async()=>({ok:true,delivery:'AUTH_INVITE_ACCEPTED'})}}};
  const fn=vm.runInNewContext(source+'\ninvite;',context);
  await fn('recipient@qa.invalid',701,role,resendOnly);
  return sent;
 };
 const owner=await invoke();
 assert.equal(owner.mode,'issue_store_owner_temporary_password');
 assert.equal(owner.auto_open_after_accept,true);assert.equal(owner.resend_only,false);
 const retry=await invoke('OWNER',true);
 assert.equal(retry.auto_open_after_accept,false);assert.equal(retry.resend_only,true);
 const assistant=await invoke('ASSISTANT');
 assert.equal(assistant.mode,'invite_store_assistant_by_hq');
 assert.equal(assistant.auto_open_after_accept,false);assert.equal(assistant.resend_only,false);
}
const migration=readFileSync('supabase/migrations/20261027070217_approved_owner_auto_opening.sql','utf8');
assert.equal((migration.match(/ADD COLUMN IF NOT EXISTS auto_open_after_accept boolean NOT NULL DEFAULT false/g)||[]).length,2);
assert.doesNotMatch(migration,/UPDATE public\.(?:store_owner_temp_first_logins|store_primary_owner_invitation_intents) SET auto_open_after_accept=true\s*;/);
assert.match(migration,/REVOKE ALL ON FUNCTION private\.finish_approved_owner_opening/);
assert.match(migration,/auth\.uid\(\) IS DISTINCT FROM p_owner_id/);
assert.match(migration,/PERSONAL_PASSWORD_NOT_VERIFIED/);
console.log('PASS actual HQ invite bodies: explicit approval, existing-user recovery, resend preserves intent, assistants never open stores; SQL contract remains recipient-bound');

if(process.argv.includes('--real-proof')){
 const proof=JSON.parse(readFileSync('qa-results/auth-role-journey-1243.json','utf8'));
 assert.equal(proof.commit,process.env.GITHUB_SHA);
 assert.equal(proof.scope,'ISOLATED_REAL_AUTH_SMTP_POSTGREST');
 assert.equal(proof.hostedAuthTested,false);assert.equal(proof.googleE2ERepeated,false);
 assert.deepEqual(proof.approvedOwnerOpening,[
  {name:'native-mail-password-login-atomic-ready',result:'PASS'},
  {name:'existing-mail-password-login-atomic-ready',result:'PASS'}]);
 console.log('PASS same-run real SMTP/Auth/JWT/PostgREST approved native and existing owner opening 2/2');
}
