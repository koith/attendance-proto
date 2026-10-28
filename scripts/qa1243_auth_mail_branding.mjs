// Approved email presentation only. Never change SMTP, URLs, Hook or accounts.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const PROJECT='waluhdgqhwjjwmflhrle';
export const LOGO='https://koith.github.io/attendance-proto/logo_combine.jpg';
export const RECOVERY_LINK='https://koith.github.io/attendance-proto/owner_activation.html#type=recovery&amp;token_hash={{ .TokenHash }}';
export const MAIL_KEYS=Object.freeze(['mailer_templates_invite_content','mailer_subjects_invite','mailer_templates_recovery_content','mailer_subjects_recovery']);
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const outside=x=>Object.fromEntries(Object.entries(x).filter(([k])=>!MAIL_KEYS.includes(k)&&k!=='updated_at'));
export function approvedLogoImages(html){
 const images=[...String(html).matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
 return images.length<=1&&images.every(tag=>{
  const sources=[...tag.matchAll(/\ssrc\s*=\s*(["'])(.*?)\1/gi)].map(m=>m[2]);
  return sources.length===1&&sources[0]===LOGO&&!/srcset\s*=|\bon\w+\s*=/i.test(tag);
 });
}
export function mailTarget(invite,recovery){
 for(const [kind,html] of [['invite',invite],['recovery',recovery]]){
  const confirmation=(html.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g)||[]).length;
  const tokenHash=(html.match(/\{\{\s*\.TokenHash\s*\}\}/g)||[]).length;
  const validLink=kind==='invite'?confirmation===1&&tokenHash===0&&html.includes('href="{{ .ConfirmationURL }}"'):
   (confirmation===1&&tokenHash===0&&html.includes('href="{{ .ConfirmationURL }}"'))||
   (confirmation===0&&tokenHash===1&&html.includes('href="'+RECOVERY_LINK+'"'));
  if(!/<html\s+lang="ko"/i.test(html)||!html.includes('백억커피')||
   !html.includes('alt="백억커피"')||!html.includes('src="'+LOGO+'"')||!approvedLogoImages(html)||
   !validLink||/<script\b|<form\b|<iframe\b|\bon\w+\s*=/i.test(html))
   throw Error('BRANDED_MAIL_TEMPLATE_INVALID');
 }
 return {mailer_templates_invite_content:invite,mailer_subjects_invite:'[백억커피] 매장 관리자 계정 초대 안내',
  mailer_templates_recovery_content:recovery,mailer_subjects_recovery:'[백억커피] 계정 인증 및 비밀번호 설정'};
}
export async function applyMailBranding({target,readToken='',writeToken='',fetcher=fetch,apply=false,onBefore=async()=>{}}){
 const report={project:PROJECT,scope:MAIL_KEYS,applied:false,patchAttempted:false,
  readCredentialPresent:!!readToken,writeCredentialPresent:!!writeToken,operatingDataWrite:false};
 try{
  if(hash(target)!==hash(mailTarget(target.mailer_templates_invite_content,target.mailer_templates_recovery_content)))throw Error();
 }catch{return {...report,verified:false,reason:'BRANDED_MAIL_TARGET_SCOPE_REJECTED'};}
 if(!readToken&&!writeToken)return {...report,reason:'MANAGEMENT_READ_CREDENTIAL_ABSENT'};
 const endpoint='https://api.supabase.com/v1/projects/'+PROJECT+'/config/auth';
 const get=async()=>{
  const r=await fetcher(endpoint,{method:'GET',headers:{Authorization:'Bearer '+(readToken||writeToken)},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('AUTH_MAIL_READ_HTTP_'+r.status);
  return r.json();
 };
 try{
  const before=await get();
  if(!before||typeof before!=='object'||MAIL_KEYS.some(k=>!Object.hasOwn(before,k)))throw Error('AUTH_MAIL_PREIMAGE_INCOMPLETE');
  const originalRecovery=String(before.mailer_templates_recovery_content||'');
  if(!originalRecovery||originalRecovery.includes('{{ .ConfirmationURL }}')){
   // Branding must not migrate the live authentication/redirect flow.
   target={...target,mailer_templates_recovery_content:target.mailer_templates_recovery_content.replace(RECOVERY_LINK,'{{ .ConfirmationURL }}')};
   report.recoveryLinkMode='EXISTING_PROVIDER_CONFIRMATION_URL';
  }else if(originalRecovery.includes(RECOVERY_LINK))report.recoveryLinkMode='EXISTING_SAME_ORIGIN_TOKEN_HASH';
  else return {...report,verified:false,reason:'AUTH_MAIL_EXISTING_RECOVERY_LINK_REQUIRES_REVIEW'};
  report.beforeHash=hash(Object.fromEntries(MAIL_KEYS.map(k=>[k,before[k]])));
  const publicBefore=Object.fromEntries(MAIL_KEYS.map(k=>[k,before[k]]));
  const serialized=JSON.stringify(publicBefore);
  if([readToken,writeToken].filter(Boolean).some(token=>serialized.includes(token))||/\b(?:sbp_|sb_secret_|ghp_|github_pat_)[a-zA-Z0-9_]{12,}/.test(serialized))throw Error('AUTH_MAIL_BACKUP_WITHHELD');
  await onBefore(publicBefore);
  report.before={inviteSubject:before.mailer_subjects_invite,recoverySubject:before.mailer_subjects_recovery,
   inviteBranded:before.mailer_templates_invite_content===target.mailer_templates_invite_content,
   recoveryBranded:before.mailer_templates_recovery_content===target.mailer_templates_recovery_content};
  report.fields=Object.fromEntries(MAIL_KEYS.map(k=>[k,before[k]===target[k]?'PASS':'FAIL']));
  if(MAIL_KEYS.every(k=>before[k]===target[k]))return {...report,verified:true,reason:'ALREADY_APPLIED'};
  if(!apply)return {...report,verified:false,reason:'REVIEW_ONLY'};
  if(!writeToken)return {...report,verified:false,reason:'AUTH_CONFIG_WRITE_CREDENTIAL_ABSENT'};
  if(hash(await get())!==hash(before))return {...report,verified:false,reason:'AUTH_CONFIG_CONCURRENT_CHANGE'};
  report.patchAttempted=true;
  const r=await fetcher(endpoint,{method:'PATCH',headers:{Authorization:'Bearer '+writeToken,'Content-Type':'application/json'},
   body:JSON.stringify(target),signal:AbortSignal.timeout(15000)});
  report.patchStatus=r.status;
  if(!r.ok)return {...report,verified:false,reason:'AUTH_MAIL_PATCH_HTTP_'+r.status};
  const after=await get();report.fields=Object.fromEntries(MAIL_KEYS.map(k=>[k,after[k]===target[k]?'PASS':'FAIL']));
  report.otherSettingsUnchanged=hash(outside(before))===hash(outside(after));
  report.verified=MAIL_KEYS.every(k=>after[k]===target[k])&&report.otherSettingsUnchanged;
  report.applied=report.verified;report.reason=report.verified?'AUTH_MAIL_BRANDING_VERIFIED':'AUTH_MAIL_READBACK_MISMATCH';
  return report;
 }catch(e){return {...report,verified:false,reason:/^(AUTH_MAIL_|BRANDED_MAIL_)/.test(String(e.message))?e.message:'AUTH_MAIL_CONNECTION_FAILURE'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const env=process.env;
 await mkdir('qa-results/auth-mail-branding',{recursive:true});
 const target=mailTarget(await readFile('supabase/email-templates/invite.html','utf8'),await readFile('supabase/email-templates/recovery.html','utf8'));
 const writeToken=String(env.SUPABASE_AUTH_WRITE_TOKEN||env.SUPABASE_ACCESS_TOKEN||'').trim();
 const report=await applyMailBranding({target,readToken:String(env.SUPABASE_AUTH_READ_TOKEN||'').trim(),writeToken,
  apply:process.argv.includes('--apply')&&env.QA1243_AUTH_MAIL_BRANDING_APPROVED==='ISSUE_1243_EMAIL_DESIGN_APPROVED',
  onBefore:before=>writeFile('qa-results/auth-mail-branding/mail-fields-before.json',JSON.stringify(before,null,2))});
 await writeFile('qa-results/auth-mail-branding/report.json',JSON.stringify(report,null,2));
 console.log('AUTH_MAIL_BRANDING_RESULT '+JSON.stringify(report));
 if(!report.verified)process.exitCode=2;
}
