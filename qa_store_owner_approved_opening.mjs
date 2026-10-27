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
assert.equal((block.match(/p_auto_open_after_accept:autoOpen/g)||[]).length,4);
const resend=block.slice(block.indexOf('if(body.resend_only===true){'),block.indexOf('\n      if(autoOpen){'));
assert.match(resend,/service_store_owner_invitation_resend_preflight/);
assert.doesNotMatch(resend,/service_store_owner_temp_issue|service_native_owner_invitation_issue|updateUserById|deleteUser/);
assert.match(resend,/RESEND_CANNOT_CHANGE_OPENING_APPROVAL/);
// Execute the actual Edge owner branch and its real delivery helper, with
// synthetic service RPC/Auth transports. Claim checks must precede any mail.
const deliveryHelper=edge.slice(edge.indexOf('// Read-only eligibility gate prevents mailing'),edge.indexOf('Deno.serve(async req=>{'));
async function pendingAccountCase(delivery,{blocked=false,changed=false}={}){
 const calls=[],uid='00000000-0000-4000-8000-000000000701';
 class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
 const gate={ok:true,store_id:701,existing_auth_user:true,user_id:uid,delivery};
 const context={HttpError,mode:'issue_store_owner_temporary_password',
  actor:{internal:false,adminRole:'HQ',userId:'00000000-0000-4000-8000-000000000001'},
  body:{store_id:701,email:'pending@qa.invalid',auto_open_after_accept:true},
  reply:x=>x,Deno:{env:{get:()=> 'true'}},
  client:{from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{name:'QA',onboarding_status:'STAGED',is_active:false},error:null})}),
   rpc:async(name,args)=>{calls.push({name,args});
    if(name==='service_store_owner_opening_preflight')return {data:{ok:true},error:null};
    if(name==='service_store_invitation_dispatch_preflight')return {data:gate,error:null};
    if(name==='service_native_owner_invitation_issue_for_opening')return blocked?{data:null,error:{message:'ACCOUNT_ALREADY_ASSIGNED'}}:{data:{ok:true,user_id:uid},error:null};
    throw Error('UNEXPECTED_RPC '+name);
   },auth:{admin:{inviteUserByEmail:async()=>{calls.push({name:'MAIL_INVITE'});return {data:{user:{id:changed?'wrong-id':uid}},error:null}}},
    resetPasswordForEmail:async()=>{calls.push({name:'MAIL_RECOVERY'});return {error:null}}}}
 };
 const run=vm.runInNewContext(deliveryHelper+'\n(async()=>{'+block+'})',context);
 if(blocked){await assert.rejects(run(),/NATIVE_OWNER_CLAIM_REJECTED/);assert.ok(!calls.some(x=>x.name.startsWith('MAIL_')));return;}
 if(changed){await assert.rejects(run(),/INVITE_AUTH_IDENTITY_CHANGED/);return;}
 const result=await run();assert.equal(result.user_id,uid);assert.equal(result.ok,true);
 const bound=calls.findIndex(x=>x.name==='service_native_owner_invitation_issue_for_opening');
 const mailed=calls.findIndex(x=>x.name==='MAIL_'+delivery);
 assert.ok(bound>=0&&mailed>bound,'bound, checked existing identity before mail');
 assert.equal(calls[bound].args.p_user_id,uid);assert.equal(calls[bound].args.p_auto_open_after_accept,true);
 assert.ok(!calls.some(x=>x.name==='service_store_owner_temp_existing_lookup'));
}
await pendingAccountCase('INVITE');await pendingAccountCase('RECOVERY');
await pendingAccountCase('INVITE',{blocked:true});await pendingAccountCase('INVITE',{changed:true});
console.log('PASS actual Edge canceled unconfirmed invite and confirmed passwordless recovery: same UID, claim before mail, blocked account sends nothing');

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
  {name:'existing-mail-password-login-atomic-ready',result:'PASS'},
  {name:'cancel-reinvite-same-uid-atomic-ready',result:'PASS'},
  {name:'confirmed-passwordless-recovery-atomic-ready',result:'PASS'}]);
 console.log('PASS same-run real SMTP/Auth/JWT/PostgREST approved new/existing/canceled/passwordless owner opening 4/4');
}
