// #1435: provision a separate, disabled monthly owner Apps Script project.
// No runtime mail, triggers, secrets or production spreadsheets are touched.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';
const TITLE='백억커피 월말 점주 자료발송 2026-10-31';
const OWNER='webuielf@gmail.com';
const ERR='MONTHLY_OWNER_GAS_';
const code=readFileSync('gas/monthly-owner-report/Code.gs','utf8');
const manifest=readFileSync('gas/monthly-owner-report/appsscript.json','utf8');
assert.match(code,/MONTHLY_OWNER_ENABLED/);
assert.match(code,/PRIMARY_OWNER_CHANGED_RETRY/);
assert.match(code,/MailApp\.sendEmail/);
assert.ok(JSON.parse(manifest).oauthScopes.includes('https://www.googleapis.com/auth/script.send_mail'));
const vars=['QA1243_GOOGLE_OAUTH_CLIENT_ID','QA1243_GOOGLE_OAUTH_CLIENT_SECRET','QA1243_GOOGLE_OAUTH_REFRESH_TOKEN'];
if(!vars.every(k=>process.env[k]))throw Error(ERR+'OAUTH_NOT_CONFIGURED');
async function call(url,options={}){
 let response;
 try{response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}
 catch{throw Error(ERR+'NETWORK_UNAVAILABLE');}
 let data;try{data=await response.json();}catch{data={};}
 if(!response.ok)throw Error(ERR+'API_HTTP_'+response.status);
 return data;
}
const result=await call('https://oauth2.googleapis.com/token',{
 method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({
  client_id:process.env.QA1243_GOOGLE_OAUTH_CLIENT_ID,
  client_secret:process.env.QA1243_GOOGLE_OAUTH_CLIENT_SECRET,
  refresh_token:process.env.QA1243_GOOGLE_OAUTH_REFRESH_TOKEN,
  grant_type:'refresh_token'
 })
});
if(!result.access_token)throw Error(ERR+'OAUTH_TOKEN_MISSING');
const auth={Authorization:'Bearer '+result.access_token};
const [identity,scopes]=await Promise.all([
 call('https://www.googleapis.com/oauth2/v3/userinfo',{headers:auth}),
 call('https://www.googleapis.com/oauth2/v2/tokeninfo?access_token='+encodeURIComponent(result.access_token),{headers:auth})
]);
if(String(identity.email||'').toLowerCase()!==OWNER||identity.email_verified!==true)
 throw Error(ERR+'OAUTH_IDENTITY_MISMATCH');
assertQa1243RunnerScopes(scopes.scope);
console.log(ERR+'OWNER_AND_SCOPES_VERIFIED');
const q="name = '"+TITLE.replace(/'/g,"\\'")+"' and trashed = false";
const listUrl='https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({
 q,fields:'nextPageToken,files(id,name,mimeType,owners(emailAddress),trashed)',page_size:'100'
});
const found=await call(listUrl,{headers:auth});
if(found.nextPageToken)throw Error(ERR+'DISCOVERY_INCOMPLETE');
const matches=found.files||[];
if(matches.length>1)throw Error(ERR+'DUPLICATE_PROJECT_NAMES');
if(matches.some(f=>f.mimeType!=='application/vnd.google-apps.script'||
 !Array.isArray(f.owners)||f.owners.length!==1||
 String(f.owners[0]?.emailAddress||'').toLowerCase()!==OWNER))
 throw Error(ERR+'PROJECT_OWNER_MISMATCH');
let id=matches[0]?.id,created=false;
if(!id){
 const project=await call('https://script.googleapis.com/v1/projects',{
  method:'POST',headers:{...auth,'content-type':'application/json'},
  body:JSON.stringify({title:TITLE})
 });
 id=project.scriptId;created=true;
}
if(!/^[A-Za-z0-9_-]{15,}$/.test(String(id||'')))throw Error(ERR+'SCRIPT_ID_INVALID');
const base='https://script.googleapis.com/v1/projects/'+encodeURIComponent(id);
const current=await call(base+'/content',{headers:auth});
const existing=current.files||[];
const prevCode=existing.find(f=>f.name==='Code'&&f.type==='SERVER_JS')?.source||'';
const prevManifest=existing.find(f=>f.name==='appsscript'&&f.type==='JSON')?.source||'';
if(!created&&prevCode&&prevCode!==code&&!prevCode.includes('#1435'))
 throw Error(ERR+'FOREIGN_EXISTING_SOURCE_REFUSED');
if(!created&&existing.some(f=>!['Code','appsscript'].includes(f.name)))
 throw Error(ERR+'EXTRA_FILES_REFUSED');
if(prevCode!==code||prevManifest!==manifest){
 await call(base+'/content',{
  method:'PUT',headers:{...auth,'content-type':'application/json'},
  body:JSON.stringify({files:[{name:'Code',type:'SERVER_JS',source:code},
   {name:'appsscript',type:'JSON',source:manifest}]})
 });
}
const saved=await call(base+'/content',{headers:auth});
const mapped=new Map((saved.files||[]).map(x=>[x.name,x.source]));
if(mapped.size!==2||mapped.get('Code')!==code||mapped.get('appsscript')!==manifest)
 throw Error(ERR+'REMOTE_READBACK_FAILED');
console.log(JSON.stringify({status:'SOURCE_PROVISIONED_DISABLED',script_id:id,owner:OWNER,
 source_sha256:createHash('sha256').update(code+'\n'+manifest).digest('hex'),
 created,mail_sent:false,triggers_created:false,script_properties_written:false}));
