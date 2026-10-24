import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';
import {verifyHook,planMessages,validGasUrl,signedBridgeEnvelope} from '../supabase/functions/qa1243-google-mail-bridge/core.mjs';
import {INVITE_HTML} from '../supabase/functions/qa1243-google-mail-bridge/invite_template.mjs';

const ROOT='https://koith.github.io/attendance-proto/';
const ACTIVATION=ROOT+'owner_activation.html';
const stamp=1792800000;
const hookSecret='v1,whsec_'+Buffer.alloc(32,13).toString('base64');
const bridgeSecret='qa1243-unit-test-bridge-shared-secret-45';
const hash='a'.repeat(64);
const invite={user:{email:'owner@example.org'},email_data:{email_action_type:'invite',token_hash:hash,redirect_to:ACTIVATION}};
function hookHeaders(raw,{seconds=stamp,secret=hookSecret,id='evt_123'}={}){
  const key=Buffer.from(secret.slice('v1,whsec_'.length),'base64');
  const sig=createHmac('sha256',key).update(`${id}.${seconds}.${raw}`).digest('base64');
  return new Headers({'webhook-id':id,'webhook-timestamp':String(seconds),'webhook-signature':'v1,'+sig});
}

test('existing invite HTML exact byte pin', async()=>{
 const original=await readFile(new URL('../supabase/email-templates/invite.html',import.meta.url),'utf8');
 assert.equal(INVITE_HTML,original);
 assert.equal((original.match(/\{\{ \.ConfirmationURL \}\}/g)||[]).length,1);
 assert.match(original,/백억커피/);
});
test('signed Supabase webhook verified, payload remains confidential',async()=>{
  const raw=JSON.stringify(invite); const r=await verifyHook(raw,hookHeaders(raw),hookSecret,stamp*1000);
  assert.equal(r.id,'evt_123');assert.deepEqual(r.event,invite);
});
test('reject unsigned, tampered or expired payloads',async()=>{
 const raw=JSON.stringify(invite);
 await assert.rejects(verifyHook(raw,new Headers(),hookSecret,stamp*1000),/HOOK_HEADERS_INVALID/);
 await assert.rejects(verifyHook(raw.replace('owner','attacker'),hookHeaders(raw),hookSecret,stamp*1000),/HOOK_SIGNATURE_INVALID/);
 await assert.rejects(verifyHook(raw,hookHeaders(raw),hookSecret,(stamp+301)*1000),/HOOK_TIMESTAMP_EXPIRED/);
 await assert.rejects(verifyHook(raw,hookHeaders(raw),hookSecret+'oops',stamp*1000),/HOOK_SECRET_INVALID/);
});
test('reject bad redirect, untrusted action and malformed token',()=>{
 assert.throws(()=>planMessages({...invite,email_data:{...invite.email_data,redirect_to:'https://evil.example/'}},INVITE_HTML),/REDIRECT_NOT_ALLOWLISTED/);
 assert.throws(()=>planMessages({...invite,email_data:{...invite.email_data,email_action_type:'reauthentication'}},INVITE_HTML),/EMAIL_ACTION_UNSUPPORTED/);
 assert.throws(()=>planMessages({...invite,email_data:{...invite.email_data,token_hash:'x'}},INVITE_HTML),/TOKEN_HASH_INVALID/);
});
test('invite retains original Korean HTML with only verified confirmation link',()=>{
 const [message]=planMessages(invite,INVITE_HTML);
 assert.equal(message.subject,'[백억커피] 매장 관리자 계정 초대 안내');
 assert.equal(message.to,invite.user.email);
 assert.match(message.html,/초대 수락하고 계정 활성화/);
 assert.doesNotMatch(message.html,/\{\{ \.ConfirmationURL \}\}/);
 assert.match(message.html, new RegExp('token='+hash));
 assert.match(message.html,/type=invite/);
 assert.match(message.html,/redirect_to=https%3A%2F%2Fkoith.github.io%2Fattendance-proto%2Fowner_activation.html/);
 assert.equal((message.html.match(/auth\/v1\/verify/g)||[]).length,1);
});
test('signup, recovery, magiclink all work as hook replaces ALL emails',()=>{
 for(const type of ['signup','recovery','magiclink']){
  const messages=planMessages({user:invite.user,email_data:{email_action_type:type,token_hash:hash,redirect_to:ROOT}},INVITE_HTML);
  assert.equal(messages.length,1);assert.match(messages[0].html,new RegExp('type='+type));
 }
});
test('secure email change sends to old and new with reversed Supabase hashes',()=>{
 const h2='b'.repeat(64);
 const messages=planMessages({user:{email:'old@example.com',new_email:'new@example.com'},email_data:{email_action_type:'email_change',token_hash:h2,token_hash_new:hash,redirect_to:ROOT}},INVITE_HTML);
 assert.equal(messages.length,2);assert.equal(messages[0].to,'old@example.com');assert.equal(messages[1].to,'new@example.com');
 assert.match(messages[0].html,new RegExp('token='+hash));assert.match(messages[1].html,new RegExp('token='+h2));
});
test('non-secure email change sends only to new mailbox',()=>{
 const messages=planMessages({user:{email:'old@example.com',new_email:'new@example.com'},email_data:{email_action_type:'email_change',token_hash:hash,redirect_to:ROOT}},INVITE_HTML);
 assert.equal(messages.length,1);assert.equal(messages[0].to,'new@example.com');
});
test('outbound GAS URL strictly pinned to Google Apps Script webapp',()=>{
 assert.equal(validGasUrl('https://script.google.com/macros/s/AKfycb-test_42/exec'),true);
 for(const u of ['http://script.google.com/macros/s/abc/exec','https://evil.example/macros/s/abc/exec','https://script.google.com@evil.example/macros/s/abc/exec','https://script.google.com/macros/s/abc/exec?next=evil','https://script.google.com/macros/s/abc/dev'])assert.equal(validGasUrl(u),false,u);
});
test('bridge envelope HMAC matches GAS signature computation',async()=>{
 const msg=planMessages(invite,INVITE_HTML)[0]; const env=await signedBridgeEnvelope(msg,'evt_123_0',bridgeSecret,stamp*1000);
 assert.equal(env.sent_at,stamp);assert.equal(env.nonce,'evt_123_0');
 const sig=createHmac('sha256',bridgeSecret).update(`${stamp}.evt_123_0.${JSON.stringify(env.data)}`).digest('base64');
 assert.equal(env.signature,sig);
 await assert.rejects(signedBridgeEnvelope(msg,'x','short'),/BRIDGE_SECRET_MISSING/);
});
function gasMock(){
 const sends=[];const cache=new Map();const props={QA1243_GMAIL_BRIDGE_SECRET:bridgeSecret};
 const context={Date:{now:()=>stamp*1000},Number,Math,JSON,LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
   PropertiesService:{getScriptProperties:()=>({getProperty:(n)=>props[n]})},
   CacheService:{getScriptCache:()=>({get:(n)=>cache.get(n),put:(n,v)=>cache.set(n,v)})},
   MailApp:{getRemainingDailyQuota:()=>100,sendEmail:(m)=>sends.push(m)},
   Utilities:{computeHmacSha256Signature:(material,secret)=>[...createHmac('sha256',secret).update(material).digest()].map(n=>n>127?n-256:n),base64Encode:(b)=>Buffer.from(b.map(n=>n<0?n+256:n)).toString('base64')},
   ContentService:{MimeType:{JSON:'JSON'},createTextOutput:s=>({setMimeType:()=>s})}
 };
 return {sends,props,cache,ctx:context};
}
test('GAS bridge rejects unsigned messages, sends verified once, deduplicates',async()=>{
 const gas=gasMock();const text=await readFile(new URL('../gas/qa1243-auth-mail/Code.gs',import.meta.url),'utf8');vm.runInNewContext(text,gas.ctx);
 const msg=planMessages(invite,INVITE_HTML)[0];const env=await signedBridgeEnvelope(msg,'evt_123_0',bridgeSecret,stamp*1000);
 const invalid=gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify({...env,signature:'wrong'})}});
 assert.equal(invalid.ok,false);assert.equal(gas.sends.length,0);
 const good=gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(env)}});
 assert.equal(good.ok,true);assert.equal(gas.sends.length,1);
 const duplicate=gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(env)}});
 assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);assert.equal(gas.sends.length,1);
 const expired={...env,sent_at:stamp-301};assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(expired)}}).ok,false);
});
test('GAS bridge refuses mail quota exhaustion and safe disabled secret',async()=>{
 const gas=gasMock();vm.runInNewContext(await readFile(new URL('../gas/qa1243-auth-mail/Code.gs',import.meta.url),'utf8'),gas.ctx);
 const msg=planMessages(invite,INVITE_HTML)[0];const env=await signedBridgeEnvelope(msg,'evt_456_0',bridgeSecret,stamp*1000);
 gas.props.QA1243_GMAIL_BRIDGE_SECRET='';assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(env)}}).code,'NOT_CONFIGURED');
});

