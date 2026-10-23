// #1243 strict Hosted Auth proof: public auth/settings alone is not mail configuration.
export const HOSTED_AUTH_READ_ACCESS=Object.freeze({project:'waluhdgqhwjjwmflhrle',
 method:'GET',endpoint:'https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth',
 fineGrainedPermission:'auth_config_read',oauthScope:'auth:read',writeAccessRequired:false});
export async function probeHostedAuthManagement(env,expected,fetcher=fetch){
 const dedicated=String(env.SUPABASE_AUTH_READ_TOKEN||'').trim();
 const existing=String(env.SUPABASE_ACCESS_TOKEN||'').trim();
 const token=dedicated||existing;
 const result={configReadable:false,managementCredentialAvailable:Boolean(token),
  managementCredentialSource:dedicated?'SCOPED_AUTH_READ_SECRET':existing?'EXISTING_MANAGEMENT_SECRET':'NONE',
  managementHttpStatus:null,authConfigReadReportedMissing:null,requiredManagementAccess:HOSTED_AUTH_READ_ACCESS,
  remoteTemplateMatch:null,remoteInviteSubjectMatch:null,
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
 return {...result,configReadable:true,reason:'HTTP_200_METADATA_ONLY',
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
    ['HOSTED_SMTP_SENDER_CONFIGURED',s?.smtpSenderConfigured===true]
  ];
  return {ready:checks.every(([,ok])=>ok),passed:checks.filter(([,ok])=>ok).length,
    required:checks.length,failed:checks.filter(([,ok])=>!ok).map(([id])=>id),
    externalMailboxDeliveryVerified:false};
}
