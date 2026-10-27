import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
const root=process.env.QA_HQ_SOURCE_ROOT||'.';
function arrow(source,id){
 const start=source.indexOf(`body.querySelector("#${id}").onclick=()=>{`);
 assert.ok(start>=0,'actual click handler missing: '+id);
 const fn=start+source.slice(start).indexOf('()=>{');
 let depth=0;
 for(let i=fn+4;i<source.length;i++){
  if(source[i]==='{')depth++;
  if(source[i]==='}'&&--depth===0)return source.slice(fn,i+1);
 }
 throw Error('unclosed actual handler');
}
async function click(file,{role='OWNER',confirmed=true,failure=false}={}){
 const source=readFileSync(resolve(root,file),'utf8');
 const consolePanel=file==='hq_owner_console.js';
 const primary=consolePanel?'hqOwnerInvite':'hqManagerInvite';
 const legacy=consolePanel?'hqOwnerConnectExisting':'hqManagerAssign';
 const roleId=consolePanel?'hqInviteRole':'hqManagerRole';
 const emailId=consolePanel?'hqOwnerEmail':'hqManagerEmail';
 const elements={
  [roleId]:{value:role},[emailId]:{value:'former-owner@qa.invalid',checkValidity:()=>true},
  [primary]:{},[legacy]:{}
 };
 const requests=[],jobs=[],confirmations=[];
 const account={user_id:'former-owner',email:'former-owner@qa.invalid'};
 const context={CONFIG:{SUPABASE_URL:'https://fixture.invalid'},Auth:{token:'synthetic-hq'},
  body:{querySelector:selector=>elements[selector.slice(1)]},selected:80,
  store:{id:80,name:'Synthetic 1호점',onboarding_status:role==='OWNER'?'STAGED':'READY',is_active:role!=='OWNER'},
  current:role==='OWNER'?null:'primary',waiting:false,primaryOwnerId:role==='OWNER'?null:'primary',pendingOwnerId:null,
  accounts:[account],managers:[],isHqAccount:()=>false,email:()=>elements[emailId].value,
  confirm:message=>{confirmations.push(message);return confirmed},
  alert:message=>{throw Error(message)},err:message=>{throw Error(message)},
  run:fn=>jobs.push(Promise.resolve().then(fn)),act:fn=>jobs.push(Promise.resolve().then(fn)),
  fetch:async(url,options)=>{
   assert.ok(url.startsWith('https://fixture.invalid/'),'no real HTTP transport');
   const body=JSON.parse(options.body);requests.push({url,body});
   return {ok:!failure,status:failure?503:200,json:async()=>failure?{error:'QA_TRANSPORT_FAILURE'}:
    url.includes('/functions/')?{ok:true,delivery:'AUTH_RECOVERY_ACCEPTED'}:
    {ok:true,store_id:80,intended_role:role}};
  }};
 vm.createContext(context);
 const start=source.indexOf('async function invite('),end=source.indexOf('\n}',start)+2;
 const rpcStart=source.indexOf('async function rpc('),rpcEnd=source.indexOf('\n}',rpcStart)+2;
 vm.runInContext(source.slice(rpcStart,rpcEnd)+'\n'+source.slice(start,end),context);
 // Execute both real event handlers. A legacy OWNER click delegates to the
 // real primary handler, including its confirmation and request builder.
 for(const id of [primary,legacy]){
  const fn=vm.runInContext('('+arrow(source,id)+')',context);
  elements[id].onclick=fn;elements[id].click=fn;
 }
 elements[legacy].click();
 if(failure)await assert.rejects(Promise.all(jobs),/QA_TRANSPORT_FAILURE/);
 else await Promise.all(jobs);
 return {requests,confirmations};
}
for(const file of ['hq_owner_console.js','hq_store_onboarding_ui.js']){
 test(file+': former representative uses mail and explicit opening approval',async()=>{
  const {requests,confirmations}=await click(file);
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/functions\/v1\/server-sync-sheet$/);
  assert.deepEqual(requests[0].body,{mode:'issue_store_owner_temporary_password',email:'former-owner@qa.invalid',store_id:80,auto_open_after_accept:true,resend_only:false});
  assert.match(confirmations[0],/개통/);
 });
 test(file+': cancelled confirmation sends nothing',async()=>{
  assert.equal((await click(file,{confirmed:false})).requests.length,0);
 });
 test(file+': transport failure never falls back to direct owner assignment',async()=>{
  const {requests}=await click(file,{failure:true});
  assert.equal(requests.length,1);assert.match(requests[0].url,/functions\//);
 });
 test(file+': existing assistant retains explicitly limited mail-free connection',async()=>{
  const {requests}=await click(file,{role:'ASSISTANT'});
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/rpc\/hq_store_existing_verified_account_connect$/);
  assert.equal(requests[0].body.p_intended_role,'ASSISTANT');
 });
}
