// QA1243 ordinary one-click recovery: synthetic test; NEVER call production Auth.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../owner_activation.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../owner_activation.html',import.meta.url),'utf8');
const mail=readFileSync(new URL('../supabase/email-templates/recovery.html',import.meta.url),'utf8');
const url='https://waluhdgqhwjjwmflhrle.supabase.co';
const hash='a'.repeat(64);
const publicCfg='SUPABASE_URL: "'+url+'", SUPABASE_ANON_KEY: "test-public-anon"';

function browser({token=hash,verifyStatus=200,invalidConfig=false}={}){
 const requests=[],writes=new Map();
 const status={textContent:''},form={hidden:false};
 const location={hash:'#type=recovery&token_hash='+token,pathname:'/owner_activation.html',replaced:null,
  replace(v){this.replaced=v}};
 const history={replaceState(...args){if(args.length!==3)throw Error('HISTORY_REPLACE_INVALID');}};
 const document={getElementById:id=>({status,activateForm:form})[id]};
 const fetch=async(u,opt={})=>{
  requests.push({url:u,method:opt.method||'GET',body:opt.body});
  if(u==='./index.html')return {ok:true,text:async()=>invalidConfig?'SUPABASE_URL: "https://foreign.invalid"':publicCfg};
  if(u===url+'/auth/v1/verify')
   return {ok:verifyStatus===200,json:async()=>verifyStatus===200?{
    access_token:'synthetic-access',refresh_token:'synthetic-refresh',
    user:{id:'synthetic-user-id',email:'owner@example.test'}
   }:{code:'otp_expired'}};
  throw Error('UNEXPECTED_HTTP_TARGET');
 };
 const sessionStorage={setItem(k,v){writes.set(k,v)},getItem(k){return writes.get(k)||null}};
 const context={document,location,history,sessionStorage,fetch,URLSearchParams,Date,console};
 // IIFE returns an async promise. Node VM returns the final expression result.
 const done=vm.runInNewContext(js,context,{filename:'owner_activation.js'});
 return {done,location,form,status,requests,writes};
}

test('single email click renders user-owned static callback, not Supabase GET',()=>{
 assert.match(mail,/href="https:\/\/koith\.github\.io\/attendance-proto\/owner_activation\.html#type=recovery&amp;token_hash=\{\{ \.TokenHash \}\}"/);
 assert.doesNotMatch(mail,/\.ConfirmationURL/);
 assert.doesNotMatch(mail,/href="https:\/\/waluhdgqhwjjwmflhrle\.supabase\.co\/auth\/v1\/verify/);
 assert.match(html,/owner_activation\.js\?v=20261027oneclick1/);
 assert.doesNotMatch(html,/recoveryPastedLinkForm|복사한 인증 링크/);
});

test('one click redeems OTP via POST and enters existing first-login page',async()=>{
 const b=browser();
 await b.done;
 assert.equal(b.form.hidden,true);
 assert.equal(b.location.replaced,'./owner_temp_activation.html');
 assert.equal(b.requests.length,2);
 assert.equal(b.requests[0].url,'./index.html');
 assert.equal(b.requests[1].url,url+'/auth/v1/verify');
 assert.equal(b.requests[1].method,'POST');
 assert.deepEqual(JSON.parse(b.requests[1].body),{type:'recovery',token_hash:hash});
 assert.ok(b.writes.has('baekeok_owner_activation_pending_v1'));
 const saved=JSON.parse(b.writes.get('baekeok_owner_activation_pending_v1'));
 assert.equal(saved.version,1);
 assert.equal(saved.owner,null);
 assert.equal(saved.session.access_token,'synthetic-access');
 assert.ok(saved.deadline>Date.now());
});

test('invalid token fails closed without network verification or any resend',async()=>{
 const b=browser({token:'INVALID'});
 await b.done;
 assert.equal(b.requests.length,0);
 assert.equal(b.writes.size,0);
 assert.equal(b.location.replaced,null);
 assert.match(b.status.textContent,/인증에 실패/);
});

test('invalid/reused token fails closed; no new recovery email',async()=>{
 const b=browser({verifyStatus:403});
 await b.done;
 assert.deepEqual(b.requests.map(x=>x.method),['GET','POST']);
 assert.equal(b.location.replaced,null);
 assert.equal(b.writes.size,0);
 assert.ok(!b.requests.some(x=>x.url.includes('/recover')));
});

test('unexpected Auth origin is rejected before OTP redemption',async()=>{
 const b=browser({invalidConfig:true});
 await b.done;
 assert.equal(b.requests.length,1);
 assert.equal(b.writes.size,0);
 assert.equal(b.location.replaced,null);
});
