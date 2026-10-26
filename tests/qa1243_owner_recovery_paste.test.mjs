// QA1243 copied recovery URL: no production HTTP and no one-use GET verification.
// The code runs in an isolated synthetic browser-like VM.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../owner_activation.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../owner_activation.html',import.meta.url),'utf8');
const origin='https://qa-auth.invalid';
const config='const CONFIG = { SUPABASE_URL: "'+origin+'", SUPABASE_ANON_KEY: "synthetic-anon" };';

async function scenario({link,verifyOk=true}={}){
 const calls=[],writes=new Map();
 const ids=['status','activateForm','recoveryResendForm','recoveryEmail',
   'resendRecovery','recoveryPastedLinkForm','recoveryPastedLink',
   'verifyPastedLink'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{
  id,value:'',textContent:'',hidden:false,disabled:false,listeners:{},
  addEventListener(type,fn){this.listeners[type]=fn;}
 }]));
 const location={hash:'#error=access_denied',search:'',pathname:'/owner_activation.html',
  replaced:null,replace(url){this.replaced=url;}};
 const fetch=async(url,options={})=>{
  calls.push({url:String(url),method:options.method||'GET',body:options.body});
  if(url==='./index.html')return {ok:true,text:async()=>config};
  if(url===origin+'/auth/v1/verify'){
   return verifyOk?{ok:true,json:async()=>({
    access_token:'synthetic-access',refresh_token:'synthetic-refresh',
    user:{id:'synthetic-user-id',email:'recipient@example.test'}
   })}:{ok:false,json:async()=>({code:'otp_expired'})};
  }
  throw Error('UNEXPECTED_EXTERNAL_REQUEST');
 };
 vm.runInNewContext(script,{
  document:{getElementById:id=>nodes[id]},
  location,history:{replaceState(){}},fetch,
  URL,URLSearchParams,sessionStorage:{
   setItem:(k,v)=>writes.set(k,v),getItem:k=>writes.get(k)||null
  },
  Date,encodeURIComponent,console
 },{filename:'owner_activation.js'});
 assert.match(html,/id="recoveryPastedLinkForm"/);
 assert.match(html,/id="recoveryPastedLink"/);
 assert.match(html,/id="verifyPastedLink"/);
 assert.equal(nodes.activateForm.hidden,true);
 assert.equal(nodes.recoveryPastedLinkForm.hidden,false);
 nodes.recoveryPastedLink.value=link;
 await nodes.recoveryPastedLinkForm.listeners.submit({preventDefault(){}});
 return {calls,writes,nodes,location};
}

test('copied latest Supabase recovery link is redeemed by POST only',async()=>{
 const link=origin+'/auth/v1/verify?token=synthetic-onetime-hash&type=recovery&redirect_to=https%3A%2F%2Fexample.test';
 const state=await scenario({link});
 assert.deepEqual(state.calls.map(x=>[x.url,x.method]),[
  ['./index.html','GET'],[origin+'/auth/v1/verify','POST']]);
 assert.deepEqual(JSON.parse(state.calls[1].body),{
  type:'recovery',token_hash:'synthetic-onetime-hash'
 });
 assert.equal(state.nodes.recoveryPastedLink.value,'');
 assert.equal(state.location.replaced,'./owner_temp_activation.html');
 const saved=JSON.parse(state.writes.get('baekeok_owner_activation_pending_v1'));
 assert.equal(saved.version,1);
 assert.equal(saved.session.access_token,'synthetic-access');
 assert.equal(saved.session.refresh_token,'synthetic-refresh');
 assert.equal(saved.owner,null);
 assert.ok(saved.deadline>Date.now());
});

test('foreign hostname rejected without sending recovery token anywhere',async()=>{
 const state=await scenario({link:'https://phishing.invalid/auth/v1/verify?token=secret-value&type=recovery'});
 assert.deepEqual(state.calls.map(x=>x.url),['./index.html']);
 assert.equal(state.location.replaced,null);
 assert.equal(state.writes.size,0);
 assert.doesNotMatch(state.nodes.status.textContent,/secret-value/);
});

test('wrong Auth endpoint or OTP type rejected before verification',async()=>{
 for(const link of [
  origin+'/auth/v1/admin/users?token=synthetic&type=recovery',
  origin+'/auth/v1/verify?token=synthetic&type=invite'
 ]){
  const state=await scenario({link});
  assert.deepEqual(state.calls.map(x=>x.url),['./index.html']);
  assert.equal(state.location.replaced,null);
  assert.equal(state.writes.size,0);
 }
});

test('expired/reused token fails closed without sending another email',async()=>{
 const state=await scenario({
  link:origin+'/auth/v1/verify?token=synthetic-old-token&type=recovery',
  verifyOk:false
 });
 assert.deepEqual(state.calls.map(x=>x.url),['./index.html',origin+'/auth/v1/verify']);
 assert.equal(state.location.replaced,null);
 assert.equal(state.writes.size,0);
 assert.match(state.nodes.status.textContent,/인증 실패/);
 assert.equal(state.nodes.verifyPastedLink.disabled,false);
});
