// #1243 strict Hosted Auth proof: public auth/settings alone is not mail configuration.
export const HOSTED_AUTH_READ_ACCESS=Object.freeze({project:'waluhdgqhwjjwmflhrle',
 method:'GET',endpoint:'https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth',
 fineGrainedPermission:'auth_config_read',oauthScope:'auth:read',writeAccessRequired:false});
// Repository credentials retain priority. Only an absent credential permits
// checking the EXISTING production environment. Never create an environment or
// bypass custom protection rules incompatible with deployment:false.
export function selectHostedAuthReadContext({dedicatedPresent=false,existingPresent=false,environmentRead=null}={}){
 const result={context:'REPOSITORY',reason:'EXISTING_REPOSITORY_CREDENTIAL',
  environmentReadStatus:null,requiredReviewerGate:false,waitTimerGate:false};
 if(dedicatedPresent||existingPresent)return result;
 const status=Number.isInteger(environmentRead?.status)?environmentRead.status:null;
 result.environmentReadStatus=status;
 if(status!==200)return {...result,reason:status===404?'EXISTING_ENVIRONMENT_NOT_FOUND':
  status===401||status===403?'ENVIRONMENT_METADATA_READ_DENIED':'ENVIRONMENT_METADATA_UNVERIFIED'};
 const config=environmentRead.data;
 if(config?.name!=='production'||!Array.isArray(config.protection_rules))
  return {...result,reason:'ENVIRONMENT_METADATA_UNVERIFIED'};
 const supported=new Set(['required_reviewers','wait_timer','branch_policy']);
 if(config.protection_rules.some(rule=>!supported.has(rule?.type)))
  return {...result,reason:'ENVIRONMENT_CUSTOM_OR_UNKNOWN_PROTECTION_PRESERVED'};
 return {...result,context:'EXISTING_PRODUCTION',reason:'NO_REPOSITORY_CREDENTIAL_EXISTING_ENVIRONMENT_CONFIRMED',
  requiredReviewerGate:config.protection_rules.some(rule=>rule.type==='required_reviewers'),
  waitTimerGate:config.protection_rules.some(rule=>rule.type==='wait_timer')};
}
export const HOSTED_INVITATION_URLS=Object.freeze({
 siteUrls:Object.freeze(['https://koith.github.io/attendance-proto/',
  'https://koith.github.io/attendance-proto/index.html']),
 activationUrl:'https://koith.github.io/attendance-proto/owner_activation.html'});
