import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assessHostedInviteConfig,probeHostedAuthManagement,HOSTED_AUTH_READ_ACCESS,
 assessHostedInvitationUrls,HOSTED_INVITATION_URLS,selectHostedAuthReadContext,
 diagnoseHostedAuthConfig,buildHostedAuthRepairPlan} from './qa1243_auth_config_verdict.mjs';

const environment={name:'production',protection_rules:[{type:'required_reviewers',reviewers:[{secret:'untrusted-private-value'}]},{type:'wait_timer'},{type:'branch_policy'}]};
for(const presence of [{dedicatedPresent:true},{existingPresent:true}]){
 const route=selectHostedAuthReadContext({...presence,environmentRead:{status:200,data:environment}});
 assert.equal(route.context,'REPOSITORY','Existing repository authority is not silently replaced');
 assert.equal(route.environmentReadStatus,null);
}
const protectedRoute=selectHostedAuthReadContext({environmentRead:{status:200,data:environment}});
assert.equal(protectedRoute.context,'EXISTING_PRODUCTION');assert.equal(protectedRoute.requiredReviewerGate,true);
assert.equal(protectedRoute.waitTimerGate,true);assert.equal(JSON.stringify(protectedRoute).includes('untrusted-private-value'),false);
for(const config of [null,{name:'new-environment',protection_rules:[]},{name:'production'},
 {name:'production',protection_rules:[{type:'custom_deployment_protection_rule'}]},
 {name:'production',protection_rules:[{type:'UNKNOWN'}]}]){
 assert.equal(selectHostedAuthReadContext({environmentRead:{status:200,data:config}}).context,'REPOSITORY','Never create environment or bypass unknown/custom rules');
}
for(const status of [null,401,403,404,500])
 assert.equal(selectHostedAuthReadContext({environmentRead:{status}}).context,'REPOSITORY');
const workflow=readFileSync(new URL('../.github/workflows/qa1243-operational-readonly.yml',import.meta.url),'utf8');
const verifyJob=workflow.slice(workflow.indexOf('  verify-audit-code:'),workflow.indexOf('  select-existing-read-context:'));
assert.equal(verifyJob.includes('secrets.'),false,'PR/static preparation receives no management credential');
assert.ok(workflow.includes("if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"));
assert.ok(workflow.includes('deployment: false'),'Auth config read must not manufacture a production deployment');
assert.ok(workflow.includes("environment_name:'production'"));
assert.equal(/github\.rest\.[^\n]*(?:create|update|delete)/i.test(workflow),false,'Only existing environment GET, never secret/environment mutation');
assert.ok(workflow.includes("outputs.context == 'REPOSITORY'"));
assert.ok(workflow.includes("outputs.context == 'EXISTING_PRODUCTION'"));
console.log('PASS existing Auth read routing: absent-only environment lookup, protected/non-deployment context, missing/custom rules stay closed and no management secrets in PR');
const verified={configReadable:true,remoteTemplateMatch:true,remoteInviteSubjectMatch:true,
 emailProviderEnabled:true,smtpHostConfigured:true,smtpSenderConfigured:true,
 siteUrlProductionMatch:true,activationRedirectAllowed:true};
