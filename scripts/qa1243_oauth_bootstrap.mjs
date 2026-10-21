// QA1243 isolated, single-use LOCAL OAuth bootstrap (Node 22+, Windows supported).
// No token/client secret is written to local files, command arguments, logs,
// PRs, browser output, or stdout. gh encrypts Secrets before upload.
// This script never connects to the operating Google Drive account.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {QA1243_RUNNER_SCOPES,assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';

export const QA1243_REPO='koith/attendance-proto';
export const QA1243_GCP_PROJECT='qa1243-isolated';
export const QA1243_QA_EMAIL='webuielf@gmail.com';

export function validateDesktopClient(json){
 const candidate=json?.installed;
 if(!candidate || json.web || candidate.project_id!==QA1243_GCP_PROJECT)
   throw Error('QA1243_DESKTOP_CLIENT_OR_PROJECT_MISMATCH');
 if(!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(candidate.client_id||'')) ||
    !candidate.client_secret || /[\r\n]/.test(candidate.client_secret))
   throw Error('QA1243_INVALID_DESKTOP_CLIENT_FILE');
 return {client_id:candidate.client_id,client_secret:candidate.client_secret};
}

export function oauthAuthorizationUrl(client,redirectUri,state,verifier){
 if(!/^http:\/\/127\.0\.0\.1:[0-9]+\/oauth2callback$/.test(redirectUri))
   throw Error('QA1243_LOOPBACK_ONLY');
 if(!/^[a-zA-Z0-9_-]{35,128}$/.test(state) ||
    !/^[a-zA-Z0-9_-]{43,128}$/.test(verifier))
   throw Error('QA1243_INVALID_PKCE_OR_STATE');
 const challenge=createHash('sha256').update(verifier,'ascii').digest('base64url');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v] of Object.entries({
  client_id:client.client_id,response_type:'code',redirect_uri:redirectUri,
  scope:QA1243_RUNNER_SCOPES.join(' '),access_type:'offline',
  prompt:'consent select_account',login_hint:QA1243_QA_EMAIL,
  include_granted_scopes:'false',state,code_challenge:challenge,
  code_challenge_method:'S256'
 }))url.searchParams.set(k,v);
 return url.toString();
}

export function githubSecretsStdin(client,refreshToken){
 const values=[
  ['QA1243_GOOGLE_OAUTH_CLIENT_ID',client.client_id],
  ['QA1243_GOOGLE_OAUTH_CLIENT_SECRET',client.client_secret],
  ['QA1243_GOOGLE_OAUTH_REFRESH_TOKEN',refreshToken]
 ];
 for(const [,value] of values){
  if(typeof value!=='string' || value.length<8 || /[\r\n\0]/.test(value))
   throw Error('QA1243_INVALID_SECRET_VALUE');
 }
 return values.map(([key,value])=>key+'='+value).join('\n')+'\n';
}

export function findQaDesktopCredentials(explicitPath,searchDirectories){
 const dirs=searchDirectories||[
  path.dirname(fileURLToPath(import.meta.url)),process.cwd(),path.join(os.homedir(),'Downloads')
 ];
 if(explicitPath){
  const json=JSON.parse(fs.readFileSync(explicitPath,'utf8'));
  return validateDesktopClient(json);
 }
 const matched=[];
 for(const dir of new Set(dirs)){
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())continue;
  for(const item of fs.readdirSync(dir)){
   if(!/^(client_secret.*|qa1243.*oauth.*)\.json$/i.test(item))continue;
   const filename=path.join(dir,item);
   if(!fs.statSync(filename).isFile())continue;
   try{
    const client=validateDesktopClient(JSON.parse(fs.readFileSync(filename,'utf8')));
    if(!matched.some(m=>m.client_id===client.client_id))matched.push(client);
   }catch{ /* unrelated client: never log content or path */ }
  }
 }
 if(matched.length!==1)throw Error(matched.length===0?
  'QA1243_DESKTOP_CLIENT_FILE_NOT_FOUND':'QA1243_MULTIPLE_DESKTOP_CLIENT_FILES');
 return matched[0];
}