// Diagnose default mailer versus an existing Send Email Hook without exposing
// any provider URI, credentials, addresses, remote templates or remote URLs.
// Null/missing fields are unknown; they must never prove a default mail path.
export function diagnoseHostedAuthConfig(config,expected){
 const present=key=>Object.hasOwn(config,key)?
  typeof config[key]==='string'?config[key].trim().length>0:config[key]===null?false:Boolean(config[key]):null;
 const state=(value,wanted)=>value==null?'UNREPORTED':typeof value!=='string'?'UNREPORTED':
  value===wanted?'EXPECTED_EXACT':!value.trim()?'EMPTY_PROVIDER_DEFAULT':'DIFFERENT';
 const hookEnabled=typeof config.hook_send_email_enabled==='boolean'?config.hook_send_email_enabled:null;
 const hookUriConfigured=present('hook_send_email_uri'),smtpHost=present('smtp_host');
 let siteUrlClass='UNREPORTED';
 if(typeof config.site_url==='string'){
  if(!config.site_url.trim())siteUrlClass='EMPTY';
  else try{
   const u=new URL(config.site_url.trim());
   siteUrlClass=u.username||u.password||u.search||u.hash?'UNSAFE_COMPONENTS':
    HOSTED_INVITATION_URLS.siteUrls.includes(u.href)?'APP_PRODUCTION':
    ['localhost','127.0.0.1','[::1]'].includes(u.hostname)?'LOOPBACK':
    u.protocol==='https:'?'OTHER_HTTPS':'NON_HTTPS';
  }catch{siteUrlClass='INVALID';}
 }
 return {inviteTemplateState:state(config.mailer_templates_invite_content,expected.template),
  inviteSubjectState:state(config.mailer_subjects_invite,expected.subject),siteUrlClass,
  redirectAllowListEntryCount:typeof config.uri_allow_list==='string'?
   config.uri_allow_list.split(',').filter(x=>x.trim()).length:null,
  sendEmailHookEnabled:hookEnabled,sendEmailHookUriConfigured:hookUriConfigured,
  emailDeliveryMode:hookEnabled===true?hookUriConfigured===true?'SEND_EMAIL_HOOK':'HOOK_ENABLED_UNVERIFIED':
   hookEnabled===false?smtpHost===true?'CUSTOM_SMTP':smtpHost===false?'DEFAULT_SUPABASE_MAILER':'UNVERIFIED':
   'HOOK_STATE_UNVERIFIED'};
}
// Reviewable instructions only, never a PATCH payload or a write-capable path.
// Existing redirect entries must survive an approved future change verbatim.
export function buildHostedAuthRepairPlan(s){
 const changes=[];
 if(s?.remoteTemplateMatch===false)changes.push({field:'mailer_templates_invite_content',
  operation:'USE_VERSIONED_KOREAN_TEMPLATE',source:'supabase/email-templates/invite.html'});
 if(s?.remoteInviteSubjectMatch===false)changes.push({field:'mailer_subjects_invite',
  operation:'USE_KOREAN_INVITE_SUBJECT',value:'[백억커피] 매장 관리자 계정 초대 안내'});
 if(s?.siteUrlProductionMatch===false)changes.push({field:'site_url',operation:'SET_APPROVED_APP_DEFAULT',
  value:HOSTED_INVITATION_URLS.siteUrls[0]});
 if(s?.activationRedirectAllowed===false)changes.push({field:'uri_allow_list',
  operation:'APPEND_EXACT_CALLBACK_PRESERVE_ALL_EXISTING_ENTRIES',value:HOSTED_INVITATION_URLS.activationUrl});
 const delivery=s?.emailDeliveryMode;
 const smtpRepair=s?.smtpHostConfigured===false||s?.smtpSenderConfigured===false;
 return {mode:'REVIEW_ONLY_NO_MUTATIONS',configReadable:s?.configReadable===true,
  changes,operationalApprovalRequired:changes.length>0||smtpRepair,
  futureWritePermission:changes.length||smtpRepair?'auth_config_write':null,
  readSecretMustRemainReadOnly:true,preserveExistingRedirects:true,preserveOtherAuthPolicies:true,
  deliveryAction:delivery==='DEFAULT_SUPABASE_MAILER'?'APPROVED_CUSTOM_PROVIDER_AND_VERIFIED_SENDER_REQUIRED':
   delivery==='SEND_EMAIL_HOOK'?'REVIEW_EXISTING_HOOK_DELIVERY_AND_KOREAN_CONTENT':
   delivery==='CUSTOM_SMTP'?'VERIFY_APPROVED_MAILBOX_DELIVERY':'READ_DELIVERY_CONFIGURATION_BEFORE_CHANGE',
  unknownsRemainBlocking:s?.configReadable!==true||delivery==='HOOK_STATE_UNVERIFIED'||delivery==='UNVERIFIED'||delivery==='HOOK_ENABLED_UNVERIFIED',
  rollback:'PRIVATELY_PRESERVE_EXACT_CHANGED_FIELDS_BEFORE_APPROVED_APPLY_AND_RESTORE_ON_FAILURE',
  mailSent:false,accountsChanged:false};
}
// No remote URLs leave this function. GoTrue permits a redirect with the same
// scheme/host/port as Site URL even without an additional allow-list entry.
// Do not mistake a supported wildcard for an exact match or a confirmed failure.
export function assessHostedInvitationUrls(config){
 const safeUrl=value=>{
  if(typeof value!=='string'||!value.trim())return null;
  try{const u=new URL(value.trim());
   return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash?u:null;
  }catch{return null;}
 };
 const site=safeUrl(config?.site_url),activation=new URL(HOSTED_INVITATION_URLS.activationUrl);
 const raw=config?.uri_allow_list;
 const entries=typeof raw==='string'?raw.split(',').map(x=>x.trim()).filter(Boolean):[];
 const exact=entries.includes(activation.href);
 const sameOrigin=site?.origin===activation.origin;
 const unverifiedPattern=entries.some(x=>/[*?\[\]{}\\]/.test(x));
 return {siteUrlProductionMatch:site!==null&&HOSTED_INVITATION_URLS.siteUrls.includes(site.href),
  activationRedirectAllowed:sameOrigin||exact?true:unverifiedPattern?null:false,
  activationRedirectSource:sameOrigin?'SITE_ORIGIN':exact?'EXACT_ALLOW_LIST':
   unverifiedPattern?'PATTERN_REQUIRES_REVIEW':'NOT_VERIFIED',
  activationRedirectExactListed:typeof raw==='string'?exact:null};
}
export async function probeHostedAuthManagement(env,expected,fetcher=fetch){
 const dedicated=String(env.SUPABASE_AUTH_READ_TOKEN||'').trim();
 const existing=String(env.SUPABASE_ACCESS_TOKEN||'').trim();
 const token=dedicated||existing;
 const result={configReadable:false,managementCredentialAvailable:Boolean(token),
  managementCredentialSource:dedicated?'SCOPED_AUTH_READ_SECRET':existing?'EXISTING_MANAGEMENT_SECRET':'NONE',
  managementHttpStatus:null,authConfigReadReportedMissing:null,requiredManagementAccess:HOSTED_AUTH_READ_ACCESS,
  remoteTemplateMatch:null,remoteInviteSubjectMatch:null,
  siteUrlProductionMatch:null,activationRedirectAllowed:null,
  activationRedirectSource:'UNREAD',activationRedirectExactListed:null,
  smtpHostConfigured:null,smtpPortConfigured:null,smtpUserConfigured:null,smtpPasswordConfigured:null,
  smtpSenderConfigured:null,emailProviderEnabled:null,mailerAutoConfirm:null,signupDisabled:null,inviteTtlSeconds:null,
  reason:'MANAGEMENT_API_CREDENTIAL_ABSENT'};
 if(!token)return result;
 let response;
 try{response=await fetcher(HOSTED_AUTH_READ_ACCESS.endpoint,{method:'GET',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(25000)});}
 catch{return {...result,reason:'MANAGEMENT_GET_NETWORK_FAILURE'};}
 result.managementHttpStatus=response.status;
 if(!response.ok){
  result.reason=response.status===401?'MANAGEMENT_CREDENTIAL_REJECTED':
   response.status===403?'MANAGEMENT_AUTH_CONFIG_READ_DENIED':'MANAGEMENT_GET_HTTP_'+response.status;
  if(response.status===403){
   try{const body=await response.json();
    result.authConfigReadReportedMissing=Array.isArray(body?.missing_permissions)?
     body.missing_permissions.some(x=>x==='auth_config_read'||x==='auth:read'):null;
   }catch{/* Provider bodies and credential values are never returned or logged. */}
  }
  // A denied dedicated token must not silently retry with a broader token.
  return result;
 }
 let config;
 try{config=await response.json();}catch{return {...result,reason:'MANAGEMENT_CONFIG_JSON_INVALID'};}
 if(!config||typeof config!=='object'||Array.isArray(config))return {...result,reason:'MANAGEMENT_CONFIG_JSON_INVALID'};
 const present=key=>Object.hasOwn(config,key)?
  typeof config[key]==='string'?config[key].trim().length>0:Boolean(config[key]):null;
 return {...result,configReadable:true,reason:'HTTP_200_METADATA_ONLY',...assessHostedInvitationUrls(config),
  ...diagnoseHostedAuthConfig(config,expected),
  remoteTemplateMatch:typeof config.mailer_templates_invite_content==='string'?config.mailer_templates_invite_content===expected.template:null,
  remoteInviteSubjectMatch:typeof config.mailer_subjects_invite==='string'?config.mailer_subjects_invite===expected.subject:null,
  smtpHostConfigured:present('smtp_host'),smtpPortConfigured:present('smtp_port'),smtpUserConfigured:present('smtp_user'),
  smtpPasswordConfigured:present('smtp_pass'),smtpSenderConfigured:present('smtp_admin_email'),
  emailProviderEnabled:typeof config.external_email_enabled==='boolean'?config.external_email_enabled:null,
  mailerAutoConfirm:typeof config.mailer_autoconfirm==='boolean'?config.mailer_autoconfirm:null,
  signupDisabled:typeof config.disable_signup==='boolean'?config.disable_signup:null,
  inviteTtlSeconds:typeof config.mailer_otp_exp==='number'&&Number.isFinite(config.mailer_otp_exp)&&config.mailer_otp_exp>0?config.mailer_otp_exp:null};
}
export function assessHostedInviteConfig(s){
  const checks=[
    ['MANAGEMENT_CONFIG_READABLE',s?.configReadable===true],
    ['HOSTED_KOREAN_INVITE_HTML_MATCH',s?.remoteTemplateMatch===true],
    ['HOSTED_KOREAN_INVITE_SUBJECT_MATCH',s?.remoteInviteSubjectMatch===true],
    ['HOSTED_EMAIL_PROVIDER_ENABLED',s?.emailProviderEnabled===true],
    ['HOSTED_SMTP_HOST_CONFIGURED',s?.smtpHostConfigured===true],
    ['HOSTED_SMTP_SENDER_CONFIGURED',s?.smtpSenderConfigured===true],
    ['HOSTED_SITE_URL_PRODUCTION',s?.siteUrlProductionMatch===true],
    ['HOSTED_ACTIVATION_REDIRECT_ALLOWED',s?.activationRedirectAllowed===true]
  ];
  return {ready:checks.every(([,ok])=>ok),passed:checks.filter(([,ok])=>ok).length,
    required:checks.length,failed:checks.filter(([,ok])=>!ok).map(([id])=>id),
    externalMailboxDeliveryVerified:false};
}
