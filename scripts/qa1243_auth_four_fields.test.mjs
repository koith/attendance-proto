import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FOUR_FIELDS,INVITE_SUBJECT,APPLY_SCOPE,buildFourFieldReview,runFourFields,configVerdict}
 from './qa1243_auth_four_fields.mjs';
import {HOSTED_AUTH_READ_ACCESS,HOSTED_INVITATION_URLS} from './qa1243_auth_config_verdict.mjs';
const html=readFileSync(new URL('../supabase/email-templates/invite.html',import.meta.url),'utf8');
const readToken='synthetic-read-only-credential',writeToken='synthetic-write-credential';
const seed={mailer_templates_invite_content:'<h2>You have been invited</h2><a href="{{ .ConfirmationURL }}">Accept</a>',
 mailer_subjects_invite:'You have been invited',site_url:'http://localhost:3000',uri_allow_list:'',
 external_email_enabled:true,smtp_host:null,smtp_admin_email:null,smtp_pass:'private-smtp-passphrase',
 hook_send_email_enabled:false,hook_send_email_secrets:'private-hook-signing-material',
 disable_signup:false,mailer_autoconfirm:false,other_policy:{nested:[3,1,2]}};
const clone=v=>structuredClone(v);
const review=buildFourFieldReview(seed,html);
assert.deepEqual(Object.keys(review.before),FOUR_FIELDS);assert.deepEqual(Object.keys(review.after),FOUR_FIELDS);
assert.equal(review.before.site_url,'http://localhost:3000');assert.equal(review.after.site_url,HOSTED_INVITATION_URLS.siteUrls[0]);
assert.equal(review.after.mailer_subjects_invite,INVITE_SUBJECT);
assert.equal(review.after.uri_allow_list,HOSTED_INVITATION_URLS.activationUrl);
assert.equal(review.after.mailer_templates_invite_content,html);
const previous=' https://existing.invalid/return ,https://other.invalid/callback ';
assert.equal(buildFourFieldReview({...seed,uri_allow_list:previous},html).after.uri_allow_list,previous+','+HOSTED_INVITATION_URLS.activationUrl);
for(const raw of [HOSTED_INVITATION_URLS.activationUrl,'https://old.invalid/,'+HOSTED_INVITATION_URLS.activationUrl])
 assert.equal(buildFourFieldReview({...seed,uri_allow_list:raw},html).after.uri_allow_list,raw);
assert.equal(configVerdict(seed,html).passed,2);
assert.equal(configVerdict({...seed,...review.after},html).passed,6,'SMTP failures must remain after all four approved corrections');
for(const secret of [readToken,writeToken,seed.smtp_pass,seed.hook_send_email_secrets])
 assert.equal(JSON.stringify(review).includes(secret),false);
for(const change of [{site_url:'https://user:password@private.invalid/'},
 {site_url:'https://public.invalid/?access_token=private-value'},
 {mailer_templates_invite_content:seed.mailer_templates_invite_content+' '+readToken},
 {mailer_subjects_invite:'prefix '+seed.smtp_pass}])
 assert.throws(()=>buildFourFieldReview({...seed,...change},html,[readToken]),/WITHHELD/);
assert.throws(()=>buildFourFieldReview({...seed,site_url:undefined},html),/PREIMAGE_UNREPORTED/);
assert.throws(()=>buildFourFieldReview(seed,html.replace('</body>','<img src="tracker">\n</body>')),/TEMPLATE_INVALID/);

function provider({onGet,onPatch}={}){
 const state=clone(seed),calls=[];let gets=0,patches=0;
 const fetcher=async(url,options)=>{
  assert.equal(url,HOSTED_AUTH_READ_ACCESS.endpoint);assert.equal(options.redirect,'error');
  const body=options.body?JSON.parse(options.body):null;calls.push({method:options.method,body});
  assert.ok(['GET','PATCH'].includes(options.method));
  assert.equal(options.headers.Authorization,'Bearer '+(options.method==='GET'?readToken:writeToken));
  if(options.method==='GET'){
   gets++;await onGet?.({state,gets});return {ok:true,status:200,json:async()=>clone(state)};
  }
  patches++;assert.ok(Object.keys(body).length>0&&Object.keys(body).every(k=>FOUR_FIELDS.includes(k)));
  if(onPatch){const response=await onPatch({state,body,patches});if(response)return response;}
  else Object.assign(state,body);
  return {ok:true,status:200};
 };
 return {state,calls,fetcher};
}
const options={html,readToken,readOnlyToken:readToken,writeToken,scope:APPLY_SCOPE,
 expectedBeforeSha256:review.beforeSha256,apply:true};