function command(bin,args,{stdin=null,interactive=false}={}){
 return new Promise((resolve,reject)=>{
  const proc=spawn(bin,args,{windowsHide:true,stdio:interactive?'inherit':['pipe','pipe','ignore']});
  let stdout='';
  if(!interactive){
   proc.stdout.on('data',chunk=>{
    stdout+=chunk.toString();
    if(stdout.length>200000)proc.kill();
   });
   proc.stdin.on('error',()=>{ /* exit handler reports failure */ });
   proc.stdin.end(stdin===null?'':stdin,'utf8');
  }
  proc.on('error',()=>reject(Error('QA1243_CLI_NOT_AVAILABLE')));
  proc.on('close',code=>code===0?resolve(stdout):
   reject(Error('QA1243_CLI_EXIT_FAILURE')));
 });
}

async function prepareGitHub(){
 try{await command('gh',['--version']);}
 catch{throw Error('QA1243_GH_CLI_MISSING');}
 try{await command('gh',['auth','status','--hostname','github.com']);}
 catch{
  console.log('QA1243_GITHUB_LOGIN_REQUIRED (GitHub browser confirmation only)');
  await command('gh',['auth','login','--hostname','github.com','--web','--scopes','repo'],{interactive:true});
 }
 const meta=JSON.parse(await command('gh',[
  'repo','view',QA1243_REPO,'--json','nameWithOwner,viewerPermission'
 ]));
 if(meta.nameWithOwner!==QA1243_REPO || meta.viewerPermission!=='ADMIN')
  throw Error('QA1243_GITHUB_ADMIN_PERMISSION_REQUIRED');
 console.log('QA1243_GITHUB_REPOSITORY_ADMIN_VERIFIED');
}

function openLocalBrowser(url){
 const target=process.platform==='win32'?'explorer.exe':
  process.platform==='darwin'?'open':'xdg-open';
 const browser=spawn(target,[url],{detached:true,stdio:'ignore',windowsHide:true});
 browser.on('error',()=>{ /* timeout will identify failure, no URL leaked */ });
 browser.unref();
}

async function getLocalAuthorizationCode(client){
 const state=randomBytes(32).toString('base64url');
 const verifier=randomBytes(64).toString('base64url');
 let resolveCode,rejectCode;
 const awaitingCode=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
 const server=http.createServer((req,res)=>{
  const respond=(status,message)=>{
   res.writeHead(status,{
    'content-type':'text/plain; charset=utf-8',
    'cache-control':'no-store','referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'"
   });
   res.end(message);
  };
  if(req.method!=='GET' || !req.url?.startsWith('/oauth2callback?')){
   respond(404,'Not found');return;
  }
  const incoming=new URL(req.url,'http://127.0.0.1');
  const received=Buffer.from(incoming.searchParams.get('state')||'');
  const expected=Buffer.from(state);
  if(received.length!==expected.length||!timingSafeEqual(received,expected)){
   respond(403,'OAuth state mismatch. Authorization was not accepted.');return;
  }
  if(incoming.searchParams.has('error')){
   respond(403,'Google permission was not granted.');rejectCode(Error('QA1243_GOOGLE_CONSENT_REJECTED'));return;
  }
  const code=incoming.searchParams.get('code');
  if(!code){respond(400,'OAuth authorization code missing.');return;}
  respond(200,'QA1243: Google account consent received. You may close this tab.');
  resolveCode(code);
 });
 await new Promise((resolve,reject)=>{
  server.once('error',()=>reject(Error('QA1243_LOCAL_CALLBACK_PORT_FAILURE')));
  server.listen(0,'127.0.0.1',resolve);
 });
 const address=server.address();
 const redirectUri='http://127.0.0.1:'+address.port+'/oauth2callback';
 const url=oauthAuthorizationUrl(client,redirectUri,state,verifier);
 console.log('QA1243_OPENING_GOOGLE_QA_ACCOUNT_CONSENT');
 openLocalBrowser(url);
 let timer;
 try{
  const code=await Promise.race([
   awaitingCode,
   new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('QA1243_GOOGLE_CONSENT_TIMEOUT')),360000);
   })
  ]);
  return {code,verifier,redirectUri};
 }finally{
  clearTimeout(timer);server.close();
 }
}

