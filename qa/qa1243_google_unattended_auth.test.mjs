import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveUnattendedCredential,runUnattendedAuth,MAIL_DEPLOY_SCOPES} from '../scripts/qa1243_google_unattended_auth.mjs';
import {QA1243_RUNNER_SCOPES} from '../scripts/qa1243_oauth_scopes.mjs';
import {SCRIPT_ID,DEPLOYMENT_ID} from '../scripts/qa1243_repair_mail_gas.mjs';
import {QA_GAS_URL} from '../supabase/functions/qa1243-google-mail-bridge/connectivity.mjs';

const sentinel='CONFIDENTIAL_TEST_VALUE_DO_NOT_REPORT';
function bindings(prefix='QA1243_GOOGLE_OAUTH_'){
 return Object.fromEntries(['CLIENT_ID','CLIENT_SECRET','REFRESH_TOKEN'].map(k=>[prefix+k,sentinel]));
}
function fixture({scopes=QA1243_RUNNER_SCOPES,owner='webuielf@gmail.com',badTarget=false,refreshError=false}={}){
 const calls=[];
 async function fetcher(url,options={}){
  calls.push({url,options});
  if(url.endsWith('/token'))return refreshError?Response.json({error:'invalid_grant',error_description:sentinel},{status:400}):
    Response.json({access_token:sentinel,scope:scopes.join(' ')});
  if(url.endsWith('/userinfo'))return Response.json({email:owner,email_verified:true});
  if(url.includes('/drive/v3/files/'))return Response.json({id:SCRIPT_ID,trashed:false,owners:[{emailAddress:owner}]});
  if(url.endsWith('/deployments/'+DEPLOYMENT_ID))return Response.json({deploymentId:DEPLOYMENT_ID,
    entryPoints:[{entryPointType:'WEB_APP',webApp:{url:badTarget?'https://evil.example':QA_GAS_URL,
      entryPointConfig:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}}}]});
  if(url.endsWith('/projects/'+SCRIPT_ID))return Response.json({scriptId:SCRIPT_ID,title:'QA1243 isolated Auth MailApp 2026-10-24'});
  return Response.json({files:[]});
 }
 return {fetcher,calls};
}
test('known-expired access token alone makes no network request and cannot enter deployment',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call expired token');};
 const report=await runUnattendedAuth({QA1243_GOOGLE_OAUTH_ACCESS_TOKEN:sentinel},{fetcher,deploy:true});
 assert.equal(calls,0);assert.equal(report.knownExpiredAccessTokenSkipped,true);
 assert.equal(report.managementCredentialReady,false);assert.equal(report.deployment.attempted,false);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(sentinel));
});
test('existing refresh grant reports actual scope names and metadata access without expanding scopes',async()=>{
 const f=fixture({scopes:QA1243_RUNNER_SCOPES.filter(s=>/script\./.test(s))});
 const {report,call}=await resolveUnattendedCredential(bindings('GOOGLE_OAUTH_'),f);
 const c=report.candidates.find(x=>x.name==='EXISTING');
 assert.equal(c.grantedScopes.length,2);assert.equal(c.missingScopes.length,2);
 assert.equal(c.identitySkipped,'MISSING_USERINFO_SCOPE');assert.equal(c.writeEligible,false);assert.equal(call,null);
 assert.ok(c.evidence.some(e=>e.phase==='QA_PROJECT_GET'&&e.status===200));
 assert.ok(c.evidence.some(e=>e.phase==='QA_DEPLOYMENT_GET'&&e.status===200));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/userinfo')).length,0);
 assert.ok(!f.calls.some(c=>c.options.body instanceof URLSearchParams&&c.options.body.has('scope')));
});
test('only verified QA owner, exact grant and exact target yield a deploy caller; output contains no tokens',async()=>{
 const f=fixture();const {report,call}=await resolveUnattendedCredential(bindings(),f);
 assert.equal(report.managementCredentialReady,true);assert.equal(typeof call,'function');
 assert.equal(report.selectedCandidate,'QA');assert.equal(report.candidates[0].identityVerified,true);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(sentinel));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,1);
});
test('another user or unexpected deployment never enables writes',async()=>{
 for(const options of [{owner:'other@example.org'},{badTarget:true}]){
  const f=fixture(options);const r=await resolveUnattendedCredential(bindings(),f);
  assert.equal(r.call,null);assert.equal(r.report.managementCredentialReady,false);
  assert.ok(f.calls.every(c=>!['PUT','PATCH','DELETE'].includes(c.options.method)));
 }
});
test('extra OAuth privileges are not silently accepted for the isolated QA deployer',async()=>{
 const f=fixture({scopes:[...QA1243_RUNNER_SCOPES,'https://www.googleapis.com/auth/drive']});
 const r=await resolveUnattendedCredential(bindings(),f);
 assert.equal(r.call,null);assert.equal(r.report.candidates[0].reason,'REQUIRED_SCOPE_MISSING_OR_EXTRA');
});
test('unused Sheets read access is not required for a verified mail deployment',async()=>{
 assert.equal(MAIL_DEPLOY_SCOPES.length,4);
 const f=fixture({scopes:MAIL_DEPLOY_SCOPES});
 const r=await resolveUnattendedCredential(bindings(),f);
 assert.equal(r.report.managementCredentialReady,true);assert.equal(typeof r.call,'function');
 assert.ok(f.calls.every(c=>!c.url.includes('sheets.googleapis.com')));
});
test('invalid_grant is recorded once without description, token value or retry',async()=>{
 const f=fixture({refreshError:true});const {report}=await resolveUnattendedCredential(bindings(),f);
 assert.equal(f.calls.length,1);assert.equal(report.candidates[0].evidence[0].status,400);
 assert.equal(report.candidates[0].evidence[0].error,'invalid_grant');
 assert.doesNotMatch(JSON.stringify(report),new RegExp(sentinel));
});
test('actual API insufficient-scope response is retained without raw Google message',async()=>{
 const f=fixture();const base=f.fetcher;
 const fetcher=async(url,opt)=>url.includes('/projects/')?
  Response.json({error:{status:'PERMISSION_DENIED',message:sentinel,details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},{status:403}):base(url,opt);
 const {report,call}=await resolveUnattendedCredential(bindings(),{fetcher});
 assert.equal(call,null);assert.ok(report.candidates[0].evidence.some(e=>e.status===403&&e.reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')));
 assert.doesNotMatch(JSON.stringify(report),new RegExp(sentinel));
});
test('verified caller cannot create scripts/deployments, change properties, or reach operating resources',async()=>{
 const f=fixture();const {call}=await resolveUnattendedCredential(bindings(),f);
 const count=f.calls.length;
 for(const [url,method] of [['https://script.googleapis.com/v1/projects','POST'],
  ['https://script.googleapis.com/v1/projects/operating/content','PUT'],
  ['https://script.googleapis.com/v1/projects/'+SCRIPT_ID+'/deployments','POST'],
  ['https://script.googleapis.com/v1/projects/'+SCRIPT_ID+'/properties','PUT']])
  await assert.rejects(call(url,{method}),/API_TARGET_REJECTED/);
 assert.equal(f.calls.length,count);
 await call('https://script.googleapis.com/v1/projects/'+SCRIPT_ID+'/content?versionNumber=2');
 assert.equal(f.calls.length,count+1);
});
test('service-account bindings are presence-only; no key exchange, impersonation or new grant is attempted',async()=>{
 const report=await runUnattendedAuth({GCP_SA_KEY:sentinel},{fetcher:()=>{throw Error('No service account execution');}});
 assert.equal(report.serviceAccountBindings.GCP_SA_KEY,true);assert.equal(report.managementCredentialReady,false);
 assert.doesNotMatch(JSON.stringify(report),new RegExp(sentinel));
});