let cases=0;
{
 const p=provider();const r=await runFourFields({...options,apply:false,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'REVIEW_ONLY');assert.deepEqual(p.calls.map(c=>c.method),['GET']);assert.equal(r.applied,false);
}
for(const change of [{scope:''},{writeToken:''},{writeToken:readToken},{expectedBeforeSha256:''},
 {expectedBeforeSha256:'a'.repeat(64)}]){
 const p=provider();const r=await runFourFields({...options,...change,fetcher:p.fetcher});cases++;
 assert.equal(r.patchAttempted,false);assert.equal(p.calls.some(c=>c.method==='PATCH'),false);
}
{
 const p=provider();const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'APPLIED_VERIFIED');assert.equal(r.applied,true);assert.equal(r.protectedOtherFieldsUnchanged,true);
 assert.deepEqual(p.calls.map(c=>c.method),['GET','GET','PATCH','GET']);
 assert.deepEqual(p.calls[2].body,review.after);assert.equal(r.verdict.passed,6);assert.equal(r.verdict.ready,false);
 for(const key of Object.keys(seed).filter(k=>!FOUR_FIELDS.includes(k)))assert.deepEqual(p.state[key],seed[key]);
 for(const secret of [readToken,writeToken,seed.smtp_pass,seed.hook_send_email_secrets])assert.equal(JSON.stringify(r).includes(secret),false);
}
{
 const p=provider({onGet:({state,gets})=>{if(gets===2)state.disable_signup=true;}});
 const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'CONCURRENT_CONFIG_CHANGE_NO_WRITE');assert.equal(r.patchAttempted,false);
}
{
 const p=provider({onPatch:()=>({ok:false,status:403})});const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'WRITE_NOT_APPLIED');assert.equal(r.patchError,'AUTH_CONFIG_PATCH_HTTP_403');
 assert.equal(p.calls.filter(c=>c.method==='PATCH').length,1,'No retry with broader credential');
}
{
 const p=provider({onPatch:({state,body})=>{Object.assign(state,body);throw Error(writeToken);}});
 const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'APPLIED_VERIFIED','Unknown HTTP write outcome must be reconciled by GET without a second PATCH');
 assert.equal(r.patchError,'AUTH_CONFIG_PATCH_NETWORK_FAILURE');assert.equal(JSON.stringify(r).includes(writeToken),false);
 assert.equal(p.calls.filter(c=>c.method==='PATCH').length,1);
}
{
 const p=provider({onPatch:({state,body,patches})=>{
  if(patches===1)state.site_url=body.site_url;else Object.assign(state,body);
 }});const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'APPLY_FAILED_ROLLED_BACK');assert.equal(r.rollbackVerified,true);
 assert.deepEqual(p.calls.filter(c=>c.method==='PATCH')[1].body,{site_url:seed.site_url});
 assert.deepEqual(p.state,seed);
}
{
 const p=provider({onPatch:({state,body})=>{Object.assign(state,body);state.mailer_subjects_invite='concurrent operator value';}});
 const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'CONCURRENT_FOUR_FIELD_CHANGE_NO_ROLLBACK');assert.equal(p.calls.filter(c=>c.method==='PATCH').length,1);
}
{
 const p=provider({onPatch:({state,body})=>{Object.assign(state,body);state.smtp_pass='changed elsewhere';}});
 const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'NON_TARGET_CONFIG_DRIFT_REQUIRES_REVIEW');assert.equal(r.applied,false);
 assert.equal(JSON.stringify(r).includes('changed elsewhere'),false);
}
{
 const p=provider({onGet:({gets})=>{if(gets===3)throw Error(readToken);}});
 const r=await runFourFields({...options,fetcher:p.fetcher});cases++;
 assert.equal(r.status,'APPLY_RESULT_UNVERIFIED');assert.equal(p.calls.filter(c=>c.method==='PATCH').length,1);
}
console.log('PASS '+cases+' synthetic repair cases: four-field payload, no SMTP/policy changes, review/scope/credential/preimage guards, concurrent change, 403, ambiguous outcome, targeted rollback and unknown readback');
const workflow=readFileSync(new URL('../.github/workflows/qa1243-auth-four-fields.yml',import.meta.url),'utf8');
assert.match(workflow,/run: node scripts\/qa1243_auth_four_fields.mjs --review/);
assert.doesNotMatch(workflow,/--apply|QA1243_AUTH_FOUR_FIELD_SCOPE|QA1243_AUTH_EXPECTED_BEFORE_SHA256/);
assert.match(workflow,/github.event_name != 'pull_request' && github.ref == 'refs\/heads\/main'/);
assert.match(workflow,/deployment: false/);assert.match(workflow,/environment_name:'production'/);
assert.match(workflow,/selectHostedAuthReadContext\(\{dedicatedPresent:write/);
// Execute the actual no-operating-write guard with this precise change set.
const pages=readFileSync(new URL('../.github/workflows/p0-pages-deploy.yml',import.meta.url),'utf8');
const from=pages.indexOf('            const allowed=new Set(['),last=pages.indexOf("            core.info('QA1243_NO_OPERATING_WRITE_GUARD_PASS",from);
const actual=pages.slice(from,pages.indexOf('\n',last)).split('\n').map(l=>l.startsWith('            ')?l.slice(12):l).join('\n');
const execute=new (Object.getPrototypeOf(async function(){}).constructor)('context','github','core',actual);
const changed=['scripts/qa1243_auth_four_fields.mjs','scripts/qa1243_auth_four_fields.test.mjs',
 '.github/workflows/qa1243-auth-four-fields.yml','.github/workflows/p0-pages-deploy.yml',
 '.github/workflows/qa1243-live-e2e.yml',
 'PROJECT_BACKLOG_20261017.md','QA1243_FRIDAY_OPENING_20261023.md'];
async function guard(files){return execute({repo:{owner:'koith',repo:'attendance-proto'},sha:'b'.repeat(40),
 payload:{before:'a'.repeat(40),head_commit:{message:'[QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]'}}},
 {rest:{repos:{compareCommits:async()=>({data:{files:files.map(filename=>({filename}))}})}}},{info(){}});}
await guard(changed);
for(const forbidden of ['index.html','owner_activation.js','supabase/functions/server-sync-sheet/index.ts','apps_script.gs','unknown.js'])
 await assert.rejects(()=>guard([...changed,forbidden]),/QA1243_NO_WRITES_UNEXPECTED|QA1243_UNMARKED_APP_CHANGE/);
console.log('PASS exact review-only workflow/main guard, existing protected environment access and rejected operating changes; no real Auth or mail requests');
const google=readFileSync(new URL('../.github/workflows/qa1243-live-e2e.yml',import.meta.url),'utf8');
const begin=google.indexOf('            const message='),end=google.indexOf("            core.setOutput('run_live',String(runLive));",begin);
const runScope=new (Object.getPrototypeOf(async function(){}).constructor)('context','github','core',
 google.slice(begin,end)+"            core.setOutput('run_live',String(runLive));");
async function googleScope(files){let live;
 await runScope({eventName:'push',sha:'b'.repeat(40),repo:{owner:'koith',repo:'attendance-proto'},
  payload:{before:'a'.repeat(40),head_commit:{message:'[QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]'}}},
  {rest:{repos:{compareCommits:async()=>({data:{files:files.map(filename=>({filename,status:'modified'}))}})}}},
  {info(){},setOutput(key,value){assert.equal(key,'run_live');live=value;}});return live;
}
assert.equal(await googleScope(changed),'false');
for(const forbidden of ['index.html','supabase/functions/server-sync-sheet/index.ts','scripts/qa1243_live_edge_gas_sheets.mjs','apps_script.gs'])
 await assert.rejects(()=>googleScope([...changed,forbidden]),/GOOGLE_REUSE_SCOPE_REJECTED/);
console.log('PASS actual Google scope guard skips live work for the exact Auth-only diff and still rejects Google/app/operating mutations');