async function googleJson(url,options){
 let res;
 try{res=await fetch(url,{...options,signal:AbortSignal.timeout(30000),redirect:'error'});}
 catch{throw Error('QA1243_GOOGLE_NETWORK_FAILURE');}
 if(!res.ok)throw Error('QA1243_GOOGLE_HTTP_'+res.status);
 try{return await res.json();}
 catch{throw Error('QA1243_GOOGLE_RESPONSE_NOT_JSON');}
}
async function assertIdentity(accessToken){
 const profile=await googleJson('https://www.googleapis.com/oauth2/v3/userinfo',{
  headers:{Authorization:'Bearer '+accessToken}
 });
 if(String(profile.email||'').toLowerCase()!==QA1243_QA_EMAIL ||
    profile.email_verified!==true)
  throw Error('QA1243_WRONG_GOOGLE_ACCOUNT');
}
async function getGoogleRefreshToken(client){
 const {code,verifier,redirectUri}=await getLocalAuthorizationCode(client);
 const auth=await googleJson('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({
   grant_type:'authorization_code',code,redirect_uri:redirectUri,
   code_verifier:verifier,client_id:client.client_id,
   client_secret:client.client_secret
  })
 });
 if(!auth.access_token||!auth.refresh_token)
  throw Error('QA1243_OFFLINE_REFRESH_TOKEN_NOT_ISSUED');
 assertQa1243RunnerScopes(auth.scope);
 await assertIdentity(auth.access_token);
 // Prove the refresh grant will work later in trusted GitHub Actions.
 const refreshed=await googleJson('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({
   grant_type:'refresh_token',client_id:client.client_id,
   client_secret:client.client_secret,refresh_token:auth.refresh_token
  })
 });
 if(!refreshed.access_token)throw Error('QA1243_REFRESH_GRANT_FAILED');
 if(refreshed.scope)assertQa1243RunnerScopes(refreshed.scope);
 await assertIdentity(refreshed.access_token);
 console.log('QA1243_GOOGLE_QA_OWNER_AND_EXACT_5_SCOPES_VERIFIED');
 return auth.refresh_token;
}

// Never infer E2E PASS from a successful rerun API request alone. The trusted
// push job must actually finish successfully with the writer step executed.
export function assertQa1243LiveRunReceipt(run,expectedSha){
 if(run?.event!=='push' || run?.headSha!==expectedSha ||
    run?.status!=='completed' || run?.conclusion!=='success')
   throw Error('QA1243_LIVE_E2E_RECEIPT_NOT_PASS');
 const job=(run.jobs||[]).find(j=>
  j.name==='Trusted production Edge to a new independent GAS project and Sheets');
 if(job?.conclusion!=='success' ||
    !job.steps?.some(step=>step.name===
      'Execute real new GAS project and production Edge service-to-service QA' &&
      step.conclusion==='success'))
   throw Error('QA1243_LIVE_E2E_WRITER_STEP_NOT_PASS');
 return true;
}

async function recordVerifiedE2eReceipt(runId,mainSha){
 const actionUrl='https://github.com/'+QA1243_REPO+'/actions/runs/'+runId;
 try{
  // gh watch receives no secrets and logs remain suppressed.
  await command('gh',['run','watch',String(runId),'--exit-status','--repo',QA1243_REPO]);
  const receipt=JSON.parse(await command('gh',['run','view',String(runId),
   '--repo',QA1243_REPO,'--json','event,headSha,status,conclusion,jobs']));
  assertQa1243LiveRunReceipt(receipt,mainSha);
  const issueBody=[
   '[QA1243 live E2E] Verified trusted main push QA success (local one-click bootstrap)',
   '- Official GitHub Actions evidence: '+actionUrl,
   '- Verified source SHA: '+mainSha,
   '- Event: push, final status: completed, conclusion: success',
   '- The isolated live production Edge→QA Apps Script→QA Sheets writer step completed successfully.',
   '- This proves only synthetic QA-05 service integration, NOT Hosted Auth email, manager session or Friday GO.',
   '- Original operating Google and production Supabase data were not intentionally modified by this QA workflow.'
  ].join('\n');
  // Issue text contains ONLY verified public run id and SHA, no source,
  // token, OAuth code, spreadsheet payload, or GitHub/Google credentials.
  await command('gh',['issue','comment','1243','--repo',QA1243_REPO,
   '--body-file','-'],{stdin:issueBody});
  console.log('QA1243_E2E_PASS_AND_ISSUE_1243_RECORDED '+actionUrl);
 }catch{
  console.log('QA1243_LIVE_E2E_NOT_YET_PROVEN_OR_ISSUE_NOT_RECORDED '+actionUrl);
  console.log('QA1243_STILL_NO_GO; check QA-only run for possible QA Script owner consent.');
 }
}

