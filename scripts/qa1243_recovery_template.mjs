// QA1243: apply ONLY official Supabase Auth recovery email subject + HTML.
// No SMTP, Auth users, secrets, URL configuration, session, database, or Sheets writes.
// Secret tokens and remote templates must never enter logs or artifacts.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const ENDPOINT='https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth';
const PUBLIC_ORIGIN='https://koith.github.io/attendance-proto/owner_activation.html';
const AUTH_URL='https://waluhdgqhwjjwmflhrle.supabase.co';
export const FIELDS=Object.freeze(['mailer_templates_recovery_content','mailer_subjects_recovery']);
export const DESIRED_SUBJECT='[백억커피] 비밀번호 설정 인증번호 {{ .Token }}';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(([k,x])=>[k,sorted(x)])):v;
const digest=v=>sha(sorted(v));
export function validateRecoveryTemplate(html){
 if(typeof html!=='string'||html.length>20000||
    !/<html\s+lang="ko">/i.test(html)||
    (html.match(/\{\{\s*\.TokenHash\s*\}\}/g)||[]).length!==1||
    !html.includes('href="'+PUBLIC_ORIGIN+'#type=recovery&amp;token_hash={{ .TokenHash }}"')||
    /{{\s*\.ConfirmationURL\s*}}/.test(html)||
    new RegExp('<(?:script|iframe|form|img)\\b|\\bon(?:load|click|error)\\s*=','i').test(html)||
    !html.includes('백억커피'))
  throw Error('RECOVERY_TEMPLATE_INVALID');
}
export function validateSubject(subject=DESIRED_SUBJECT){
 if(subject!==DESIRED_SUBJECT||!subject.includes('{{ .Token }}')||subject.length>100)
  throw Error('RECOVERY_SUBJECT_INVALID');
}
export function planRecoveryConfig(config,html){
 validateRecoveryTemplate(html);validateSubject();
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('AUTH_CONFIG_INVALID');
 if(!FIELDS.every(k=>Object.hasOwn(config,k)&&
      (config[k]===null||typeof config[k]==='string')))
  throw Error('RECOVERY_PREIMAGE_NOT_READABLE');
 const before=Object.fromEntries(FIELDS.map(k=>[k,config[k]]));
 const after={mailer_templates_recovery_content:html,mailer_subjects_recovery:DESIRED_SUBJECT};
 const patch=Object.fromEntries(FIELDS.filter(k=>before[k]!==after[k]).map(k=>[k,after[k]]));
 const protectedFields=Object.fromEntries(Object.entries(config).filter(([k])=>!FIELDS.includes(k)));
 return {before,after,patch,protectedFingerprint:digest(protectedFields),
  changedFields:Object.keys(patch)};
}
async function authRequest(method,token,body,transport=fetch){
 if(!token)throw Error(method==='GET'?'RECOVERY_AUTH_READ_CREDENTIAL_ABSENT':'RECOVERY_AUTH_WRITE_CREDENTIAL_ABSENT');
 let result;
 try{
  result=await transport(ENDPOINT,{method,redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(25000)});
 }catch{throw Error('RECOVERY_AUTH_NETWORK_ERROR');}
 if(!result.ok)throw Error('RECOVERY_AUTH_'+method+'_HTTP_'+result.status);
 if(method==='PATCH')return true;
 try{return await result.json();}catch{throw Error('RECOVERY_AUTH_CONFIG_JSON_INVALID');}
}
export async function applyRecoveryConfig({readToken='',writeToken='',html,apply=false,transport=fetch}){
 validateRecoveryTemplate(html);
 if(!readToken)return {status:'RECOVERY_AUTH_READ_CREDENTIAL_ABSENT',applied:false};
 let initial;
 try{initial=await authRequest('GET',readToken,undefined,transport);}
 catch(error){return {status:String(error.message),applied:false};}
 let plan;
 try{plan=planRecoveryConfig(initial,html);}
 catch(error){return {status:String(error.message),applied:false};}
 const metadata={changedFields:plan.changedFields,scope:FIELDS,applied:false};
 if(!plan.changedFields.length)return {...metadata,status:'RECOVERY_ALREADY_APPLIED_VERIFIED',applied:true};
 if(!apply)return {...metadata,status:'RECOVERY_READ_ONLY_REVIEW'};
 if(!writeToken)return {...metadata,status:'RECOVERY_AUTH_WRITE_CREDENTIAL_ABSENT'};
 let current;
 try{current=await authRequest('GET',readToken,undefined,transport);}
 catch(error){return {...metadata,status:'RECOVERY_PREWRITE_READ_FAILED'};}
 if(digest(current)!==digest(initial))
  return {...metadata,status:'RECOVERY_CONCURRENT_CHANGE_NO_WRITE'};
 try{await authRequest('PATCH',writeToken,plan.patch,transport);}
 catch(error){return {...metadata,status:String(error.message)};}
 let observed;
 try{observed=await authRequest('GET',readToken,undefined,transport);}
 catch{return {...metadata,status:'RECOVERY_AFTER_WRITE_UNVERIFIED'};}
 const actualFields=Object.fromEntries(FIELDS.map(k=>[k,observed[k]]));
 const other=Object.fromEntries(Object.entries(observed).filter(([k])=>!FIELDS.includes(k)));
 if(digest(other)!==plan.protectedFingerprint)
  return {...metadata,status:'RECOVERY_PROTECTED_AUTH_CONFIG_DRIFT'};
 if(digest(actualFields)!==digest(plan.after))
  return {...metadata,status:'RECOVERY_AFTER_WRITE_MISMATCH'};
 return {...metadata,status:'RECOVERY_TEMPLATE_APPLIED_VERIFIED',applied:true};
}
async function main(){
 const html=await readFile(new URL('../supabase/email-templates/recovery.html',import.meta.url),'utf8');
 const env=process.env;
 const readToken=String(env.SUPABASE_AUTH_READ_TOKEN||env.SUPABASE_ACCESS_TOKEN||'').trim();
 const writeToken=String(env.SUPABASE_AUTH_WRITE_TOKEN||env.SUPABASE_ACCESS_TOKEN||'').trim();
 const apply=process.argv.includes('--apply');
 const result=await applyRecoveryConfig({readToken,writeToken,html,apply});
 console.log('QA1243_ONE_CLICK_RECOVERY_CONFIG '+JSON.stringify(result));
 if(apply&&!result.applied)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(error=>{console.error('QA1243_ONE_CLICK_RECOVERY_ERROR '+(/^[A-Z0-9_]+$/.test(error.message)?error.message:'DETAILS_REDACTED'));process.exitCode=1;});
