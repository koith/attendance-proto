// Isolated QA1243 MailApp Apps Script installer. Do not enable mail or change Sheets.
import {readFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';
const TITLE='QA1243 isolated Auth Mail Bridge 2026-10-24 (inactive)';
const OWNER='webuielf@gmail.com';
const API='https://script.googleapis.com/v1/projects';
const code=readFileSync('gas/qa1243-auth-mail/Code.gs','utf8');
const manifest=readFileSync('gas/qa1243-auth-mail/appsscript.json','utf8');
const expected='https://www.googleapis.com/auth/script.send_mail';
if(!code.includes('MailApp.sendEmail')||!code.includes('QA1243_GMAIL_BRIDGE_SECRET')||
   JSON.parse(manifest).oauthScopes.join(',')!==expected)throw Error('MAIL_SOURCE_MISMATCH');
const digest=createHash('sha256').update(code+'\n'+manifest).digest('hex');
export function selectUnique(files){
 const found=files.filter(f=>f.name===TITLE&&f.mimeType==='application/vnd.google-apps.script'&&f.trashed!==true);
 if(found.length>1)throw Error('DUPLICATE_ISOLATED_PROJECT');
 if(found.length===1&&!found[0].owners?.some(o=>o.emailAddress===OWNER))throw Error('ISOLATED_PROJECT_OWNER_INVALID');
 return found[0]?.id||null;
}
if(!process.argv.includes('--provision')){
 console.log('QA1243_GAS_BOOTSTRAP_DRY_RUN_OK sha256='+digest);
 process.exit(0);
}
if(process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='push')throw Error('TRUSTED_MAIN_ONLY');
for(const k of ['QA1243_GOOGLE_OAUTH_CLIENT_ID','QA1243_GOOGLE_OAUTH_CLIENT_SECRET','QA1243_GOOGLE_OAUTH_REFRESH_TOKEN'])
 if(!process.env[k])throw Error('EXISTING_QA_GOOGLE_CREDENTIAL_MISSING_'+k);
async function get(url,options={}){
 const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
 let payload;try{payload=await response.json()}catch{payload={}};
 if(!response.ok){const code=String(payload.error?.status||'UNKNOWN');throw Error('GOOGLE_HTTP_'+response.status+'_'+(/^[A-Z_]+$/.test(code)?code:'UNKNOWN'));}
 return payload;
}
const token=await get('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:process.env.QA1243_GOOGLE_OAUTH_CLIENT_ID,
 client_secret:process.env.QA1243_GOOGLE_OAUTH_CLIENT_SECRET,
 refresh_token:process.env.QA1243_GOOGLE_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'})});
if(!token.access_token)throw Error('GOOGLE_REFRESH_TOKEN_INVALID');
const auth={Authorization:'Bearer '+token.access_token};
const identity=await get('https://www.googleapis.com/oauth2/v3/userinfo',{headers:auth});
if(identity.email!==OWNER||identity.email_verified!==true)throw Error('QA1243_GOOGLE_ACCOUNT_MISMATCH');
const scopes=await get('https://www.googleapis.com/oauth2/v2/tokeninfo',{method:'POST',
 headers:{'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({access_token:token.access_token})});
assertQa1243RunnerScopes(scopes.scope||'');
const files=[];let next='';
for(let i=0;i<10;i++){
 const q=new URLSearchParams({q:"name = '"+TITLE+"' and mimeType = 'application/vnd.google-apps.script' and trashed = false",
 pageSize:'100',fields:'nextPageToken,files(id,name,mimeType,trashed,owners(emailAddress))'});
 if(next)q.set('pageToken',next);
 const d=await get('https://www.googleapis.com/drive/v3/files?'+q,{headers:auth});
 if(!Array.isArray(d.files))throw Error('DRIVE_SCRIPT_LIST_INVALID');
 files.push(...d.files);
 if(!d.nextPageToken){next='';break;}
 next=d.nextPageToken;
 if(i===9)throw Error('DRIVE_PAGINATION_LIMIT');
}
let id=selectUnique(files),created=false;
const headers={...auth,'Content-Type':'application/json'};
if(!id){const d=await get(API,{method:'POST',headers,body:JSON.stringify({title:TITLE})});id=d.scriptId;created=true;}
if(!/^[A-Za-z0-9_-]{15,}$/.test(id))throw Error('SCRIPT_ID_INVALID');
const project=await get(API+'/'+id,{headers:auth});
if(project.title!==TITLE||project.scriptId!==id)throw Error('WRONG_SCRIPT_OWNER_OR_PROJECT');
await get(API+'/'+id+'/content',{method:'PUT',headers,body:JSON.stringify({files:[
 {name:'Code',type:'SERVER_JS',source:code},{name:'appsscript',type:'JSON',source:manifest}]})});
const uploaded=await get(API+'/'+id+'/content',{headers:auth});
const byName=Object.fromEntries((uploaded.files||[]).map(x=>[x.name,x.source]));
if(byName.Code!==code||byName.appsscript!==manifest||Object.keys(byName).length!==2)
 throw Error('SCRIPT_SOURCE_READBACK_MISMATCH');
const version=await get(API+'/'+id+'/versions',{method:'POST',headers,
 body:JSON.stringify({description:'QA1243 inert MailApp sender, no OAuth send_mail consent'})});
if(!Number.isInteger(version.versionNumber))throw Error('SCRIPT_VERSION_INVALID');
const deployed=await get(API+'/'+id+'/deployments',{method:'POST',headers,
 body:JSON.stringify({versionNumber:version.versionNumber,manifestFileName:'appsscript',description:'QA1243 isolated auth mail inactive'})});
if(!deployed.deploymentId)throw Error('DEPLOYMENT_ID_MISSING');
const detail=await get(API+'/'+id+'/deployments/'+deployed.deploymentId,{headers:auth});
if(detail.deploymentConfig?.versionNumber!==version.versionNumber)throw Error('DEPLOYMENT_READBACK_MISMATCH');
const web=detail.entryPoints?.find(x=>x.entryPointType==='WEB_APP')?.webApp?.url||'';
if(web&&!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(web))throw Error('WEB_APP_URL_INVALID');
const proof={id,created,owner:OWNER,version:version.versionNumber,deploymentId:deployed.deploymentId,url:web,digest,mailSent:false,mailOAuthAuthorized:false,productionAuthHookEnabled:false,operatingSheetsScriptChanged:false};
console.log('QA1243_INACTIVE_MAIL_GAS_DEPLOYED '+JSON.stringify(proof));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
 'QA1243 isolated MailApp bootstrap (no email sent): '+JSON.stringify(proof)+'\n');
