import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runSetup,checkKoreanInvitation,validateSenderDomain} from './qa1243_resend_smtp_setup.mjs';

const html='<html lang="ko"><body>백억커피 계정 활성화 <a href="{{ .ConfirmationURL }}">초대 수락</a></body></html>';
const creds={domain:'auth.example.com',resendKey:'re_fakekey_1234567890',managementToken:'fake_management_token',html};
const makeFake=({domainStatus='verified',sending='enabled',initial={},failTemplate=false}={})=>{
  const config={smtp_host:'',smtp_port:'',smtp_user:'',smtp_admin_email:'',smtp_sender_name:'',
    mailer_subjects_invite:'Old',mailer_templates_invite_content:'Old',
    site_url:'https://safe.existing.example/',uri_allow_list:'https://safe.existing.example/callback',
    ...initial};
  const calls=[];
  const fetcher=async(url,opt={})=>{
    calls.push({url,method:opt.method||'GET',body:opt.body?JSON.parse(opt.body):null});
    if(url.includes('api.resend.com'))return Response.json({data:[{name:'auth.example.com',status:domainStatus,capabilities:{sending}}]});
    if(url.includes('api.supabase.com')){
      if(opt.method==='PATCH'){
        if(failTemplate&&Object.hasOwn(JSON.parse(opt.body),'mailer_templates_invite_content'))return Response.json({error:'bad template'},{status:400});
        Object.assign(config,JSON.parse(opt.body));
      }
      return Response.json(config);
    }
    return Response.json({error:'unknown url'},{status:404});
  };
  return {fetcher,calls,config};
};
test('domain and invite template validation',()=>{
  assert.equal(validateSenderDomain('AUTH.Example.Com'),'auth.example.com');
  assert.throws(()=>validateSenderDomain('https://example.com'),/RESEND_DOMAIN_INVALID/);
  assert.equal(checkKoreanInvitation(html),true);
  assert.throws(()=>checkKoreanInvitation(html.replace('{{ .ConfirmationURL }}','https://wrong.example')), /INVITE_TEMPLATE_INVALID/);
});
test('review is strictly read-only',async()=>{
  const f=makeFake();const out=await runSetup({...creds,fetcher:f.fetcher});
  assert.equal(out.status,'READY_FOR_EXPLICIT_SETUP_NO_CHANGES');
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
});
test('unverified domain cannot change Auth',async()=>{
  const f=makeFake({domainStatus:'pending'});
  await assert.rejects(runSetup({...creds,mode:'apply',fetcher:f.fetcher}),/RESEND_DOMAIN_NOT_VERIFIED/);
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
});
test('existing other provider must not be overwritten',async()=>{
  const f=makeFake({initial:{smtp_host:'smtp.other.example'}});
  await assert.rejects(runSetup({...creds,mode:'apply',fetcher:f.fetcher}),/EXISTING_NON_RESEND_SMTP/);
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
});
test('apply only SMTP and Korean invite, preserve other Auth fields',async()=>{
  const f=makeFake();const out=await runSetup({...creds,mode:'apply',fetcher:f.fetcher});
  assert.equal(out.status,'SMTP_AND_INVITE_METADATA_APPLIED_LIVE_MAIL_E2E_PENDING');
  const patches=f.calls.filter(c=>c.method==='PATCH');
  assert.equal(patches.length,2);
  assert.deepEqual(Object.keys(patches[0].body).sort(),['smtp_admin_email','smtp_host','smtp_pass','smtp_port','smtp_sender_name','smtp_user']);
  assert.deepEqual(Object.keys(patches[1].body).sort(),['mailer_subjects_invite','mailer_templates_invite_content']);
  assert.equal(f.config.site_url,'https://safe.existing.example/');
  assert.equal(f.config.uri_allow_list,'https://safe.existing.example/callback');
  assert.equal(out.mailDelivered,false);
});
test('already applied configuration is idempotent',async()=>{
  const f=makeFake({initial:{smtp_host:'smtp.resend.com',smtp_port:'465',smtp_user:'resend',smtp_sender_name:'백억커피',
    smtp_admin_email:'no-reply@auth.example.com',mailer_subjects_invite:'[백억커피] 매장 관리자 계정 초대 안내',mailer_templates_invite_content:html}});
  const out=await runSetup({...creds,mode:'apply',fetcher:f.fetcher});
  assert.equal(out.smtpMetadataMatch,true);assert.equal(f.calls.filter(c=>c.method==='PATCH').length,0);
});
test('template PATCH failure is not incorrectly reported success',async()=>{
  const f=makeFake({failTemplate:true});
  await assert.rejects(runSetup({...creds,mode:'apply',fetcher:f.fetcher}),/SUPABASE_KOREAN_TEMPLATE_APPLY_HTTP_400/);
  assert.equal(f.calls.filter(c=>c.method==='PATCH').length,2);
});