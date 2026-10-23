import assert from 'node:assert/strict';
import {assessHostedInviteConfig,probeHostedAuthManagement,HOSTED_AUTH_READ_ACCESS} from './qa1243_auth_config_verdict.mjs';
const verified={configReadable:true,remoteTemplateMatch:true,remoteInviteSubjectMatch:true,
 emailProviderEnabled:true,smtpHostConfigured:true,smtpSenderConfigured:true};
const pass=assessHostedInviteConfig(verified);
assert.equal(pass.ready,true);assert.equal(pass.passed,6);
assert.equal(pass.externalMailboxDeliveryVerified,false,'Config is not inbox receipt');
for(const key of Object.keys(verified)){
 const bad=assessHostedInviteConfig({...verified,[key]:false});
 assert.equal(bad.ready,false,'Missing '+key+' must fail');assert.equal(bad.passed,5);
 const unknown=assessHostedInviteConfig({...verified,[key]:null});
 assert.equal(unknown.ready,false,'Null '+key+' must fail');assert.equal(unknown.failed.length,1);
}
assert.equal(assessHostedInviteConfig({}).ready,false,'Public-only cannot PASS');
assert.equal(assessHostedInviteConfig(null).ready,false);
const expected={template:'expected html',subject:'expected subject'};
const calls=[];
const credential='test-scoped-management-value';
const existing='test-existing-management-value';
const config={mailer_templates_invite_content:expected.template,mailer_subjects_invite:expected.subject,
 smtp_host:'sensitive-host',smtp_port:587,smtp_user:'sensitive-user',smtp_pass:'sensitive-password',
 smtp_admin_email:'sensitive-sender',external_email_enabled:true,mailer_autoconfirm:false,disable_signup:true,mailer_otp_exp:3600};
const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>config};};
const none=await probeHostedAuthManagement({},expected,()=>{throw Error('Must not request management without credential');});
assert.equal(none.reason,'MANAGEMENT_API_CREDENTIAL_ABSENT');
assert.equal(none.requiredManagementAccess.fineGrainedPermission,'auth_config_read');
assert.equal(none.requiredManagementAccess.writeAccessRequired,false);
const positive=await probeHostedAuthManagement({SUPABASE_AUTH_READ_TOKEN:credential,SUPABASE_ACCESS_TOKEN:existing},expected,fetcher);
assert.equal(positive.managementCredentialSource,'SCOPED_AUTH_READ_SECRET');
assert.equal(assessHostedInviteConfig(positive).ready,true);
assert.equal(calls[0].url,HOSTED_AUTH_READ_ACCESS.endpoint);assert.equal(calls[0].options.method,'GET');
assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.Authorization,'Bearer '+credential);
for(const secret of [credential,existing,'sensitive-host','sensitive-user','sensitive-password','sensitive-sender',expected.template])
 assert.equal(JSON.stringify(positive).includes(secret),false,'Report must never retain a secret or remote template');
const reused=await probeHostedAuthManagement({SUPABASE_ACCESS_TOKEN:existing},expected,fetcher);
assert.equal(reused.managementCredentialSource,'EXISTING_MANAGEMENT_SECRET');
assert.equal(calls[1].options.headers.Authorization,'Bearer '+existing);
let denialCalls=0;
const denied=await probeHostedAuthManagement({SUPABASE_AUTH_READ_TOKEN:credential,SUPABASE_ACCESS_TOKEN:existing},expected,async()=>{
 denialCalls++;return {ok:false,status:403,json:async()=>({missing_permissions:['auth_config_read','untrusted-secret'],message:credential})};
});
assert.equal(denialCalls,1,'Never broaden access by retrying a denied read token with another credential');
assert.equal(denied.authConfigReadReportedMissing,true);assert.equal(denied.reason,'MANAGEMENT_AUTH_CONFIG_READ_DENIED');
assert.equal(JSON.stringify(denied).includes('untrusted-secret'),false);assert.equal(JSON.stringify(denied).includes(credential),false);
assert.equal(assessHostedInviteConfig(denied).ready,false);
for(const status of [401,429,500]){
 const failed=await probeHostedAuthManagement({SUPABASE_ACCESS_TOKEN:existing},expected,async()=>({ok:false,status}));
 assert.equal(failed.configReadable,false);assert.equal(assessHostedInviteConfig(failed).ready,false);
}
const network=await probeHostedAuthManagement({SUPABASE_ACCESS_TOKEN:existing},expected,async()=>{throw Error(credential)});
assert.equal(network.reason,'MANAGEMENT_GET_NETWORK_FAILURE');assert.equal(JSON.stringify(network).includes(credential),false);
for(const data of [null,[],false]){
 const invalid=await probeHostedAuthManagement({SUPABASE_ACCESS_TOKEN:existing},expected,async()=>({ok:true,status:200,json:async()=>data}));
 assert.equal(invalid.reason,'MANAGEMENT_CONFIG_JSON_INVALID');assert.equal(assessHostedInviteConfig(invalid).ready,false);
}
const blank=await probeHostedAuthManagement({SUPABASE_ACCESS_TOKEN:existing},expected,async()=>({ok:true,status:200,json:async()=>({...config,smtp_host:'  '})}));
assert.equal(blank.smtpHostConfigured,false);assert.equal(assessHostedInviteConfig(blank).ready,false);
console.log('PASS exact Auth Config Read permission, safe existing credential reuse, GET-only request, no secret output, denied/no credential remains NO_GO');
console.log('PASS QA1243 Hosted Auth strict positive evidence + fail-closed cases');