test('GAS fails closed on missing properties, malformed POST, quota and unsafe content without sending',async()=>{
 const gas=gasMock();
 vm.runInNewContext(await readFile(new URL('../gas/qa1243-auth-mail/Code.gs',import.meta.url),'utf8'),gas.ctx);
 const msg=planMessages(invite,INVITE_HTML)[0];
 const env=await signedBridgeEnvelope(msg,'evt_safe_1',bridgeSecret,stamp*1000);
 assert.equal(gas.ctx.qa1243HandleMail_(null).code,'BAD_REQUEST');
 assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:'{'}}).code,'BAD_JSON');
 assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify({...env,data:{...env.data,to:'bad\\nBCC:someone@example.org'}})}}).code,'BAD_MAIL');
 assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify({...env,data:{...env.data,html:'<script>alert(1)</script>'}})}}).code,'BAD_MAIL');
 assert.equal(gas.sends.length,0);
 gas.ctx.MailApp.getRemainingDailyQuota=()=>0;
 assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(env)}}).code,'QUOTA_EXHAUSTED');
 assert.equal(gas.sends.length,0);
 gas.props.QA1243_GMAIL_BRIDGE_SECRET='short';
 assert.equal(gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(env)}}).code,'NOT_CONFIGURED');
 assert.equal(gas.sends.length,0);
});
test('GAS MailApp send failure never caches a successful receipt',async()=>{
 const gas=gasMock();
 vm.runInNewContext(await readFile(new URL('../gas/qa1243-auth-mail/Code.gs',import.meta.url),'utf8'),gas.ctx);
 const msg=planMessages(invite,INVITE_HTML)[0];
 const env=await signedBridgeEnvelope(msg,'evt_failed_send_1',bridgeSecret,stamp*1000);
 gas.ctx.MailApp.sendEmail=()=>{throw Error('isolated test simulated mail outage');};
 assert.throws(()=>gas.ctx.qa1243HandleMail_({postData:{contents:JSON.stringify(env)}}),/simulated mail outage/);
 assert.equal(gas.cache.size,0);
 assert.equal(gas.sends.length,0);
});
