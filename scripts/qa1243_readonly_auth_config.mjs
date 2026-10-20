// #1243: hosted Supabase Auth/SMTP metadata audit, GET ONLY.
// Never print or persist any Supabase Management API token, SMTP addresses, hosts,
// passphrases, URLs containing tokens, or email template contents.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const PROJECT_REF='waluhdgqhwjjwmflhrle';
const expectedSubject='[백억커피] 매장 관리자 계정 초대 안내';
const template=await readFile(new URL('../supabase/email-templates/invite.html',import.meta.url),'utf8');
const secret=process.env.SUPABASE_ACCESS_TOKEN||'';
const result={project:PROJECT_REF,mode:'READ_ONLY_MANAGEMENT_GET',configReadable:false,
  managementCredentialAvailable:Boolean(secret),remoteTemplateMatch:null,remoteInviteSubjectMatch:null,
  smtpHostConfigured:null,smtpPortConfigured:null,smtpUserConfigured:null,smtpPasswordConfigured:null,
  smtpSenderConfigured:null,emailProviderEnabled:null,mailerAutoConfirm:null,signupDisabled:null,
  inviteTtlSeconds:null,externalMailboxDeliveryVerified:false,
  reason:null};
if(!secret){
  result.reason='MANAGEMENT_API_CREDENTIAL_ABSENT';
} else {
  const url='https://api.supabase.com/v1/projects/'+PROJECT_REF+'/config/auth';
  let response;
  try {
    response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+secret,Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(25000)});
  }catch{
    result.reason='MANAGEMENT_GET_NETWORK_OR_AUTH_FAILURE';
  }
  if(response){
    if(!response.ok){
      result.reason='MANAGEMENT_GET_HTTP_'+response.status;
      // Never print server response: it may contain secrets.
    }else{
      const config=await response.json();
      result.configReadable=true;
      result.remoteTemplateMatch=typeof config.mailer_templates_invite_content==='string'
        ?config.mailer_templates_invite_content===template:null;
      result.remoteInviteSubjectMatch=typeof config.mailer_subjects_invite==='string'
        ?config.mailer_subjects_invite===expectedSubject:null;
      const present=(key)=>Object.hasOwn(config,key)?Boolean(config[key]):null;
      result.smtpHostConfigured=present('smtp_host');
      result.smtpPortConfigured=present('smtp_port');
      result.smtpUserConfigured=present('smtp_user');
      result.smtpPasswordConfigured=present('smtp_pass');
      result.smtpSenderConfigured=present('smtp_admin_email');
      result.emailProviderEnabled=Object.hasOwn(config,'external_email_enabled')?config.external_email_enabled===true:null;
      result.mailerAutoConfirm=Object.hasOwn(config,'mailer_autoconfirm')?config.mailer_autoconfirm===true:null;
      result.signupDisabled=Object.hasOwn(config,'disable_signup')?config.disable_signup===true:null;
      result.inviteTtlSeconds=Number.isFinite(Number(config.mailer_otp_exp))?Number(config.mailer_otp_exp):null;
      result.reason='HTTP_200_METADATA_ONLY';
    }
  }
}
const allowed=new Set(Object.keys(result));
if(Object.keys(result).some(k=>!allowed.has(k)))throw Error('Unexpected output key');
console.log('QA1243_READONLY_AUTH_SMTP_CONFIG '+JSON.stringify(result));
console.log('QA1243_LOCAL_INVITE_TEMPLATE_SHA256 '+createHash('sha256').update(template).digest('hex').slice(0,16));
if(!result.configReadable){
  console.log('PENDING_AUTH_CONFIG_READ: hosted Auth/SMTP settings could not be verified; this is not a PASS.');
}
