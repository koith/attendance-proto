// Targeted activation recovery in Chromium and Safari's WebKit engine.
// Every account, HTTP response and credential is synthetic; no production call.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import http from 'node:http';
import {chromium,webkit} from 'playwright';
const script=readFileSync('owner_activation.js','utf8');
const html=readFileSync('owner_activation.html','utf8');
const config='SUPABASE_URL: "https://activation-qa.invalid", SUPABASE_ANON_KEY: "synthetic-public-key"';
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html');
 if(path==='/owner_activation.html')res.end(html);
 else if(path==='/owner_activation.js')res.end(script);
 else if(path==='/index.html')res.end(config);
 else{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const results=[];
try{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true});
  try{
   for(const scenario of ['owner-appointment-retry','assistant-lost-password-response','existing-matching-password','cancelled-retry','wrong-store-context','expired-link','expired-link-self-resend','native-owner-activation']){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    const calls=[];let saved=scenario==='existing-matching-password',failed=false,cancelled=false;
    const bad=scenario==='cancelled-retry'||scenario==='wrong-store-context'||scenario==='expired-link';
    await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin===base)return route.continue();
     assert.equal(url.origin,'https://activation-qa.invalid','Never call operating Auth or any external server');
     calls.push(url.pathname);
     const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
     if(url.pathname.endsWith('/auth/v1/recover')){
      assert.equal(scenario,'expired-link-self-resend');
      assert.equal(request.method(),'POST');
      const body=JSON.parse(request.postData());
      assert.equal(body.email,'recipient@example.test');
      assert.equal(url.searchParams.get('redirect_to'),'https://koith.github.io/attendance-proto/owner_activation.html');
      return reply({});
     }
     if(url.pathname.endsWith('/native_owner_invitation_preflight')){
      return scenario==='native-owner-activation'?
       reply({ok:true,store_id:701,intended_role:'OWNER',password_change_required:true}):
       reply({message:'NO_VALID_NATIVE_OWNER_INVITATION'},403);
     }
     if(url.pathname.endsWith('/native_owner_invitation_complete')){
      assert.equal(scenario,'native-owner-activation');
      assert.equal(JSON.parse(request.postData()).p_new_password,'synthetic-password-1243');
      return reply({ok:true,store_id:701,owner_assigned:true});
     }
     if(url.pathname.endsWith('/store_invitation_activation_preflight'))return cancelled?
      reply({message:'INVITATION_CANCELLED_OR_NOT_FOUND'},403):
      reply({ok:true,store_id:701,intended_role:scenario.startsWith('assistant')?'ASSISTANT':'OWNER'});
     if(url.pathname==='/auth/v1/user'){
      if(saved)return reply({code:'same_password',msg:'New password should be different from the old password.'},422);
      saved=true;
      if(scenario==='assistant-lost-password-response'&&!failed){failed=true;return route.abort('failed');}
      return reply({});
     }
     if(url.pathname.endsWith('/store_primary_owner_accept_invitation')){
      if(['owner-appointment-retry','cancelled-retry'].includes(scenario)&&!failed){failed=true;return reply({message:'RETRY'},503);}
      return reply({ok:true,store_id:701,owner_assigned:!scenario.startsWith('assistant')});
     }
     if(url.pathname.endsWith('/admin_context'))return reply({role:'STORE_MANAGER',store_id:scenario==='wrong-store-context'?702:701});
     throw Error('UNEXPECTED_SYNTHETIC_REQUEST');
    });
    const fragment=scenario.startsWith('expired-link')?'#error=access_denied&error_description=Expired':'#access_token=synthetic-token&refresh_token=synthetic-refresh&expires_in=3600';
    await page.goto(base+'/owner_activation.html'+fragment);
    await page.waitForFunction(()=>location.hash==='');
    if(scenario.startsWith('expired-link')){
     await page.waitForFunction(()=>document.getElementById('activateForm').hidden);
     await page.waitForFunction(()=>!document.getElementById('recoveryResendForm').hidden);
     assert.equal(calls.length,0);
     if(scenario==='expired-link-self-resend'){
      await page.fill('#recoveryEmail','recipient@example.test');
      await page.click('#resendRecovery');
      await page.waitForFunction(()=>document.getElementById('status').textContent.includes('새 인증 메일을 요청했습니다'));
      assert.equal(calls.filter(x=>x==='/auth/v1/recover').length,1);
      assert.equal(await page.evaluate(()=>localStorage.getItem('baekeok_auth')),null);
     }
    }else{
     await page.fill('#password','synthetic-password-1243');
     await page.fill('#repeat','synthetic-password-1243');
     await page.click('#confirm');
     if(['owner-appointment-retry','assistant-lost-password-response','cancelled-retry'].includes(scenario)){
      await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('활성화 실패:'));
      if(scenario==='cancelled-retry')cancelled=true;
      await page.click('#confirm');
     }
     if(bad){
      await page.waitForFunction(()=>!document.getElementById('confirm').disabled&&document.getElementById('status').textContent.startsWith('활성화 실패:'));
      assert.equal(await page.evaluate(()=>localStorage.getItem('baekeok_auth')),null);
      assert.equal(new URL(page.url()).pathname,'/owner_activation.html');
      if(scenario==='cancelled-retry')assert.equal(calls.filter(x=>x==='/auth/v1/user').length,1);
     }else{
      await page.waitForURL(base+'/index.html?mode=store&store=701#admin');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('baekeok_auth')).access_token),'synthetic-token');
      if(scenario==='native-owner-activation'){
       assert.equal(calls.filter(x=>x.endsWith('/native_owner_invitation_complete')).length,1);
       assert.equal(calls.some(x=>x.endsWith('/store_primary_owner_accept_invitation')),false);
      }
     }
    }
    results.push({engine:engine.name(),scenario,result:'PASS',operatingRequests:0});
    console.log('PASS '+engine.name()+' '+scenario);
    await context.close();
   }
  }finally{await browser.close();}
 }
}finally{
 await new Promise(resolve=>server.close(resolve));
 mkdirSync('qa-results',{recursive:true});
 writeFileSync('qa-results/owner-activation-retry-1243.json',JSON.stringify({results,hostedAuthVerified:false},null,2));
}
assert.equal(results.length,16);
