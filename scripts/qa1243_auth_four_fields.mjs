// #1243: review/apply ONLY the four user-authorized public Auth config fields.
// Default CLI/workflow operation is REVIEW. Explicit trusted-main approval can
// apply the four fields. No SMTP/account/session
// settings, users, invitations, SQL, Sheets or deployment APIs are touched.
import {createHash} from 'node:crypto';
import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {approvedLogoImages} from './qa1243_auth_mail_branding.mjs';
import {HOSTED_AUTH_READ_ACCESS,HOSTED_INVITATION_URLS,assessHostedInviteConfig,
 assessHostedInvitationUrls} from './qa1243_auth_config_verdict.mjs';

export const FOUR_FIELDS=Object.freeze(['mailer_templates_invite_content','mailer_subjects_invite','site_url','uri_allow_list']);
export const INVITE_SUBJECT='[백억커피] 매장 관리자 계정 초대 안내';
export const APPLY_SCOPE='ISSUE_1243_APPROVED_FOUR_FIELDS';
export const APPLY_MARKER='[QA1243-AUTH-FOUR-FIELDS-APPLY]';
export const APPROVED_BEFORE_SHA256='d98d4b91f99b92b6fea05732eb90421ccfbad0088281d0309a20fe2b815c5f62';
// This is operation authorization, separate from whether a usable credential
// exists. PRs/other branches never arm an apply, even with the same text.
export function fourFieldExecution({eventName,ref,message='',operation='REVIEW',beforeSha=''}={}){
 if(ref!=='refs/heads/main')return {mode:'REVIEW',reason:'TRUSTED_MAIN_REQUIRED',beforeSha:null};
 if(eventName==='push'&&String(message).includes(APPLY_MARKER))
  return {mode:'APPLY',reason:'USER_APPROVED_FOUR_FIELDS_MAIN_MARKER',beforeSha:APPROVED_BEFORE_SHA256};
 if(eventName==='workflow_dispatch'&&operation==='APPLY'){
  const sha=String(beforeSha||APPROVED_BEFORE_SHA256);
  return /^[a-f0-9]{64}$/.test(sha)?{mode:'APPLY',reason:'EXPLICIT_FOUR_FIELD_DISPATCH',beforeSha:sha}:
   {mode:'BLOCKED',reason:'APPROVED_PREIMAGE_INVALID',beforeSha:null};
 }
 return {mode:'REVIEW',reason:'NO_EXPLICIT_APPLY_OPERATION',beforeSha:null};
}
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(sorted(v))).digest('hex');
const rest=config=>Object.fromEntries(Object.entries(config).filter(([k])=>!FOUR_FIELDS.includes(k)));
const same=(a,b)=>digest(a)===digest(b);
function fail(code){throw new Error(code);}