const pass=assessHostedInviteConfig(verified);
assert.equal(pass.ready,true);assert.equal(pass.passed,8);
assert.equal(pass.externalMailboxDeliveryVerified,false,'Config is not inbox receipt');
for(const key of Object.keys(verified)){
 const bad=assessHostedInviteConfig({...verified,[key]:false});
 assert.equal(bad.ready,false,'Missing '+key+' must fail');assert.equal(bad.passed,7);
 const unknown=assessHostedInviteConfig({...verified,[key]:null});
 assert.equal(unknown.ready,false,'Null '+key+' must fail');assert.equal(unknown.failed.length,1);
}
assert.equal(assessHostedInviteConfig({}).ready,false,'Public-only cannot PASS');
assert.equal(assessHostedInviteConfig(null).ready,false);
const expected={template:'expected html',subject:'expected subject'};
const calls=[];
const credential='test-scoped-management-value';
const existing='test-existing-management-value';
const config={site_url:HOSTED_INVITATION_URLS.siteUrls[0],uri_allow_list:HOSTED_INVITATION_URLS.activationUrl,
 mailer_templates_invite_content:expected.template,mailer_subjects_invite:expected.subject,
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

// A missing custom SMTP host does not establish a broken mailer when a Send
// Email Hook replaces it. Neither a hook nor a default mailer relaxes the gate.
const diagnosticConfig={...config,hook_send_email_enabled:false,hook_send_email_uri:null};
assert.equal(diagnoseHostedAuthConfig(diagnosticConfig,expected).emailDeliveryMode,'CUSTOM_SMTP');
const defaultConfig={...diagnosticConfig,smtp_host:null,site_url:'http://localhost:3000',
 uri_allow_list:'',mailer_templates_invite_content:'',mailer_subjects_invite:''};
const defaultDiagnosis=diagnoseHostedAuthConfig(defaultConfig,expected);
assert.equal(defaultDiagnosis.emailDeliveryMode,'DEFAULT_SUPABASE_MAILER');
assert.equal(defaultDiagnosis.siteUrlClass,'LOOPBACK');
assert.equal(defaultDiagnosis.inviteTemplateState,'EMPTY_PROVIDER_DEFAULT');
assert.equal(defaultDiagnosis.inviteSubjectState,'EMPTY_PROVIDER_DEFAULT');
assert.equal(defaultDiagnosis.redirectAllowListEntryCount,0);
for(const enabled of [null,undefined,'false',0]){
 assert.equal(diagnoseHostedAuthConfig({...defaultConfig,hook_send_email_enabled:enabled},expected).emailDeliveryMode,
  'HOOK_STATE_UNVERIFIED','Unreported/invalid hook state cannot prove default SMTP');
}
const hookConfig={...defaultConfig,hook_send_email_enabled:true,
 hook_send_email_uri:'https://private-hook.invalid/send?token=sensitive-hook-secret',
 hook_send_email_secrets:'sensitive-hook-signing-secret'};
const hookDiagnosis=diagnoseHostedAuthConfig(hookConfig,expected);
assert.equal(hookDiagnosis.emailDeliveryMode,'SEND_EMAIL_HOOK');
assert.equal(diagnoseHostedAuthConfig({...hookConfig,hook_send_email_uri:null},expected).emailDeliveryMode,'HOOK_ENABLED_UNVERIFIED');
const hooked=await probeHostedAuthManagement({SUPABASE_AUTH_READ_TOKEN:credential},expected,
 async()=>({ok:true,status:200,json:async()=>hookConfig}));
assert.equal(assessHostedInviteConfig(hooked).ready,false,'Hook presence alone must not turn failed SMTP/template checks into PASS');
for(const value of ['https://private-site.invalid/?token=sensitive-site-secret','https://name:secret@private.invalid/']){
 assert.equal(diagnoseHostedAuthConfig({...defaultConfig,site_url:value},expected).siteUrlClass,'UNSAFE_COMPONENTS');
}
const safeDefault=await probeHostedAuthManagement({SUPABASE_AUTH_READ_TOKEN:credential},expected,
 async()=>({ok:true,status:200,json:async()=>defaultConfig}));
const plan=buildHostedAuthRepairPlan(safeDefault);
assert.deepEqual(plan.changes.map(x=>x.field),['mailer_templates_invite_content','mailer_subjects_invite','site_url','uri_allow_list']);
assert.equal(plan.changes[3].operation,'APPEND_EXACT_CALLBACK_PRESERVE_ALL_EXISTING_ENTRIES');
assert.equal(plan.deliveryAction,'APPROVED_CUSTOM_PROVIDER_AND_VERIFIED_SENDER_REQUIRED');
assert.equal(plan.futureWritePermission,'auth_config_write');assert.equal(plan.readSecretMustRemainReadOnly,true);
assert.equal(plan.mailSent,false);assert.equal(plan.accountsChanged,false);
assert.equal(buildHostedAuthRepairPlan(hooked).deliveryAction,'REVIEW_EXISTING_HOOK_DELIVERY_AND_KOREAN_CONTENT');
assert.equal(buildHostedAuthRepairPlan(none).unknownsRemainBlocking,true);
assert.equal(buildHostedAuthRepairPlan(none).changes.length,0,'Do not propose guessed writes when GET was unreadable');
assert.equal(buildHostedAuthRepairPlan(positive).changes.length,0,'An exact matching config needs no proposed settings change');
const report=JSON.stringify({hookDiagnosis,hooked,defaultDiagnosis,plan});
for(const value of ['sensitive-hook-secret','sensitive-hook-signing-secret','sensitive-host','sensitive-password',
 'sensitive-site-secret','private-hook.invalid',expected.template,credential])
 assert.equal(report.includes(value),false,'Diagnostics/plan must never retain private provider/config values');
console.log('PASS default SMTP/hook distinction, unknown remains blocking, no secret/URL output and approval-only minimal repair plan preserving redirects/policies');

const callback=HOSTED_INVITATION_URLS.activationUrl;
assert.equal(assessHostedInvitationUrls({site_url:HOSTED_INVITATION_URLS.siteUrls[0]}).activationRedirectSource,'SITE_ORIGIN');
for(const site of HOSTED_INVITATION_URLS.siteUrls){
 const urls=assessHostedInvitationUrls({site_url:site,uri_allow_list:''});
 assert.equal(urls.siteUrlProductionMatch,true);assert.equal(urls.activationRedirectAllowed,true);
 assert.equal(urls.activationRedirectExactListed,false,'Same-origin GoTrue redirects need no exact extra entry');
}
for(const site of [undefined,'','http://koith.github.io/attendance-proto/','https://koith.github.io/other-project/',
 'https://koith.github.io.evil.invalid/attendance-proto/','https://user:password@koith.github.io/attendance-proto/',
 'https://koith.github.io/attendance-proto/?token=sensitive-url-token','https://koith.github.io/attendance-proto/#access_token=sensitive-url-token',
 'http://localhost:3000','https://koith.github.io:8443/attendance-proto/']){
 const urls=assessHostedInvitationUrls({site_url:site,uri_allow_list:callback});
 assert.equal(urls.siteUrlProductionMatch,false,'Wrong default Site URL must not pass');
 assert.equal(assessHostedInviteConfig({...verified,...urls}).ready,false);
 assert.equal(JSON.stringify(urls).includes('sensitive-url-token'),false);
}
const wildcard=assessHostedInvitationUrls({site_url:'https://other.invalid/',uri_allow_list:'https://koith.github.io/**'});
assert.equal(wildcard.activationRedirectAllowed,null,'Unimplemented glob matching is unknown, never a fabricated failure or PASS');
assert.equal(wildcard.activationRedirectSource,'PATTERN_REQUIRES_REVIEW');
assert.equal(assessHostedInvitationUrls({site_url:'https://other.invalid/',uri_allow_list:callback+'.evil'}).activationRedirectAllowed,false);
const urlMissing=await probeHostedAuthManagement({SUPABASE_AUTH_READ_TOKEN:credential},expected,async()=>({ok:true,status:200,json:async()=>({...config,site_url:undefined,uri_allow_list:''})}));
assert.equal(assessHostedInviteConfig(urlMissing).ready,false,'SMTP/template proof alone cannot authorize a broken activation route');
const edge=readFileSync(new URL('../supabase/functions/server-sync-sheet/index.ts',import.meta.url),'utf8');
assert.ok(edge.includes('const redirectTo="'+callback+'";'),'Audit URL must equal actual new-account and recovery dispatch URL');
const template=readFileSync(new URL('../supabase/email-templates/invite.html',import.meta.url),'utf8');
assert.equal((template.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g)||[]).length,1);
console.log('PASS Hosted URL checks: production default, actual activation callback, GoTrue same-origin, unsafe URL rejection, unknown wildcard and no URL/token disclosure');

