// #1243: Execute real Edge delivery dispatch helper against isolated Auth/RPC
// fixtures, without network, secrets, or production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const mirror=fs.readFileSync('edge-release/supabase/functions/server-sync-sheet/index.ts','utf8');
assert.equal(main,mirror,'native and canonical Edge source must be byte-identical');
const start=main.indexOf('// Read-only eligibility gate prevents mailing');
const end=main.indexOf('Deno.serve(async req=>{',start);
assert.ok(start>0&&end>start,'real Edge dispatch helper must exist');
const helper=main.slice(start,end);
const calls=[];
let delivery='INVITE',userId=null,forced=null;
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const rpc=async(name,args)=>{
 calls.push({op:'preflight',name,args});
 if(forced==='DENY')return {data:null,error:{message:'ACCOUNT_ALREADY_ASSIGNED'}};
 return {data:{ok:true,delivery,user_id:userId},error:null};
};
const ctx={
 client:{
  rpc,
  auth:{
   admin:{inviteUserByEmail:async email=>{
     calls.push({op:'invite',email});
     if(forced==='INVITE_FAIL')return {data:null,error:{message:'SMTP_FAIL'}};
     return {data:{user:{id:forced==='CHANGED'?'other-id':userId||'new-synthetic-id'}},error:null};
   }},
   resetPasswordForEmail:async(email,opts)=>{
    calls.push({op:'recover',email,opts});
    return {error:forced==='RECOVERY_FAIL'?{message:'SEND_FAILED'}:null};
   }
  }
 },
 HttpError
};
const fn=vm.runInNewContext(helper+'\ndispatchInvitation',ctx);
const run=()=>fn('case@synthetic.invalid',701,'actor-qa','HQ_OWNER');
let x=await run();
assert.equal(x.userId,'new-synthetic-id');
assert.equal(x.delivery,'INVITE');
assert.deepEqual(calls.map(c=>c.op),['preflight','invite']);
assert.equal(calls[0].args.p_actor_id,'actor-qa');
assert.equal(calls[0].args.p_mode,'HQ_OWNER');
assert.ok(calls[1].email.endsWith('.invalid'));
calls.length=0;delivery='RECOVERY';userId='old-synthetic-id';
x=await run();
assert.equal(x.userId,'old-synthetic-id');
assert.equal(x.delivery,'RECOVERY');
assert.deepEqual(calls.map(c=>c.op),['preflight','recover']);
assert.match(calls[1].opts.redirectTo,/owner_activation.html$/);
for(const [kind,expected] of [['DENY','INVITE_PRECHECK_FAILED'],['RECOVERY_FAIL','INVITE_RECOVERY_DELIVERY_FAILED']]){
 calls.length=0;forced=kind;
 await assert.rejects(run(),e=>e instanceof HttpError&&e.status===409&&e.message.includes(expected));
 assert.equal(calls.some(c=>c.op==='invite'),false,'denied/recovery cannot issue a new invite');
}
calls.length=0;forced='CHANGED';delivery='INVITE';
await assert.rejects(run(),e=>e.message==='INVITE_AUTH_IDENTITY_CHANGED');
assert.deepEqual(calls.map(c=>c.op),['preflight','invite']);
calls.length=0;forced='INVITE_FAIL';
await assert.rejects(run(),e=>e.message.includes('INVITE_FAILED'));
forced=null;
assert.ok(main.includes('p_user_id:sent.userId'),'attached user must match verified delivery result');
assert.ok(main.includes('isAssistant?"HQ_ASSISTANT":"HQ_OWNER"'),'HQ roles must have separate server gates');
assert.ok(main.includes('actor.userId,"STORE_ASSISTANT"'),'delegated manager cannot bypass owner gate');
console.log('PASS #1243 Edge invitation dispatch: checked mail, confirmed passwordless recovery, unauthorized, mismatch, SMTP errors, mirror');
