// Execute real HQ scripts; all transports are intercepted synthetic fixtures.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const results=[];
const css=readFileSync('index.html','utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1]||'';
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
  for(const width of [320,393,1280])for(const panel of ['console','onboarding'])for(const legacy of [false,true]){
   const page=await browser.newPage({viewport:{width,height:900},locale:'ko-KR'});
   const sent=[],direct=[],errors=[];let pending=false;
   const store={id:80,code:'REAL_1',name:'Synthetic 1호점',region_group:'서울',onboarding_status:'STAGED',is_active:false,manager_count:0};
   const intent={store_id:80,user_id:'former-owner',email:'former-owner@qa.invalid',intended_role:'OWNER',account_state:'INVITED',invitation_kind:'TEMP',auto_open_after_accept:true,expires_at:new Date(Date.now()+86400000).toISOString()};
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    assert.equal(url.origin,'https://qa.invalid','external network is forbidden');
    const reply=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
    if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><div id="accountVeil" class="show"><div id="adAccount"></div></div>'});
    if(url.pathname==='/functions/v1/server-sync-sheet'){
     sent.push(JSON.parse(route.request().postData()));pending=true;
     return reply({ok:true,delivery:'AUTH_RECOVERY_ACCEPTED',email:intent.email,store_id:80});
    }
    const name=url.pathname.split('/').pop();
    if(name==='hq_store_existing_verified_account_connect'||name==='hq_store_manager_assign')direct.push(name);
    const data={hq_stores_onboarding_list:[store],hq_store_manager_list:[],hq_store_primary_owner_list:[],
     hq_store_locations_list:[],hq_store_manager_eligibility_list:[],hq_store_manager_directory:[],
     hq_store_owner_pending_list:pending?[intent]:[],hq_store_owner_temp_pending_list:pending?[intent]:[],
     hq_store_sample_flags_list:[],hq_store_sample_roster_counts:[],
     hq_store_provenance_list:[{store_id:80,decision:'VERIFIED',evidence_reference:'Synthetic independently verified branch'}]};
    assert.ok(Object.hasOwn(data,name),'unexpected mutation or RPC '+name);
    return reply(data[name]);
   });
   await page.goto('https://qa.invalid/');await page.addStyleTag({content:css});
   await page.evaluate(()=>{
    window.CONFIG={SUPABASE_URL:'https://qa.invalid',SUPABASE_ANON_KEY:'synthetic'};
    window.Auth={token:'synthetic-hq'};
    window.BE={listAuthUsers:async()=>[{user_id:'former-owner',email:'former-owner@qa.invalid',email_confirmed_at:'2026-10-27T00:00:00Z'}]};
    window.__confirmations=[];window.__alerts=[];
    window.confirm=message=>{window.__confirmations.push(message);return true};
    window.alert=message=>window.__alerts.push(message);
    window.toast=()=>{};
   });
   await page.addScriptTag({path:panel==='console'?'hq_owner_console.js':'hq_store_onboarding_ui.js'});
   const ids=panel==='console'?['hqOwnerEmail','hqOwnerInvite','hqOwnerConnectExisting']:['hqManagerEmail','hqManagerInvite','hqManagerAssign'];
   if(panel==='console'){
    await page.evaluate(()=>window.mountHqOwnerConsole(document.getElementById('adAccount')));
    await page.locator('[data-store="80"]').click();
    await page.locator('[data-manager-tab="invite"]').click();
   }else{
    await page.evaluate(()=>window.mountHqStoreOnboarding(document.getElementById('adAccount')));
    await page.locator('#hqOnboardingStore').selectOption('80');
   }
   assert.equal(await page.locator('#'+ids[2]).isHidden(),true,'mail-free OWNER action must be hidden');
   await page.locator('#'+ids[0]).fill(intent.email);
   if(legacy)await page.locator('#'+ids[2]).evaluate(el=>el.click());
   else await page.locator('#'+ids[1]).click();
   await page.waitForFunction(()=>document.body.innerText.includes('former-owner@qa.invalid'));
   assert.deepEqual(sent,[{mode:'issue_store_owner_temporary_password',email:intent.email,store_id:80,auto_open_after_accept:true,resend_only:false}]);
   assert.deepEqual(direct,[],'no direct owner privilege assignment');
   assert.equal(store.onboarding_status,'STAGED');assert.equal(store.is_active,false);
   const confirmations=await page.evaluate(()=>window.__confirmations);
   assert.equal(confirmations.length,1);assert.match(confirmations[0],/개통/);
   assert.deepEqual(errors,[]);
   results.push({engine,width,panel,legacy,result:'PASS'});await page.close();
  }
 }finally{await browser.close();}
}
mkdirSync('qa-results',{recursive:true});
writeFileSync('qa-results/hq-owner-reinvite-1243.json',JSON.stringify({commit:process.env.GITHUB_SHA||null,scope:'REAL_HQ_UI_SYNTHETIC_TRANSPORT',operatingMailSent:false,results},null,2));
console.log('PASS HQ former-owner reinvite browser '+results.length+'/'+results.length+'; Chromium/WebKit 320/393/1280px, two panels, visible and legacy actions; no direct owner assignment');