// Execute the deployed activation page in an isolated VM. All HTTP, storage,
// passwords and tokens below are synthetic; no Auth account or mail is touched.
const activation=readFileSync(new URL('../owner_activation.js',import.meta.url),'utf8');
async function pageCase(change={}){
 const state={preflight:{ok:true,store_id:701,intended_role:'OWNER'},
  accepted:{ok:true,store_id:701,owner_assigned:true},context:{role:'STORE_MANAGER',store_id:701},...change};
 const elements=Object.fromEntries(['status','activateForm','password','repeat','confirm','recoveryResendForm','recoveryEmail','resendRecovery'].map(id=>[id,{hidden:false,disabled:false,textContent:'',value:'',addEventListener(type,callback){this[type]=callback}}]));
 const calls=[],stored=[],redirects=[],scrubbed=[];
 const source='SUPABASE_URL: "https://synthetic.invalid", SUPABASE_ANON_KEY: "public-synthetic-key"';
 const reply=(data,ok=true,status=ok?200:422)=>({ok,status,json:async()=>data,text:async()=>source});
 const fetcher=async(url,options={})=>{
  calls.push({url,method:options.method||'GET'});
  if(url==='./index.html')return reply({},!state.configFailure);
  if(url.endsWith('/store_invitation_activation_preflight')){
   if(state.preflightNetwork)throw Error('synthetic network unavailable');
   return reply(state.preflight,!state.preflightHttpFailure);
  }
  if(url.endsWith('/auth/v1/user')){
   if(state.passwordFailure)return reply({message:'PASSWORD_REJECTED'} ,false);
   if(state.passwordError)return reply(state.passwordError,false,state.passwordStatus??422);
   const password=JSON.parse(options.body).password;
   if(state.passwordValue===password)return reply({code:'same_password',msg:'New password should be different from the old password.'},false);
   state.passwordValue=password;
   if(state.passwordResponseLost){state.passwordResponseLost=false;throw Error('synthetic saved password response lost');}
   return reply({});
  }
  if(url.endsWith('/store_primary_owner_accept_invitation'))return reply(state.accepted,!state.acceptHttpFailure);
  if(url.endsWith('/admin_context'))return reply(state.context,!state.contextHttpFailure);
  throw Error('UNEXPECTED_NETWORK_REQUEST');
 };
 await vm.runInNewContext(activation,{URLSearchParams,document:{getElementById:id=>elements[id]},
  location:{hash:state.hash??'#access_token=synthetic-token&refresh_token=synthetic-refresh&expires_in=3600',pathname:'/owner_activation.html',replace:url=>redirects.push(url)},
  history:{replaceState:(...args)=>scrubbed.push(args)},fetch:fetcher,
  localStorage:{setItem:(key,value)=>stored.push({key,value})}});
 async function submit(password='synthetic-password-123',repeat=password){
  elements.password.value=password;elements.repeat.value=repeat;
  if(elements.activateForm.onsubmit)await elements.activateForm.onsubmit({preventDefault(){}});
 }
 return {state,elements,calls,stored,redirects,scrubbed,submit};
}
let pageCases=0;
for(const intended_role of ['OWNER','ASSISTANT']){
 const page=await pageCase({preflight:{ok:true,store_id:701,intended_role},accepted:{ok:true,store_id:701,owner_assigned:intended_role==='OWNER'}});
 await page.submit();pageCases++;
 assert.deepEqual(page.calls.map(x=>x.method),['GET','POST','PUT','POST','POST']);
 assert.deepEqual(page.redirects,['index.html?mode=store&store=701#pos']);assert.equal(page.stored.length,1);
 assert.equal(page.elements.password.value,'');assert.equal(page.elements.repeat.value,'');
 assert.equal(page.scrubbed[0][2],'/owner_activation.html','Tokens removed before config request');
}
for(const hash of ['','#error=access_denied&error_description=Expired']){
 const page=await pageCase({hash});await page.submit();pageCases++;
 assert.equal(page.calls.length,0);assert.equal(page.elements.activateForm.hidden,true);
 assert.equal(page.elements.recoveryResendForm.hidden,false);
 assert.equal(page.stored.length,0);
}
for(const pair of [['short','short'],['synthetic-password-123','different-password-123']]){
 const page=await pageCase();await page.submit(...pair);pageCases++;
 assert.equal(page.calls.length,1);assert.equal(page.stored.length,0);
}
for(const change of [{preflight:{ok:false,error:'INVITATION_CANCELLED_OR_NOT_FOUND'}},
 {preflight:{ok:false,error:'OWNER_INVITATION_EXPIRED'}},{preflight:{ok:true,store_id:0,intended_role:'OWNER'}},
 {preflight:{ok:true,store_id:701,intended_role:'HQ'}},{preflightHttpFailure:true},{preflightNetwork:true}]){
 const page=await pageCase(change);await page.submit();pageCases++;
 assert.equal(page.calls.some(x=>x.method==='PUT'),false,'Cancelled/expired/unauthorized invite must never change a password');
 assert.equal(page.stored.length,0);assert.equal(page.redirects.length,0);assert.equal(page.elements.confirm.disabled,false);
}
for(const change of [{passwordFailure:true},{accepted:{ok:false,error:'EMAIL_CONFIRMATION_REQUIRED'}},
 {acceptHttpFailure:true},{context:{role:'HQ',store_id:701}},{context:{role:'STORE_MANAGER',store_id:702}},
 {contextHttpFailure:true}]){
 const page=await pageCase(change);await page.submit();pageCases++;
 assert.equal(page.stored.length,0);assert.equal(page.redirects.length,0);assert.equal(page.elements.confirm.disabled,false);
}
const unavailable=await pageCase({configFailure:true});pageCases++;
assert.equal(unavailable.elements.activateForm.hidden,true);assert.equal(unavailable.calls.length,1);
const retry=await pageCase({acceptHttpFailure:true});await retry.submit();
assert.equal(retry.stored.length,0);retry.state.acceptHttpFailure=false;await retry.submit();pageCases++;
assert.equal(retry.stored.length,1);assert.equal(retry.redirects.length,1);
for(const intended_role of ['OWNER','ASSISTANT']){
 const page=await pageCase({passwordValue:'synthetic-password-123',preflight:{ok:true,store_id:701,intended_role}});
 await page.submit();pageCases++;
 assert.equal(page.stored.length,1,'Existing matching password may resume authorized activation');
 assert.equal(page.calls.filter(c=>c.url.endsWith('/store_invitation_activation_preflight')).length,1);
}
const lost=await pageCase({passwordResponseLost:true});await lost.submit();
assert.equal(lost.stored.length,0);assert.equal(lost.redirects.length,0);
await lost.submit();pageCases++;
assert.equal(lost.stored.length,1,'Lost password response must not strand an invited manager');
assert.equal(lost.calls.filter(c=>c.url.endsWith('/store_invitation_activation_preflight')).length,2);
for(const change of [
 {passwordError:{message:'same_password'}},
 {passwordError:{code:'weak_password'}},
 {passwordError:{code:'same_password'},passwordStatus:500},
 {passwordError:{code:'same_password'},passwordStatus:401}
]){
 const page=await pageCase(change);await page.submit();pageCases++;
 assert.equal(page.stored.length,0);assert.equal(page.redirects.length,0);
 assert.equal(page.calls.some(c=>c.url.endsWith('/store_primary_owner_accept_invitation')),false);
}
const cancelledRetry=await pageCase({acceptHttpFailure:true});await cancelledRetry.submit();
cancelledRetry.state.preflight={ok:false,error:'INVITATION_CANCELLED_OR_NOT_FOUND'};
const requestsBefore=cancelledRetry.calls.length;await cancelledRetry.submit();pageCases++;
assert.equal(cancelledRetry.calls.length,requestsBefore+1,'Re-check cancelled invitation before repeat password request');
assert.equal(cancelledRetry.stored.length,0);assert.equal(cancelledRetry.redirects.length,0);
console.log('PASS actual activation source VM '+pageCases+' cases: owner/assistant, expiry/cancel, no unauthorized password PUT, failure retry and cross-store context; no live Auth/SMTP calls');