async function uploadSecretsAndRerun(client,refreshToken){
 const env=githubSecretsStdin(client,refreshToken);
 // stdin only; GitHub CLI encrypts locally. No shell, --body, env vars,
 // temporary dotenv files, stdout or CI logs containing credentials.
 await command('gh',['secret','set','-f','-','--repo',QA1243_REPO,'--app','actions'],{stdin:env});
 console.log('QA1243_THREE_GITHUB_ACTIONS_SECRETS_UPLOADED (values never displayed)');
 const list=JSON.parse(await command('gh',[
  'secret','list','--repo',QA1243_REPO,'--app','actions','--json','name'
 ]));
 const expected=['QA1243_GOOGLE_OAUTH_CLIENT_ID','QA1243_GOOGLE_OAUTH_CLIENT_SECRET',
  'QA1243_GOOGLE_OAUTH_REFRESH_TOKEN'];
 if(expected.some(name=>!list.some(row=>row.name===name)))
  throw Error('QA1243_GITHUB_SECRETS_READBACK_FAILED');
 // Re-run only an existing trusted main push, never a workflow_dispatch run.
 // A failed preconsent attempt can deploy the QA script, then safely fail
 // before real Sheets write. The script owner may need to consent separately.
 const main=await command('gh',['api','repos/'+QA1243_REPO+'/branches/main','--jq','.commit.sha']);
 const runs=JSON.parse(await command('gh',[
  'run','list','--repo',QA1243_REPO,'--workflow','qa1243-live-e2e.yml',
  '--branch','main','--event','push','--limit','30',
  '--json','databaseId,headSha,status,conclusion,event'
 ]));
 const match=runs.find(r=>r.headSha===main.trim() && r.event==='push' &&
   r.status==='completed' && r.conclusion==='failure' &&
   Number.isSafeInteger(r.databaseId));
 if(!match){
  console.log('QA1243_SECRETS_READY_NO_SAFE_FAILED_MAIN_PUSH_TO_RERUN');
  return;
 }
 await command('gh',['run','rerun',String(match.databaseId),'--failed','--repo',QA1243_REPO]);
 console.log('QA1243_TRUSTED_MAIN_PUSH_E2E_RERUN_REQUESTED id='+match.databaseId);
 await recordVerifiedE2eReceipt(match.databaseId,main.trim());
}

async function main(){
 if(Number(process.versions.node.split('.')[0])<20)throw Error('QA1243_NODE_20_PLUS_REQUIRED');
 // OAuth JSON stays on the user's device. It must belong to the separate
 // QA Cloud project, never a legacy operating project.
 const index=process.argv.indexOf('--credentials');
 const explicit=index<0?null:process.argv[index+1];
 if(index>=0&&!explicit)throw Error('QA1243_CLIENT_FILE_ARGUMENT_MISSING');
 const client=findQaDesktopCredentials(explicit);
 await prepareGitHub();
 const refreshToken=await getGoogleRefreshToken(client);
 await uploadSecretsAndRerun(client,refreshToken);
 console.log('QA1243_BOOTSTRAP_DONE — Check QA-only Actions; Friday remains NO_GO until live evidence.');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().catch(error=>{
  // Never log raw HTTP error payloads, stack traces or OAuth credentials.
  const code=String(error?.message||'QA1243_UNEXPECTED_FAILURE');
  console.error(/^QA1243_[A-Z0-9_]+$/.test(code)?code:'QA1243_UNEXPECTED_FAILURE');
  process.exitCode=1;
 });
}
