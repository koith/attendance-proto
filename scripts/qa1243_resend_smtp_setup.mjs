#!/usr/bin/env node
// Existing AUTH-01: verified Resend SMTP -> Hosted Supabase Auth, with Korean invitation.
// This script is inert by default. Never print provider or management credentials.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const PROJECT='waluhdgqhwjjwmflhrle';
const AUTH_URL=`https://api.supabase.com/v1/projects/${PROJECT}/config/auth`;
const RESEND_URL='https://api.resend.com/domains?limit=100';
export const INVITE_SUBJECT='[백억커피] 매장 관리자 계정 초대 안내';
export const RESEND_SMTP=Object.freeze({smtp_host:'smtp.resend.com',smtp_port:'465',smtp_user:'resend',smtp_sender_name:'백억커피'});

function fail(code){throw Error(code);}
function requireConfigured(value,code){
  if(typeof value!=='string'||!value.trim())fail(code);
  return value.trim();
}
export function validateSenderDomain(raw){
  const domain=requireConfigured(raw,'RESEND_DOMAIN_MISSING').toLowerCase();
  if(domain.length>253||!domain.includes('.')||!domain.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)))
    fail('RESEND_DOMAIN_INVALID');
  const tld=domain.split('.').at(-1);
  if(!/^[a-z]{2,63}$/.test(tld))fail('RESEND_DOMAIN_TLD_INVALID');
  return domain;
}
export function checkKoreanInvitation(html){
  if(typeof html!=='string'||!/<html\s+lang="ko"/i.test(html)||!html.includes('백억커피')||
      (html.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g)||[]).length!==1||
      !html.includes('href="{{ .ConfirmationURL }}"')||
      /<script\b|<iframe\b|<form\b|\bon\w+\s*=/i.test(html))fail('INVITE_TEMPLATE_INVALID');
  return true;
}
async function request(fetcher,url,token,method='GET',body=null,kind='REMOTE'){
  let response;
  try {response=await fetcher(url,{
    method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)
  });}
  catch {fail(kind+'_NETWORK_ERROR');}
  if(!response?.ok)fail(kind+'_HTTP_'+String(response?.status||'UNKNOWN'));
  try {return await response.json();}catch{fail(kind+'_INVALID_JSON');}
}
function requiredReadback(config,sender){
  return config.smtp_host===RESEND_SMTP.smtp_host &&
    String(config.smtp_port)===RESEND_SMTP.smtp_port &&
    config.smtp_user===RESEND_SMTP.smtp_user &&
    config.smtp_admin_email===sender &&
    config.smtp_sender_name===RESEND_SMTP.smtp_sender_name;
}
export async function runSetup({domain,managementToken,resendKey,html,mode='review',fetcher=fetch}={}){
  const sendingDomain=validateSenderDomain(domain);
  checkKoreanInvitation(html);
  if(!['review','apply'].includes(mode))fail('MODE_INVALID');
  const management=requireConfigured(managementToken,'SUPABASE_MANAGEMENT_TOKEN_MISSING');
  const key=requireConfigured(resendKey,'RESEND_API_KEY_MISSING');
  if(!key.startsWith('re_')||key.length<12)fail('RESEND_KEY_FORMAT_INVALID');
  const sender='no-reply@'+sendingDomain;
  // A verified Resend team and explicit sending capability is a prerequisite.
  // Verify before any Supabase Auth mutation; never trust a DNS screenshot alone.
  const domains=await request(fetcher,RESEND_URL,key,'GET',null,'RESEND_DOMAIN_READ');
  if(!Array.isArray(domains?.data))fail('RESEND_DOMAIN_RESPONSE_INVALID');
  const entry=domains.data.find(d=>String(d?.name||'').toLowerCase()===sendingDomain);
  if(!entry||entry.status!=='verified'||entry.capabilities?.sending==='disabled'||
    (entry.capabilities?.sending!=null&&entry.capabilities.sending!=='enabled'))
    fail('RESEND_DOMAIN_NOT_VERIFIED_FOR_SENDING');
  const config=await request(fetcher,AUTH_URL,management,'GET',null,'SUPABASE_AUTH_READ');
  if(!config||typeof config!=='object'||Array.isArray(config))fail('SUPABASE_AUTH_CONFIG_INVALID');
  // Never silently replace a working external SMTP or change its sender identity.
  if(config.smtp_host&&config.smtp_host!=='smtp.resend.com')fail('EXISTING_NON_RESEND_SMTP_MUST_BE_REVIEWED');
  if(config.smtp_host==='smtp.resend.com'&&config.smtp_admin_email&&config.smtp_admin_email!==sender)
    fail('EXISTING_RESEND_SENDER_MUST_BE_REVIEWED');
  const smtpMatch=requiredReadback(config,sender);
  const templateMatch=config.mailer_subjects_invite===INVITE_SUBJECT && config.mailer_templates_invite_content===html;
  const base={project:PROJECT,mode,sendingDomain,providerVerified:true,sender,
    smtpMetadataMatch:smtpMatch,koreanInviteMatch:templateMatch,mailDelivered:false};
  if(mode==='review')return {...base,status:'READY_FOR_EXPLICIT_SETUP_NO_CHANGES'};
  if(!smtpMatch){
    await request(fetcher,AUTH_URL,management,'PATCH',{
      ...RESEND_SMTP,smtp_admin_email:sender,smtp_pass:key
    },'SUPABASE_SMTP_APPLY');
    const afterSmtp=await request(fetcher,AUTH_URL,management,'GET',null,'SUPABASE_SMTP_READBACK');
    if(!requiredReadback(afterSmtp,sender))fail('SUPABASE_SMTP_METADATA_READBACK_FAILED');
  }
  // Separate PATCH: free-project template customization needs an active custom SMTP.
  // Preserve site_url, callback allowlists, other templates and all Auth policies.
  if(!templateMatch){
    await request(fetcher,AUTH_URL,management,'PATCH',{
      mailer_subjects_invite:INVITE_SUBJECT,mailer_templates_invite_content:html
    },'SUPABASE_KOREAN_TEMPLATE_APPLY');
  }
  const after=await request(fetcher,AUTH_URL,management,'GET',null,'SUPABASE_FINAL_READBACK');
  if(!requiredReadback(after,sender)||after.mailer_subjects_invite!==INVITE_SUBJECT||
    after.mailer_templates_invite_content!==html)fail('SUPABASE_CONFIG_READBACK_MISMATCH');
  return {...base,status:'SMTP_AND_INVITE_METADATA_APPLIED_LIVE_MAIL_E2E_PENDING',
    smtpMetadataMatch:true,koreanInviteMatch:true};
}
async function main(){
  const html=await readFile(new URL('../supabase/email-templates/invite.html',import.meta.url),'utf8');
  const mode=String(process.env.RESEND_SMTP_MODE||'review');
  if(mode==='apply'&&process.env.RESEND_SMTP_APPLY_APPROVED!=='true')fail('LIVE_CHANGE_NOT_EXPLICITLY_APPROVED');
  const result=await runSetup({mode,html,domain:process.env.RESEND_SENDING_DOMAIN,
    managementToken:process.env.SUPABASE_AUTH_WRITE_TOKEN||process.env.SUPABASE_ACCESS_TOKEN,
    resendKey:process.env.RESEND_API_KEY});
  console.log('BAEKEOK_RESEND_AUTH_SMTP '+JSON.stringify(result));
  console.log('REAL_INVITATION_SEND_AND_INBOX_VERIFICATION_STILL_REQUIRED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error('BAEKEOK_RESEND_AUTH_SMTP_FAILED '+
    (/^[A-Z0-9_]+$/.test(e.message)?e.message:'UNKNOWN_ERROR'));process.exitCode=1;});
}