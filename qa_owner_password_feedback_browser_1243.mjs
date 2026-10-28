// Real client/browser handlers; synthetic transport only, no operating calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 if(path==='/index.html'){res.end('SUPABASE_URL: "https://owner-feedback.invalid", SUPABASE_ANON_KEY: "public-fixture"');return;}
 if(['/owner_temp_activation.html','/owner_temp_activation.js','/owner_onboarding_v1.css','/logo_combine.jpg'].includes(path)){
  res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.jpg')?'image/jpeg':'text/html; charset=utf-8');
  res.end(readFileSync('.'+path));return;
 }
 res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,rows=[];mkdirSync('qa-results/owner-onboarding',{recursive:true});
try{
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
   for(const width of [320,375,393,430,1280])for(const scenario of ['same-current-then-new','lost-response-then-same','new-personal-password']){
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
    const calls=[];let puts=0,completions=0,saved=false;
    await page.route('**/*',async route=>{
     const r=route.request(),u=new URL(r.url());
     if(u.origin===base)return route.continue();
     assert.equal(u.origin,'https://owner-feedback.invalid');
     calls.push(u.pathname);
     const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
     if(u.pathname==='/auth/v1/user'&&r.method()==='GET')return reply({id:'synthetic-owner',email:'owner@synthetic.invalid'});
     if(u.pathname.endsWith('/store_owner_temp_preflight'))return reply({ok:true,email:'owner@synthetic.invalid',store_id:80,password_change_required:true,expires_at:'2099-01-01T00:00:00Z'});
     if(u.pathname==='/auth/v1/user'&&r.method()==='PUT'){
      puts++;const p=JSON.parse(r.postData()).password;
      if(scenario==='same-current-then-new'&&puts===1)return reply({code:422,error_code:'same_password',msg:'New password should be different from the old password.'},422);
      assert.equal(p,'new-personal-password-456');
      if(saved)return reply({code:422,error_code:'same_password'},422);
      saved=true;
      if(scenario==='lost-response-then-same')return route.abort('failed');
      return reply({id:'synthetic-owner'});
     }
     if(u.pathname.endsWith('/store_owner_temp_complete')){
      completions++;
      if(!saved)return reply({code:'P0001',message:'PERSONAL_PASSWORD_NOT_VERIFIED'},400);
      assert.equal(JSON.parse(r.postData()).p_new_password,'new-personal-password-456');
      return reply({ok:true,store_id:80,owner_assigned:true,store_opened:true});
     }
     if(u.pathname==='/auth/v1/token'){
      assert.equal(u.search,'?grant_type=password');assert.ok(saved);
      assert.equal(JSON.parse(r.postData()).password,'new-personal-password-456');
      return reply({access_token:'synthetic-new',refresh_token:'synthetic-refresh',user:{id:'synthetic-owner'}});
     }
     if(u.pathname.endsWith('/admin_context'))return reply({role:'STORE_MANAGER',store_id:80});
     throw Error('UNEXPECTED_REQUEST '+u.pathname);
    });
    await page.goto(base+'/owner_temp_activation.html#type=recovery&access_token=synthetic&refresh_token=synthetic-refresh');
    await page.locator('#firstLoginForm').waitFor({state:'visible'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok(await page.locator('img[alt="백억커피"]').evaluate(x=>x.complete&&x.naturalWidth>0));
    if([375,1280].includes(width)&&scenario==='new-personal-password')await page.screenshot({path:'qa-results/owner-onboarding/'+name+'-'+width+'-password.png',fullPage:true});
    const fill=async p=>{await page.fill('#password',p);await page.fill('#repeat',p);await page.click('#confirm');};
    await fill(scenario==='same-current-then-new'?'old-existing-password-123':'new-personal-password-456');
    if(scenario!=='new-personal-password'){
     await page.waitForFunction(()=>!document.getElementById('confirm').disabled);
     const message=await page.locator('#status').innerText();
     if(scenario==='same-current-then-new'){
      assert.match(message,/다른 새 비밀번호.*12자/);assert.doesNotMatch(message,/PERSONAL_PASSWORD_NOT_VERIFIED|완료됐을 수/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('baekeok_auth')),null);
      assert.equal(completions,1);
      if(width===375)await page.screenshot({path:'qa-results/owner-onboarding/'+name+'-375-same-password.png',fullPage:true});
     }else assert.equal(completions,0);
     await fill('new-personal-password-456');
    }
    await page.waitForURL(base+'/index.html?mode=store&store=80#admin');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('baekeok_auth')).access_token),'synthetic-new');
    assert.ok(!calls.some(x=>/invite|recover|mail/.test(x)));
    rows.push({engine:name,width,scenario,result:'PASS',operatingRequests:0});
    await context.close();
   }
  }finally{await browser.close();}
 }
}finally{
 await new Promise(resolve=>server.close(resolve));
 mkdirSync('qa-results',{recursive:true});
 writeFileSync('qa-results/owner-password-feedback-browser.json',JSON.stringify({rows,hostedAuth:false,operatingWrite:false},null,2));
}
assert.equal(rows.length,30);console.log('OWNER_PASSWORD_FEEDBACK_BROWSER_PASS '+JSON.stringify(rows));
