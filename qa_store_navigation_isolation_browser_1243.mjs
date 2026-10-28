// Real deployed entry/attendance code; every network request intercepted with synthetic data.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve('.'),host='http://qa1243.invalid',proof=[];
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [393,1280]){
  for(const scenario of ['generic','foreign','attendance-close','legacy-attendance','foreign-attendance','revoked','hq']){
   const calls=[],context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
   await context.addInitScript(({scenario})=>{
    // Model a valid, not-yet-expired manager JWT in the fully intercepted
    // synthetic browser. v0.371 rejects malformed/expired saved sessions,
    // which are tested independently by Safari legacy-link regression.
    const payload={exp:Math.floor(Date.now()/1000)+7200,sub:'synthetic-owner'};
    const encoded=btoa(JSON.stringify(payload)).split('+').join('-').split('/').join('_').replace(/=+$/,'');
    localStorage.setItem('baekeok_auth',JSON.stringify({
     access_token:'synthetic.'+encoded+'.signature',refresh_token:'synthetic-refresh'
    }));
    sessionStorage.setItem('baekeok_store_id','1');sessionStorage.setItem('baekeok_store_name','이전 지점');
   },{scenario});
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.hostname==='qa1243.invalid'){
     const file=resolve(root,'.'+url.pathname);
     if(!file.startsWith(root+'/')||!existsSync(file))return route.fulfill({status:404,body:''});
     const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'}[extname(file)]||'text/plain';
     return route.fulfill({status:200,contentType:type,body:readFileSync(file)});
    }
    if(url.hostname.endsWith('.supabase.co')){
     let args={};try{args=request.postDataJSON()||{}}catch(_){}
     const name=url.pathname.split('/').pop();calls.push({name,args});
     if(name==='admin_context')return reply(scenario==='revoked'?{role:null,store_id:null}:scenario==='hq'?{role:'HQ',store_id:null}:{role:'STORE_MANAGER',store_id:80});
     if(name==='list_stores')return reply([{id:1,name:'인하대학교점',is_active:true},{id:80,name:'1호점',is_active:true}]);
     if(name==='list_store_employees')return reply(Number(args.p_store_id)===80?[]:[{id:901,name:'FOREIGN_STAFF_MUST_NOT_APPEAR',store_id:1,employee_no:1}]);
     if(name==='pos_public_staff_cards'||name==='pos_public_staff_picker'||name==='pos_employees_state')return reply(Number(args.p_store_id)===80?[]:[{id:901,name:'FOREIGN_STAFF_MUST_NOT_APPEAR',store_id:1,employee_no:1,working:false}]);
     if(name==='admin_store_events_with_corrections')return reply({events:[],corrections:[]});
     if(name==='admin_store_settings_get')return reply({open_minute:420,close_minute:1560});
     if(name==='user')return reply({id:'synthetic-owner',email:'owner@isolation.invalid'});
     if(name==='is_admin')return reply(true);
     if(name==='server-sync-sheet')return reply({error:'NO_OPERATING_ACTION_IN_FIXTURE'},403);
     return reply([]);
    }
    return route.abort();
   });
   let path=scenario==='foreign'?'/index.html?mode=store&store=1#pos':
    scenario==='foreign-attendance'?'/actual_attendance.html?store=1':
    scenario==='attendance-close'?'/actual_attendance.html?store=80':
    scenario==='legacy-attendance'?'/actual_attendance.html':
    scenario==='hq'?'/index.html?mode=store&store=1#pos':'/index.html#pos';
   await page.goto(host+path,{waitUntil:'domcontentloaded'});
   if(scenario==='foreign-attendance'){
    await page.getByText('STORE_ACCOUNT_SCOPE_MISMATCH',{exact:false}).waitFor();
    assert.ok(!calls.some(c=>/employees|events_with_corrections/.test(c.name)),'foreign attendance made private data request');
    proof.push({engine:engine.name(),width,scenario,status:'PASS',requests:calls.length});
    console.log('PASS '+engine.name()+' '+width+' '+scenario);await context.close();continue;
   }
   if(scenario.includes('attendance')){
    await page.locator('.calendar').waitFor();await page.locator('#back').click();
   }
   if(scenario==='revoked'){
    await page.locator('#retryStoreConnect').waitFor();
    assert.ok(!calls.some(c=>/list_stores|employees|staff_cards|staff_picker/.test(c.name)),'revoked account made public data request');
   }else if(scenario==='hq'){
    await page.waitForFunction(()=>document.getElementById('lockedStoreName')?.textContent==='인하대학교점');
   }else{
    await page.waitForURL(/index\.html\?mode=store&store=80#pos/);
    await page.waitForFunction(()=>document.getElementById('lockedStoreName')?.textContent==='1호점');
    assert.ok(!calls.some(c=>Number(c.args.p_store_id)===1),'foreign store request '+JSON.stringify(calls));
    assert.ok(!await page.getByText('FOREIGN_STAFF_MUST_NOT_APPEAR',{exact:false}).count());
   }
   proof.push({engine:engine.name(),width,scenario,status:'PASS',requests:calls.length});
   console.log('PASS '+engine.name()+' '+width+' '+scenario);await context.close();
  }
 }}finally{await browser.close()}
}
console.log('STORE_NAVIGATION_ISOLATION '+JSON.stringify({cases:proof.length,proof,productionRequests:0}));
