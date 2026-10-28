import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAIL_KEYS,LOGO,mailTarget,applyMailBranding} from './qa1243_auth_mail_branding.mjs';
const invite=readFileSync('supabase/email-templates/invite.html','utf8'),recovery=readFileSync('supabase/email-templates/recovery.html','utf8');
const target=mailTarget(invite,recovery);
const before={...Object.fromEntries(MAIL_KEYS.map(k=>[k,'old English content'])),mailer_templates_recovery_content:'<a href="{{ .ConfirmationURL }}">Reset password</a>',site_url:'https://koith.github.io/attendance-proto/',smtp_host:'unchanged',smtp_pass:'synthetic-private',hook_send_email_enabled:false};
function transport({denied=false,drift=false,readOnly=false}={}){
 let current=structuredClone(before),reads=0;const calls=[];
 return {calls,fetcher:async(url,options)=>{
  assert.equal(url,'https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth');calls.push(options.method);
  if(options.method==='GET'){reads++;return {ok:true,status:200,json:async()=>({...current,...(drift&&reads>1?{smtp_host:'concurrent-change'}:{})})};}
  assert.equal(options.method,'PATCH');assert.equal(readOnly,false);
  const patch=JSON.parse(options.body);assert.deepEqual(Object.keys(patch).sort(),[...MAIL_KEYS].sort());
  assert.ok(patch.mailer_templates_recovery_content.includes('href="{{ .ConfirmationURL }}"'),'preserve actual provider link instead of migrating recovery authentication');
  if(denied)return {ok:false,status:403};current={...current,...patch};return {ok:true,status:200};
 }};
}
test('brand logo, Korean subjects and one verification link cover invite and recovery',()=>{
 assert.equal(MAIL_KEYS.length,4);assert.ok(target.mailer_subjects_recovery.startsWith('[백억커피]'));
 assert.ok(!recovery.includes('대표 권한 자동 확정'),'HQ password recovery must not promise branch ownership');
 assert.throws(()=>mailTarget(invite.replace(LOGO,'https://foreign.invalid/tracker'),recovery),/INVALID/);
 assert.throws(()=>mailTarget(invite.replace('src="'+LOGO+'"','src="https://foreign.invalid/tracker" data-src="'+LOGO+'"'),recovery),/INVALID/);
 assert.throws(()=>mailTarget(invite+'<script>bad()</script>',recovery),/INVALID/);
});
test('approved apply changes four mail fields and verifies every other setting unchanged',async()=>{
 const t=transport();const r=await applyMailBranding({target,readToken:'synthetic-read',writeToken:'synthetic-write',fetcher:t.fetcher,apply:true});
 assert.equal(r.applied,true);assert.equal(r.otherSettingsUnchanged,true);assert.deepEqual(t.calls,['GET','GET','PATCH','GET']);
 assert.ok(!JSON.stringify(r).includes('synthetic-private'));assert.ok(!JSON.stringify(r).includes('synthetic-read'));
});
test('missing write credential performs only actual GET and remains unverified',async()=>{
 const t=transport({readOnly:true});const r=await applyMailBranding({target,readToken:'synthetic-read',fetcher:t.fetcher,apply:true});
 assert.equal(r.reason,'AUTH_CONFIG_WRITE_CREDENTIAL_ABSENT');assert.equal(r.patchAttempted,false);assert.deepEqual(t.calls,['GET']);
});
test('403 never escalates or uses read-only credentials for a second PATCH',async()=>{
 const t=transport({denied:true});const r=await applyMailBranding({target,readToken:'synthetic-read',writeToken:'synthetic-write',fetcher:t.fetcher,apply:true});
 assert.equal(r.reason,'AUTH_MAIL_PATCH_HTTP_403');assert.equal(r.applied,false);assert.equal(t.calls.filter(x=>x==='PATCH').length,1);
});
test('concurrent Auth settings changes stop the apply before PATCH',async()=>{
 const t=transport({drift:true});const r=await applyMailBranding({target,readToken:'synthetic-read',writeToken:'synthetic-write',fetcher:t.fetcher,apply:true});
 assert.equal(r.reason,'AUTH_CONFIG_CONCURRENT_CHANGE');assert.deepEqual(t.calls,['GET','GET']);
});
test('a caller cannot add SMTP or URL fields to the authorized email PATCH',async()=>{
 const t=transport();const r=await applyMailBranding({target:{...target,site_url:'https://foreign.invalid'},readToken:'synthetic-read',writeToken:'synthetic-write',fetcher:t.fetcher,apply:true});
 assert.equal(r.reason,'BRANDED_MAIL_TARGET_SCOPE_REJECTED');assert.equal(t.calls.length,0);
});
