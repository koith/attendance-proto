// QA1243 SAFARI ONLY. Never import operating Sheets/Script, DB or account.
// Public page has NO embedded Google Client Secret or GitHub administrator PAT.
// Bearer tokens exist only in short-lived POST memory and GitHub's encrypted
// one-hour QA access-token Secret; no logging, URL query or durable storage.
import sodium from 'npm:libsodium-wrappers@0.7.15';
import {htmlPage} from './page.ts';

const QA_OWNER='webuielf@gmail.com';
const GITHUB_OWNER='koith';
const REPO='koith/attendance-proto';
const SECRET_NAME='QA1243_GOOGLE_OAUTH_ACCESS_TOKEN';
const COOKIE='qa1243_mobile_once';
const EXPECTED_SCOPES=[
 'https://www.googleapis.com/auth/userinfo.email',
 'https://www.googleapis.com/auth/script.projects',
 'https://www.googleapis.com/auth/script.deployments',
 'https://www.googleapis.com/auth/drive.metadata.readonly',
 'https://www.googleapis.com/auth/spreadsheets.readonly'
];
const expirySeconds=600;
class Denied extends Error {
 constructor(public readonly code:string){super(code);}
}
function fail(code:string):never{throw new Denied(code);}
function hex(data:Uint8Array){return Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');}
async function digest(value:string){
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
}
function randomHex(bytes=32){return hex(crypto.getRandomValues(new Uint8Array(bytes)));}
function securityHeaders(nonce?:string){
 return {
  'Cache-Control':'no-store, no-cache, must-revalidate, private',
  'Pragma':'no-cache','Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':[
   "default-src 'none'",
   "base-uri 'none'","frame-ancestors 'none'","form-action 'none'",
   "script-src 'nonce-"+(nonce||'disabled')+"' https://accounts.google.com/gsi/client https://accounts.google.com/gsi/",
   "style-src 'nonce-"+(nonce||'disabled')+"' https://accounts.google.com/gsi/",
   "connect-src 'self' https://accounts.google.com",
   "frame-src https://accounts.google.com"
  ].join('; ')
 };
}
function jsonReply(code:string,http=400,extra:Record<string,unknown>={}){
 return new Response(JSON.stringify({ok:code==='QA1243_OK',code,...extra}),{
  status:http,headers:{...securityHeaders(),'Content-Type':'application/json;charset=utf-8'}
 });
}
function serverEnv(){
 const url=Deno.env.get('SUPABASE_URL');
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url?.startsWith('https://')||!key)fail('QA1243_MOBILE_BACKEND_CONFIGURATION_REQUIRED');
 return {url,key};
}
async function sessionRpc(name:string,hashedNonce:string){
 if(!/^[0-9a-f]{64}$/.test(hashedNonce))fail('QA1243_BAD_SESSION_HASH');
 const {url,key}=serverEnv();
 const res=await fetch(url+'/rest/v1/rpc/'+name,{
  method:'POST',redirect:'error',
  headers:{apikey:key,Authorization:'Bearer '+key,
   'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify({p_digest:hashedNonce}),
  signal:AbortSignal.timeout(12000)
 });
 if(!res.ok)fail('QA1243_SESSION_DATABASE_UNAVAILABLE');
 const v=await res.json();
 return v===true;
}
function readNonce(req:Request){
 const found=(req.headers.get('cookie')||'').split(';').map(x=>x.trim())
  .find(part=>part.startsWith(COOKIE+'='));
 const v=found?.slice(COOKIE.length+1)||'';
 return /^[0-9a-f]{64}$/.test(v)?v:null;
}
function expireCookie(){
 return COOKIE+'=; Path=/functions/v1/qa1243-mobile-auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict';
}
async function readSmallJson(req:Request){
 const claimed=Number(req.headers.get('content-length')||0);
 if(claimed>8500)fail('QA1243_BODY_TOO_LARGE');
 const reader=req.body?.getReader();
 if(!reader)fail('QA1243_MISSING_BODY');
 const parts:Uint8Array[]=[];
 let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>8500)fail('QA1243_BODY_TOO_LARGE');
   parts.push(value);
  }
 }finally{reader.releaseLock();}
 const packed=new Uint8Array(total);
 let offset=0;
 for(const part of parts){packed.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(packed));}
 catch{fail('QA1243_INVALID_REQUEST_BODY');}
}
async function externalJson(url:string,options:RequestInit,where:'GOOGLE'|'GITHUB'){
 let response:Response;
 try{response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}
 catch{fail('QA1243_'+where+'_NETWORK_UNAVAILABLE');}
 if(!response.ok)fail('QA1243_'+where+'_HTTP_'+response.status);
 try{return await response.json();}
 catch{fail('QA1243_'+where+'_BAD_RESPONSE');}
}
async function verifyGoogle(access:string,clientId:string){
 if(!/^[A-Za-z0-9._~-]{40,4096}$/.test(access)|| 
    !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))
   fail('QA1243_GOOGLE_CREDENTIAL_FORMAT');
 // Google supports tokeninfo POST. Access token goes in HTTPS form body,
 // NEVER URL query, stdout, referrer, GitHub Issue or Edge Function log.
 const tokenInfo=await externalJson('https://www.googleapis.com/oauth2/v2/tokeninfo',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({access_token:access})
 },'GOOGLE');
 const audience=tokenInfo.audience||tokenInfo.issued_to||tokenInfo.aud;
 if(audience!==clientId)fail('QA1243_GOOGLE_CLIENT_AUDIENCE_MISMATCH');
 const granted=new Set(String(tokenInfo.scope||'').split(/\s+/).filter(Boolean));
 if(granted.size!==EXPECTED_SCOPES.length ||
    EXPECTED_SCOPES.some(s=>!granted.has(s)))fail('QA1243_GOOGLE_SCOPE_MISMATCH');
 if(!Number.isFinite(Number(tokenInfo.expires_in)) ||
    Number(tokenInfo.expires_in)<1800)fail('QA1243_GOOGLE_ACCESS_TOKEN_TOO_OLD');
 const profile=await externalJson('https://www.googleapis.com/oauth2/v3/userinfo',{
  headers:{Authorization:'Bearer '+access}
 },'GOOGLE');
 if(String(profile.email||'').toLowerCase()!==QA_OWNER || profile.email_verified!==true)
  fail('QA1243_GOOGLE_OWNER_MISMATCH');
 // Original operating Google file must remain inaccessible to QA account.
 for(const fileId of [
  '1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024',
  '1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw'
 ]){
  const denied=await fetch('https://www.googleapis.com/drive/v3/files/'+fileId,{
   method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(10000)
  });
  if(denied.status!==403&&denied.status!==404)
   fail('QA1243_OPERATING_GOOGLE_FILE_ACCESS_NOT_DENIED');
 }
}
async function githubJson(url:string,gh:string,options:RequestInit={}){
 return await externalJson('https://api.github.com'+url,{
  ...options,headers:{
   Accept:'application/vnd.github+json',
   Authorization:'Bearer '+gh,
   'X-GitHub-Api-Version':'2022-11-28',
   ...(options.headers||{})
  }
 },'GITHUB');
}
async function githubResponse(url:string,gh:string,options:RequestInit){
 let res:Response;
 try{res=await fetch('https://api.github.com'+url,{
  ...options,redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{
   Accept:'application/vnd.github+json',
   Authorization:'Bearer '+gh,'X-GitHub-Api-Version':'2022-11-28',
   'Content-Type':'application/json'
  }
 });}catch{fail('QA1243_GITHUB_NETWORK_UNAVAILABLE');}
 if(![201,204].includes(res.status))fail('QA1243_GITHUB_WRITE_NOT_AUTHORIZED');
}
async function verifyGithub(gh:string){
 const profile=await githubJson('/user',gh);
 const repo=await githubJson('/repos/'+REPO,gh);
 if(profile.login!==GITHUB_OWNER || repo.full_name!==REPO || repo.permissions?.admin!==true)
  fail('QA1243_GITHUB_REPO_OWNER_MISMATCH');
}
async function chooseTrustedRun(gh:string){
 const branch=await githubJson('/repos/'+REPO+'/branches/main',gh);
 const mainSha=branch.commit?.sha;
 if(!/^[a-f0-9]{40}$/.test(mainSha||''))fail('QA1243_MAIN_SHA_UNVERIFIED');
 const result=await githubJson('/repos/'+REPO+
  '/actions/workflows/qa1243-live-e2e.yml/runs?branch=main&event=push&per_page=30',gh);
 for(const run of result.workflow_runs||[]){
  if(run.event!=='push'||run.head_branch!=='main'||run.status!=='completed'||
      run.conclusion!=='failure'||!Number.isSafeInteger(run.id) ||
      !/^[a-f0-9]{40}$/.test(run.head_sha||''))continue;
  const diff=await githubJson('/repos/'+REPO+'/compare/'+run.head_sha+'...'+mainSha,gh);
  if(diff.status==='ahead'||diff.status==='identical')return run.id as number;
 }
 fail('QA1243_NO_TRUSTED_FAILED_PUSH_RUN');
}
async function submit(req:Request){
 const origin=new URL(req.url).origin;
 if(req.headers.get('origin')!==origin ||
    req.headers.get('x-qa1243-mobile')!=='1' ||
    !String(req.headers.get('content-type')||'').startsWith('application/json'))
  fail('QA1243_CSRF_OR_ORIGIN_REJECTED');
 const cookie=readNonce(req);
 if(!cookie)fail('QA1243_SESSION_COOKIE_MISSING');
 const data=await readSmallJson(req);
 const google=String(data?.googleAccessToken||'');
 const webClient=String(data?.googleClientId||'');
 const gh=String(data?.githubToken||'');
 if(!/^github_pat_[A-Za-z0-9_]{20,300}$/.test(gh))
  fail('QA1243_GITHUB_FINE_GRAINED_PAT_REQUIRED');
 await verifyGoogle(google,webClient);
 await verifyGithub(gh);
 const runId=await chooseTrustedRun(gh);
 // The nonce hash is atomically claimed in Postgres before any Secret PUT.
 // Two retries with the same cookie cannot re-execute the privileged write.
 if(!await sessionRpc('qa1243_mobile_session_claim',await digest(cookie)))
  fail('QA1243_SESSION_EXPIRED_OR_ALREADY_USED');
 const pub=await githubJson('/repos/'+REPO+'/actions/secrets/public-key',gh);
 if(!/^[A-Za-z0-9_=-]+$/.test(pub.key||'')||!pub.key_id)
  fail('QA1243_GITHUB_PUBLIC_KEY_UNVERIFIED');
 await sodium.ready;
 const key=sodium.from_base64(pub.key,sodium.base64_variants.ORIGINAL);
 if(key.length!==32)fail('QA1243_INVALID_GITHUB_PUBLIC_KEY');
 const encrypted=sodium.to_base64(
  sodium.crypto_box_seal(sodium.from_string(google),key),
  sodium.base64_variants.ORIGINAL);
 await githubResponse('/repos/'+REPO+'/actions/secrets/'+SECRET_NAME,gh,{
  method:'PUT',body:JSON.stringify({encrypted_value:encrypted,key_id:pub.key_id})
 });
 // Verify only the secret metadata, never its encrypted or plaintext value.
 const meta=await githubJson('/repos/'+REPO+'/actions/secrets/'+SECRET_NAME,gh);
 if(meta.name!==SECRET_NAME)fail('QA1243_GITHUB_SECRET_METADATA_NOT_VERIFIED');
 await githubResponse('/repos/'+REPO+'/actions/runs/'+runId+'/rerun-failed-jobs',gh,{
  method:'POST',body:'{}'
 });
 return new Response(JSON.stringify({ok:true,code:'QA1243_OK',
  runUrl:'https://github.com/'+REPO+'/actions/runs/'+runId}),{
  status:200,headers:{...securityHeaders(),'Content-Type':'application/json;charset=utf-8',
   'Set-Cookie':expireCookie()}
 });
}
Deno.serve(async(req)=>{
 try{
  if(req.method==='GET'){
   if(new URL(req.url).search)fail('QA1243_URL_PARAMETERS_NOT_ALLOWED');
   const session=randomHex();
   if(!await sessionRpc('qa1243_mobile_session_issue',await digest(session)))
    fail('QA1243_SESSION_RATE_LIMIT_OR_CONFLICT');
   const nonce=randomHex(16);
   return new Response(htmlPage(nonce),{
    headers:{...securityHeaders(nonce),'Content-Type':'text/html;charset=utf-8',
     'Set-Cookie':COOKIE+'='+session+'; Path=/functions/v1/qa1243-mobile-auth; Max-Age='+
       expirySeconds+'; HttpOnly; Secure; SameSite=Strict'}
   });
  }
  if(req.method==='POST')return await submit(req);
  return jsonReply('QA1243_METHOD_NOT_ALLOWED',405);
 }catch(error){
  // Do NOT stringify/log thrown errors, request bodies, Google or GitHub
  // HTTP responses. Only whitelisted failure codes leave this endpoint.
  const code=error instanceof Denied&&/^QA1243_[A-Z0-9_]+$/.test(error.code)?
   error.code:'QA1243_INTERNAL_FAILURE';
  return jsonReply(code,code==='QA1243_INTERNAL_FAILURE'?503:400);
 }
});
