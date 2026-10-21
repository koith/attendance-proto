// #1243: hosted Supabase Auth/SMTP metadata audit, GET ONLY.
// Never print or persist any Supabase Management API token, SMTP addresses, hosts,
// passphrases, URLs containing tokens, or email template contents.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assessHostedInviteConfig} from './qa1243_auth_config_verdict.mjs';

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
// Fallback: public GoTrue /settings, using ONLY the same public anon key already
// embedded in the deployed browser app. This endpoint does NOT expose SMTP
// host/password/template or mail delivery. Never log the anon JWT itself.
result.publicAuthSettingsHttpStatus=null;
result.publicAuthSettingsReadable=false;
result.publicSignupDisabled=null;
result.publicEmailSignupEnabled=null;
result.publicExternalEmailConfigured=null;
try {
  const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const match=index.match(/SUPABASE_ANON_KEY:\s*["']([^"']+)["']/);
  if(!match) result.publicSettingsReason='APP_PUBLIC_ANON_KEY_NOT_FOUND';
  else {
    const res=await fetch('https://waluhdgqhwjjwmflhrle.supabase.co/auth/v1/settings',{
      method:'GET',headers:{apikey:match[1],Authorization:'Bearer '+match[1],Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(25000)});
    result.publicAuthSettingsHttpStatus=res.status;
    if(res.ok){
      const publicSettings=await res.json();
      result.publicAuthSettingsReadable=true;
      result.publicSignupDisabled=typeof publicSettings.disable_signup==='boolean'?publicSettings.disable_signup:null;
      result.publicEmailSignupEnabled=typeof publicSettings.external?.email==='boolean'?publicSettings.external.email:null;
      result.publicExternalEmailConfigured=typeof publicSettings.external?.email==='boolean'?publicSettings.external.email:null;
      result.publicSettingsReason='HTTP_200_PUBLIC_METADATA';
    }else result.publicSettingsReason='AUTH_SETTINGS_HTTP_'+res.status;
  }
}catch{result.publicSettingsReason='AUTH_SETTINGS_NETWORK_ERROR'}
const allowed=new Set(Object.keys(result));
if(Object.keys(result).some(k=>!allowed.has(k)))throw Error('Unexpected output key');
console.log('QA1243_READONLY_AUTH_SMTP_CONFIG '+JSON.stringify(result));
console.log('QA1243_LOCAL_INVITE_TEMPLATE_SHA256 '+createHash('sha256').update(template).digest('hex').slice(0,16));
const assessment=assessHostedInviteConfig(result);
console.log('QA1243_HOSTED_INVITE_CONFIG_VERDICT '+JSON.stringify(assessment));
if(!assessment.ready){
  console.log('NO_GO_HOSTED_AUTH_CONFIG: Korean invite template, subject, provider and SMTP have not all been verified.');
  process.exitCode=1;
}