export function validateKoreanTemplate(html){
 if(typeof html!=='string'||!/<html\s+lang="ko"/i.test(html)||!html.includes('백억커피')||
  !html.includes('계정 활성화')||(html.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g)||[]).length!==1||
  !html.includes('href="{{ .ConfirmationURL }}"')||!approvedLogoImages(html)||/<script\b|<iframe\b|<form\b|\bon\w+\s*=/i.test(html))
  fail('VERSIONED_KOREAN_TEMPLATE_INVALID');
}
function four(config){
 if(!config||typeof config!=='object'||Array.isArray(config))fail('AUTH_CONFIG_OBJECT_REQUIRED');
 return Object.fromEntries(FOUR_FIELDS.map(k=>{
  if(!Object.hasOwn(config,k)||(config[k]!==null&&typeof config[k]!=='string'))fail('FOUR_FIELD_PREIMAGE_UNREPORTED');
  return [k,config[k]];
 }));
}
function assertPublicReview(config,values,credentials){
 const serialized=JSON.stringify(values);
 const privateValues=[...credentials,...Object.entries(config).filter(([k])=>/pass|secret/i.test(k)).map(([,v])=>v)]
  .filter(v=>typeof v==='string'&&v.length>=8);
 if(serialized.length>50000||privateValues.some(v=>serialized.includes(v))||
  /\b(?:sbp_|sb_secret_|github_pat_|ghp_)[a-zA-Z0-9_]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(serialized))
  fail('PUBLIC_FOUR_FIELD_REVIEW_WITHHELD_SENSITIVE_CONTENT');
 // Reject literal URL credentials/tokens, allowing Go template placeholders.
 const withoutPlaceholders=serialized.replace(/\{\{[\s\S]*?\}\}/g,'PLACEHOLDER');
 if(/(?:access_token|refresh_token|token_hash|token|api_key|apikey|password|secret)=(?!PLACEHOLDER)[^&\s"<>\\]+/i.test(withoutPlaceholders))
  fail('PUBLIC_FOUR_FIELD_REVIEW_WITHHELD_TOKEN_URL');
 for(const value of [values.site_url,...String(values.uri_allow_list||'').split(',')].filter(Boolean)){
  let url;try{url=new URL(value.trim());}catch{fail('PUBLIC_FOUR_FIELD_REVIEW_WITHHELD_INVALID_URL');}
  if(url.username||url.password||url.search||url.hash)fail('PUBLIC_FOUR_FIELD_REVIEW_WITHHELD_PRIVATE_URL');
 }
}
export function buildFourFieldReview(config,html,credentials=[]){
 validateKoreanTemplate(html);
 const before=four(config);assertPublicReview(config,before,credentials);
 const original=before.uri_allow_list;
 const listed=String(original||'').split(',').map(x=>x.trim());
 const callback=HOSTED_INVITATION_URLS.activationUrl;
 const redirect=listed.includes(callback)?original:!String(original||'').trim()?callback:
  original+(original.trimEnd().endsWith(',')?'':',')+callback;
 const after={mailer_templates_invite_content:html,mailer_subjects_invite:INVITE_SUBJECT,
  site_url:HOSTED_INVITATION_URLS.siteUrls[0],uri_allow_list:redirect};
 assertPublicReview(config,after,credentials);
 return {project:HOSTED_AUTH_READ_ACCESS.project,mode:'PUBLIC_FOUR_FIELDS_ONLY',before,after,
  changedFields:FOUR_FIELDS.filter(k=>before[k]!==after[k]),beforeSha256:digest(before),afterSha256:digest(after),
  protectedOtherFieldsSha256:digest(rest(config)),preserveExistingRedirectEntries:true,
  smtpChangeAllowed:false,accountsChangeAllowed:false,mailSent:false};
}
export function configVerdict(config,html){
 return assessHostedInviteConfig({configReadable:true,
  remoteTemplateMatch:config.mailer_templates_invite_content===html,
  remoteInviteSubjectMatch:config.mailer_subjects_invite===INVITE_SUBJECT,
  emailProviderEnabled:config.external_email_enabled===true,
  smtpHostConfigured:typeof config.smtp_host==='string'&&!!config.smtp_host.trim(),
  smtpSenderConfigured:typeof config.smtp_admin_email==='string'&&!!config.smtp_admin_email.trim(),
  ...assessHostedInvitationUrls(config)});
}
async function request(fetcher,token,method,body){
 if(!token)fail(method==='GET'?'EXISTING_READ_CREDENTIAL_ABSENT':'EXISTING_WRITE_CREDENTIAL_ABSENT');
 let response;
 try{response=await fetcher(HOSTED_AUTH_READ_ACCESS.endpoint,{method,
  headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(25000)});}
 catch{fail('AUTH_CONFIG_'+method+'_NETWORK_FAILURE');}
 if(!response.ok)fail('AUTH_CONFIG_'+method+'_HTTP_'+response.status);
 if(method!=='GET')return;
 let data;try{data=await response.json();}catch{fail('AUTH_CONFIG_GET_JSON_INVALID');}
 if(!data||typeof data!=='object'||Array.isArray(data))fail('AUTH_CONFIG_GET_JSON_INVALID');
 return data;
}
export async function runFourFields({readToken,readOnlyToken='',writeToken='',html,apply=false,
 scope='',expectedBeforeSha256='',fetcher=fetch}={}){
 const initial=await request(fetcher,readToken,'GET');
 const review=buildFourFieldReview(initial,html,[readToken,writeToken]);
 const result={status:'REVIEW_ONLY',applied:false,patchAttempted:false,review,verdict:configVerdict(initial,html)};
 if(!apply)return result;
 if(scope!==APPLY_SCOPE)return {...result,status:'FOUR_FIELD_OPERATIONAL_SCOPE_NOT_AUTHORIZED'};
 // Already-correct values require no mutation authority or old preimage.
 // This verifies only the four fields; SMTP/mailbox checks remain independent.
 if(!review.changedFields.length)return {...result,status:'NO_CHANGE_VERIFIED'};
 if(!writeToken)return {...result,status:'EXISTING_WRITE_CREDENTIAL_ABSENT'};
 if(readOnlyToken&&writeToken===readOnlyToken)return {...result,status:'READ_ONLY_CREDENTIAL_CANNOT_BE_PROMOTED'};
 if(!/^[a-f0-9]{64}$/.test(expectedBeforeSha256)||expectedBeforeSha256!==review.beforeSha256)
  return {...result,status:'APPROVED_PREIMAGE_MISSING_OR_CHANGED'};
 // Re-read immediately before a partial update. No auto retry with broader auth.
 const current=await request(fetcher,readToken,'GET');
 if(!same(current,initial))return {...result,status:'CONCURRENT_CONFIG_CHANGE_NO_WRITE'};
 const patch=Object.fromEntries(review.changedFields.map(k=>[k,review.after[k]]));
 result.patchAttempted=true;
 let patchError=null;
 try{await request(fetcher,writeToken,'PATCH',patch);}catch(error){patchError=error.message;}
 let actual;
 try{actual=await request(fetcher,readToken,'GET');}
 catch{return {...result,status:'APPLY_RESULT_UNVERIFIED',patchError};}
 const observed=four(actual),protectedMatch=digest(rest(actual))===review.protectedOtherFieldsSha256;
 if(same(observed,review.after)&&protectedMatch)
  return {...result,status:'APPLIED_VERIFIED',applied:true,patchError,verdict:configVerdict(actual,html),protectedOtherFieldsUnchanged:true};
 if(!protectedMatch)return {...result,status:'NON_TARGET_CONFIG_DRIFT_REQUIRES_REVIEW',patchError};
 if(same(observed,review.before))return {...result,status:'WRITE_NOT_APPLIED',patchError};
 if(FOUR_FIELDS.some(k=>observed[k]!==review.before[k]&&observed[k]!==review.after[k]))
  return {...result,status:'CONCURRENT_FOUR_FIELD_CHANGE_NO_ROLLBACK',patchError};
 // Restore only our changed, recognizable field values, never SMTP or policies.
 const undo=Object.fromEntries(FOUR_FIELDS.filter(k=>observed[k]!==review.before[k]).map(k=>[k,review.before[k]]));
 try{
  await request(fetcher,writeToken,'PATCH',undo);
  const restored=await request(fetcher,readToken,'GET');
  if(same(four(restored),review.before)&&digest(rest(restored))===review.protectedOtherFieldsSha256)
   return {...result,status:'APPLY_FAILED_ROLLED_BACK',rollbackVerified:true,patchError};
 }catch{/* Never print provider errors, bearer tokens, or full config. */}
 return {...result,status:'ROLLBACK_UNVERIFIED_REQUIRES_REVIEW',patchError};
}
async function main(){
 const html=await readFile(new URL('../supabase/email-templates/invite.html',import.meta.url),'utf8');
 const env=process.env,dedicated=String(env.SUPABASE_AUTH_READ_TOKEN||'').trim();
 const legacy=String(env.SUPABASE_ACCESS_TOKEN||'').trim();
 const apply=process.argv.includes('--apply');
 const result=await runFourFields({html,readToken:dedicated||legacy,readOnlyToken:dedicated,
  writeToken:String(env.SUPABASE_AUTH_WRITE_TOKEN||'').trim()||legacy,apply,
  scope:env.QA1243_AUTH_FOUR_FIELD_SCOPE,expectedBeforeSha256:env.QA1243_AUTH_EXPECTED_BEFORE_SHA256});
 console.log('QA1243_AUTH_PUBLIC_FOUR_FIELD_RESULT '+JSON.stringify(result));
 if(process.argv.includes('--github-output')&&env.GITHUB_OUTPUT)
  await appendFile(env.GITHUB_OUTPUT,'result_status='+result.status+'\nverified_fields='+
   ['APPLIED_VERIFIED','NO_CHANGE_VERIFIED'].includes(result.status)+'\npatch_attempted='+result.patchAttempted+'\n');
 if(apply&&!['APPLIED_VERIFIED','NO_CHANGE_VERIFIED'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(error=>{console.error('QA1243_AUTH_FOUR_FIELD_ERROR '+
  (/^[A-Z0-9_]+$/.test(error.message)?error.message:'UNEXPECTED_ERROR_DETAILS_SUPPRESSED'));process.exitCode=1;});
