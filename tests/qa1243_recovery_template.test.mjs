import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyRecoveryConfig,planRecoveryConfig,validateRecoveryTemplate,
 DESIRED_SUBJECT,FIELDS} from '../scripts/qa1243_recovery_template.mjs';
const html=readFileSync(new URL('../supabase/email-templates/recovery.html',import.meta.url),'utf8');
const initial=()=>({
 site_url:'https://koith.github.io/attendance-proto/',
 uri_allow_list:'https://koith.github.io/attendance-proto/owner_activation.html',
 mailer_templates_recovery_content:'<p>Legacy recovery link</p>',
 mailer_subjects_recovery:'Reset your password',
 mailer_subjects_invite:'Store invite',
 smtp_password:'never-log-this-secret',
 external_email_enabled:true
});
function mockedHttp(seed=initial()){
 let settings=structuredClone(seed);const calls=[];
 const transport=async(_url,opt)=>{
  const method=opt.method,candidate=opt.body?JSON.parse(opt.body):null;
  calls.push({method,keys:candidate&&Object.keys(candidate)});
  if(!opt.headers.Authorization.startsWith('Bearer '))throw Error('NO_AUTH');
  if(method==='PATCH'){
   settings={...settings,...candidate};
   return {ok:true};
  }
  return {ok:true,json:async()=>structuredClone(settings)};
 };
 return {transport,calls,get:()=>structuredClone(settings)};
}
test('official recovery email opens static app before any single-use auth endpoint',()=>{
 validateRecoveryTemplate(html);
 assert.deepEqual(FIELDS,['mailer_templates_recovery_content','mailer_subjects_recovery']);
 assert.match(DESIRED_SUBJECT,/{{ \.Token }}/);
 assert.doesNotMatch(html,/\.ConfirmationURL/);
 assert.doesNotMatch(html,/\/auth\/v1\/verify/);
});
test('two-field Auth update preserves all unrelated settings',async()=>{
 const mock=mockedHttp();
 const result=await applyRecoveryConfig({readToken:'synthetic-read',writeToken:'synthetic-write',
  html,apply:true,transport:mock.transport});
 assert.equal(result.applied,true);
 assert.equal(result.status,'RECOVERY_TEMPLATE_APPLIED_VERIFIED');
 assert.deepEqual(mock.calls.map(x=>x.method),['GET','GET','PATCH','GET']);
 assert.deepEqual(mock.calls[2].keys,FIELDS);
 assert.equal(mock.get().mailer_subjects_invite,'Store invite');
 assert.equal(mock.get().smtp_password,'never-log-this-secret');
 assert.equal(mock.get().mailer_subjects_recovery,DESIRED_SUBJECT);
});
test('missing write authority never updates remote Auth',async()=>{
 const mock=mockedHttp();
 const result=await applyRecoveryConfig({readToken:'synthetic-read',html,apply:true,
  transport:mock.transport});
 assert.equal(result.status,'RECOVERY_AUTH_WRITE_CREDENTIAL_ABSENT');
 assert.equal(result.applied,false);
 assert.deepEqual(mock.calls.map(x=>x.method),['GET']);
});
test('read-only review has no mutations',async()=>{
 const mock=mockedHttp();
 const result=await applyRecoveryConfig({readToken:'synthetic-read',html,apply:false,
  transport:mock.transport});
 assert.equal(result.status,'RECOVERY_READ_ONLY_REVIEW');
 assert.deepEqual(mock.calls.map(x=>x.method),['GET']);
});
test('idempotent already-published version does not need write access',async()=>{
 const settings=initial();
 const plan=planRecoveryConfig(settings,html);
 const mock=mockedHttp({...settings,...plan.after});
 const result=await applyRecoveryConfig({readToken:'synthetic-read',html,apply:true,
  transport:mock.transport});
 assert.equal(result.applied,true);
 assert.equal(result.status,'RECOVERY_ALREADY_APPLIED_VERIFIED');
 assert.deepEqual(mock.calls.map(x=>x.method),['GET']);
});
test('tampered or nonstatic recovery link is rejected',()=>{
 assert.throws(()=>validateRecoveryTemplate(html.replace('owner_activation.html','evil.invalid')),/RECOVERY_TEMPLATE_INVALID/);
 assert.throws(()=>validateRecoveryTemplate(html+'<script>evil()</script>'),/RECOVERY_TEMPLATE_INVALID/);
 assert.throws(()=>validateRecoveryTemplate(html.replace('{{ .TokenHash }}','plaintext')),/RECOVERY_TEMPLATE_INVALID/);
});
