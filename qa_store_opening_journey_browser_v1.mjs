// Isolated store-opening browser journey: REAL checked-in UI scripts,
// synthetic backend, synthetic .invalid mailbox, zero production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';

const STORE=800001, OTHER=800002, HOST='https://waluhdgqhwjjwmflhrle.supabase.co';
const files=new Set(['index.html','owner_activation.html','owner_activation.js','hq_owner_console.js','store_manager_tab.js','store_limited_manager.js','recipe_access_v220.js']);
const users=new Map([['qa-hq',{id:'hq-id',email:'hq@opening-qa.invalid',role:'HQ',active:true}]]);
const mail=[], audits=[], stores=new Map([[STORE,{id:STORE,name:'QA 가상개통점',code:'QA-OPENING',onboarding_status:'STAGED',is_active:false,province:'경기도',district:'수원시'}],[OTHER,{id:OTHER,name:'QA 비교점',code:'QA-OTHER',onboarding_status:'STAGED',is_active:false,province:'경기도',district:'수원시'}]]);
const managers=new Map(),permissions=new Map(),recipeBase={menu_key:'AMERICANO',menu_name:'본사 아메리카노',category:'커피',components:[{item_id:501,item_name:'원두',quantity:18,unit:'g'}],instructions:[{label:'HOT',content:'본사 지정 제조법'}],thumbnail_url:'',is_overridden:false};
const overrides=new Map(),staff=[{id:900101,store_id:STORE,name:'가상 직원',employee_no:1,memo:'',is_active:true,working:false,pin:'1234'}];
const copy=x=>structuredClone(x),key=(store,menu)=>String(store)+':'+String(menu);
function reply(route,data,status=200){
 return route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS,PUT'},body:JSON.stringify(data)});
}
function failing(message,status=403){return {status,result:{message,error:message}};}
function who(token){return users.get(token)||null;}
function actor(req){return String(req.headers()['authorization']||'').replace(/^Bearer /i,'');}
function api(name,body,token,method='POST'){
 const user=who(token),isHQ=user?.role==='HQ',isOwner=user?.role==='OWNER'&&user.active&&user.store_id===STORE;
 const isAssistant=user?.role==='ASSISTANT'&&user.active&&user.store_id===STORE;
 const scoped=Number(body.p_store_id??body.store_id??STORE);
 const scopeOK=scoped===STORE;
 const denial=(code='NOT_AUTHORIZED')=>failing(code);
 if(name==='hq_stores_onboarding_list')return isHQ?{result:[...stores.values()]}:denial();
 if(name==='hq_store_manager_list')return isHQ?{result:[...managers.values()].map(m=>({user_id:m.id,store_id:m.store_id,email:m.email,registered_at:m.registered_at}))}:denial();
 if(name==='hq_store_primary_owner_list')return isHQ?{result:[...managers.values()].filter(m=>m.role==='OWNER'&&m.active).map(m=>({store_id:m.store_id,user_id:m.id}))}:denial();
 if(name==='hq_store_locations_list')return isHQ?{result:[{store_id:STORE,province:'경기도',district:'수원시',address:'가상 주소 (외부 전송 금지)'},{store_id:OTHER,province:'경기도',district:'수원시'}]}:denial();
 if(name==='hq_store_manager_eligibility_list')return isHQ?{result:[...managers.values()].filter(m=>m.active).map(m=>({store_id:m.store_id,user_id:m.id,eligible:true}))}:denial();
 if(name==='hq_store_primary_owner_invitation_list')return isHQ?{result:[...managers.values()].filter(m=>m.role==='OWNER'&&!m.active).map(m=>({store_id:m.store_id,user_id:m.id,expires_at:'2026-11-01T00:00:00Z'}))}:denial();
 if(name==='hq_store_manager_directory')return isHQ?{result:[...managers.values()].map(m=>({store_id:m.store_id,user_id:m.id,email:m.email,intended_role:m.role,account_state:m.active?'ACTIVE':'PENDING',registered_at:m.registered_at}))}:denial();
 if(name==='hq_store_sample_flags_list')return isHQ?{result:[]}:denial();
 if(name==='hq_store_onboarding_set'){
   if(!isHQ)return denial();
   if(body.p_status==='READY'&&![...managers.values()].some(m=>m.store_id===scoped&&m.role==='OWNER'&&m.active))return failing('CONFIRMED_STORE_MANAGER_REQUIRED',409);
   stores.get(scoped).onboarding_status=body.p_status;stores.get(scoped).is_active=body.p_status==='READY';
   return {result:{ok:true,store_id:scoped,status:body.p_status}};
 }
 if(name==='store_primary_owner_accept_invitation'){
   if(!user||!user.passwordSet||!user.emailConfirmed)return failing('EMAIL_CONFIRMATION_REQUIRED',403);
   const manager=[...managers.values()].find(m=>m.id===user.id);
   if(!manager)return failing('STORE_MANAGER_REQUIRED');
   manager.active=true;user.active=true;
   return {result:{ok:true,store_id:manager.store_id,owner_assigned:manager.role==='OWNER'}};
 }
 if(name==='admin_context'){
   return user&&user.role!=='HQ'&&user.passwordSet?{result:{role:'STORE_MANAGER',store_id:user.store_id}}:denial();
 }
 if(name==='is_hq_admin')return {result:isHQ};
 if(name==='store_delegated_manager_list'){
   if(!scopeOK||!(isOwner||isAssistant||isHQ))return denial();
   return {result:[...managers.values()].filter(m=>m.store_id===STORE).map(m=>({store_id:STORE,user_id:m.id,email:m.email,manager_role:m.role==='OWNER'&&m.active?'OWNER':'DELEGATED'}))};
 }
 if(name==='store_manager_invitation_states'){
   if(!scopeOK||!(isOwner||isAssistant||isHQ))return denial();
   return {result:[...managers.values()].filter(m=>m.store_id===STORE).map(m=>({user_id:m.id,email:m.email,intended_role:m.role,account_state:m.active?'ACTIVE':'PENDING'}))};
 }
 if(name==='store_delegated_permissions_list')return isOwner&&scopeOK?{result:[...permissions.entries()].map(([uid,p])=>({user_id:uid,...p}))}:denial();
 if(name==='store_delegated_permissions_set'){
   if(!isOwner||!scopeOK)return denial();
   const m=[...managers.values()].find(x=>x.id===body.p_user_id&&x.role==='ASSISTANT'&&x.active);
   if(!m)return failing('ACTIVE_ASSISTANT_REQUIRED',409);
   permissions.set(m.id,{staff_edit:!!body.p_staff_edit,attendance_approve:!!body.p_attendance_approve,payroll_view:!!body.p_payroll_view});
   return {result:{ok:true}};
 }
 if(name==='store_limited_employee_list')return isAssistant&&permissions.get(user.id)?.staff_edit&&scopeOK?{result:staff.filter(x=>x.store_id===scoped)}:denial();
 if(name==='store_limited_employee_update'){
   if(!isAssistant||!permissions.get(user.id)?.staff_edit||!scopeOK)return denial();
   const employee=staff.find(x=>x.id===body.p_employee_id&&x.store_id===scoped);
   if(!employee)return failing('EMPLOYEE_NOT_IN_STORE',404);
   employee.name=body.p_name;employee.memo=body.p_memo;return {result:{ok:true}};
 }
 if(name==='store_limited_pending_requests')return isAssistant&&permissions.get(user.id)?.attendance_approve&&scopeOK?{result:[]}:denial();
 if(name==='store_limited_payroll_read')return isAssistant&&permissions.get(user.id)?.payroll_view&&scopeOK?{result:[{employee_name:staff[0].name,gross_pay:120000,net_pay:116040}]}:denial();
 if(name==='admin_store_recipe_list'){
   if(!(isOwner||isAssistant||isHQ))return denial();
   const selected=Number(body.p_store_id);
   if(!isHQ&&selected!==STORE)return denial();
   return {result:[{...copy(recipeBase),...copy(overrides.get(key(selected,'AMERICANO'))||{})}]};
 }
 if(name==='admin_store_recipe_override_save'){
   if(!isOwner||!scopeOK)return denial();
   assert.equal(body.p_menu_key,'AMERICANO');
   assert.ok(Array.isArray(body.p_components)&&body.p_components.length>0,'recipe must contain selected ingredients');
   const row={menu_name:body.p_menu_name,category:body.p_category,components:copy(body.p_components),instructions:copy(body.p_instructions),is_overridden:true,thumbnail_url:body.p_thumbnail_url};
   overrides.set(key(scoped,body.p_menu_key),row);
   return {result:{ok:true}};
 }
 if(name==='admin_store_recipe_override_clear'){
   if(!isOwner||!scopeOK)return denial();
   overrides.delete(key(scoped,body.p_menu_key));return {result:{ok:true}};
 }
 if(name==='staff_recipe_list'){
   if(!scopeOK)return denial();
   const e=staff.find(x=>x.id===body.p_employee_id&&x.store_id===scoped);
   if(!e||e.pin!==body.p_pin||!e.working)return failing('NOT_CLOCKED_IN');
   return {result:[{...copy(recipeBase),...copy(overrides.get(key(scoped,'AMERICANO'))||{})}]};
 }
 return failing('UNHANDLED_TEST_RPC_'+name,500);
}
function edge(body,token){
 const user=who(token),email=String(body.email||'').toLowerCase(),store_id=Number(body.store_id);
 if(!email.endsWith('@opening-qa.invalid'))return failing('QA_MAILBOX_ONLY',400);
 let role;
 if(body.mode==='invite_store_manager'&&user?.role==='HQ')role='OWNER';
 else if(body.mode==='invite_store_delegated_manager'&&user?.role==='OWNER'&&user.active&&user.store_id===STORE&&stores.get(STORE).is_active)role='ASSISTANT';
 else return failing('ROLE_INVITE_DENIED');
 if(store_id!==STORE)return failing('CROSS_STORE_INVITE',403);
 if([...managers.values()].some(m=>m.email===email))return failing('ACCOUNT_ALREADY_ASSIGNED',409);
 const id=role==='OWNER'?'owner-qa-id':'assistant-qa-id',newToken=role==='OWNER'?'qa-owner':'qa-assistant';
 const account={id,email,role,store_id,active:false,emailConfirmed:true,passwordSet:false};
 users.set(newToken,account);
 managers.set(id,{id,email,store_id,role,active:false,registered_at:'2026-10-17T00:00:00Z'});
 if(role==='ASSISTANT')permissions.set(id,{staff_edit:false,attendance_approve:false,payroll_view:false});
 mail.push({to:email,token:newToken,role,store_id,href:'/owner_activation.html#access_token='+newToken+'&refresh_token=qa-refresh&expires_in=3600'});
 return {result:{ok:true,invited:true,email,store_id,invitation_role:role}};
}
function html(kind,params){
 const token=params.get('token')||'qa-hq';
 const init='window.CONFIG={SUPABASE_URL:'+JSON.stringify(HOST)+',SUPABASE_ANON_KEY:"qa-anon"};window.CURRENT_STORE_ID='+STORE+';window.LIVE=true;window.confirm=()=>true;window.alert=(s)=>{window.qaAlerts.push(s)};window.qaAlerts=[];window.Auth={token:'+JSON.stringify(token)+',isLoggedIn:()=>true,getUser:async()=>{const r=await fetch("/qa/user?token='+token+'");return r.json()},clear:()=>{}};window.BE={listAuthUsers:async()=>{const r=await fetch("/qa/users");return r.json()}};';
 let body='',asset='',action='';
 if(kind==='hq'){body='<div id="hq"><div id="hqOwnerPinnedSummary"></div></div>';asset='hq_owner_console.js';action='mountHqOwnerConsole(document.getElementById("hq"));';}
 else if(kind==='manager'){body='<div class="employee-panel"><div class="employee-tabs"></div></div>';asset='store_manager_tab.js';action='mountStoreManagerTab();';}
 else if(kind==='limited'){body='<div id="view"></div>';asset='store_limited_manager.js';const perms=permissions.get('assistant-qa-id')||{staff_edit:false,attendance_approve:false,payroll_view:false};action='mountScopedManagerPortal('+JSON.stringify(perms)+','+STORE+');';}
 else if(kind==='recipe'){
   body='<div id="view"></div>';asset='recipe_access_v220.js';
   action='window.view=document.getElementById("view");window.BE={'+
   'isAdmin:async()=>true,'+
   'storeRecipeList:async(id)=>{const r=await fetch(window.CONFIG.SUPABASE_URL+"/rest/v1/rpc/admin_store_recipe_list",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+Auth.token},body:JSON.stringify({p_store_id:id})});return r.json()},'+
   'inventoryItems:async()=>[{id:501,name:"원두",unit:"g",sku:"QA-COFFEE"}],'+
   'storeRecipeOverrideSave:async(id,k,n,c,parts,thumb,steps)=>{const r=await fetch(window.CONFIG.SUPABASE_URL+"/rest/v1/rpc/admin_store_recipe_override_save",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+Auth.token},body:JSON.stringify({p_store_id:id,p_menu_key:k,p_menu_name:n,p_category:c,p_components:parts,p_thumbnail_url:thumb,p_instructions:steps})});if(!r.ok)throw Error("RECIPE_SAVE_DENIED");return r.json()},'+
   'storeRecipeOverrideClear:async(id,k)=>{const r=await fetch(window.CONFIG.SUPABASE_URL+"/rest/v1/rpc/admin_store_recipe_override_clear",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+Auth.token},body:JSON.stringify({p_store_id:id,p_menu_key:k})});if(!r.ok)throw Error("RECIPE_CLEAR_DENIED");return r.json()}};renderRecipeHub();';
 }
 return '<!doctype html><meta charset="utf-8"><style>body{font:15px sans-serif}.btn{cursor:pointer}.form-control{padding:8px}.employee-panel{margin:20px}</style>'+body+'<script>'+init+'</script><script src="/'+asset+'"></script><script>'+action+'</script>';
}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/qa/users'||u.pathname==='/qa/user'){
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(u.pathname==='/qa/users'?[...users.values()].map(x=>({user_id:x.id,email:x.email,is_admin:x.role==='HQ'})):users.get(u.searchParams.get('token'))||null));
 }
 if(u.pathname.startsWith('/qa/')){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html(u.pathname.slice(4),u.searchParams));}
 const name=u.pathname.slice(1);
 if(files.has(name)){res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');return res.end(fs.readFileSync(name));}
 res.writeHead(404);res.end('not found');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
let steps=0;
async function intercept(page){
 page.on('pageerror',e=>{throw new Error('BROWSER_RUNTIME: '+e.message)});
 await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/,async route=>{
   const req=route.request();
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS,PUT'}});
   const path=new URL(req.url()).pathname, token=actor(req);
   let body={};try{body=JSON.parse(req.postData()||'{}')}catch{}
   audits.push({path,token,body,method:req.method()});
   let result;
   if(path==='/functions/v1/server-sync-sheet')result=edge(body,token);
   else if(path==='/auth/v1/user'&&req.method()==='PUT'){
     const user=who(token);if(!user)result=failing('INVALID_TOKEN',401);
     else if(String(body.password||'').length<12)result=failing('PASSWORD_TOO_SHORT',400);
     else{user.passwordSet=true;result={result:{id:user.id,email:user.email}};}
   }else if(path.startsWith('/rest/v1/rpc/'))result=api(path.split('/').pop(),body,token);
   else result=failing('UNHANDLED_API_'+path,500);
   return reply(route,result.result,result.status||200);
 });
}
async function contextPage(view,viewport={width:390,height:844}){
 const page=await browser.newPage({viewport});await intercept(page);await page.goto(origin+view,{waitUntil:'domcontentloaded'});return page;
}
function verify(test,label){assert.ok(test,label);steps++;console.log('PASS '+String(steps).padStart(2,'0')+' '+label)}
async function activation(href,password){
 const page=await contextPage(href);
 await page.locator('#password').fill(password);await page.locator('#repeat').fill(password);
 await page.route('**/index.html?mode=store*',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>QA STORE LANDING</h1>'}));
 await page.locator('#confirm').click();
 await page.waitForURL(/index\.html\?mode=store&store=800001#pos/,{timeout:12000});
 const auth=await page.evaluate(()=>JSON.parse(localStorage.getItem('baekeok_auth')||'null'));
 verify(auth?.access_token===new URL(href,'http://localhost').hash.match(/access_token=([^&]+)/)?.[1],'real activation page stores authenticated token and enters scoped store');
 await page.close();
}
try{
 const hq=await contextPage('/qa/hq');
 await hq.locator('[data-store="'+STORE+'"]').first().click();
 await hq.locator('[data-manager-tab="invite"]').click();
 await hq.locator('#hqOwnerEmail').fill('owner@opening-qa.invalid');
 await hq.locator('#hqOwnerInvite').click();
 await hq.waitForFunction(()=>document.querySelector('#hqOwnerBody')?.textContent.includes('초대 요청 처리됨'));
 verify(mail.length===1&&mail[0].role==='OWNER'&&!managers.get('owner-qa-id').active,'HQ real UI creates owner invitation in synthetic mailbox, not active owner');
 const premature=api('hq_store_onboarding_set',{p_store_id:STORE,p_status:'READY'},'qa-hq');
 verify(premature.status===409&&!stores.get(STORE).is_active,'store opening blocked until confirmed owner');
 await activation(mail[0].href,'qa-owner-password-16');
 verify(managers.get('owner-qa-id').active&&users.get('qa-owner').passwordSet,'email-linked owner password setup and owner appointment');
 const opened=api('hq_store_onboarding_set',{p_store_id:STORE,p_status:'READY'},'qa-hq');
 verify(opened.result?.ok===true&&stores.get(STORE).is_active,'HQ opens synthetic store only after owner activation');
 await hq.close();

 const owner=await contextPage('/qa/manager?token=qa-owner');
 await owner.locator('#storeManagerContent').getByText('대표 관리자입니다.',{exact:false}).waitFor();
 await owner.locator('.smt-add summary').click();
 await owner.locator('#storeManagerInviteEmail').fill('assistant@opening-qa.invalid');
 await owner.locator('#storeManagerInviteForm button').click();
 await owner.locator('.smt-pending-person').waitFor();
 verify(mail.length===2&&mail[1].role==='ASSISTANT'&&!managers.get('assistant-qa-id').active,'owner real UI invites delegated admin but keeps it pending');
 verify(permissions.get('assistant-qa-id')?.staff_edit===false,'pending assistant defaults to no permissions');
 await activation(mail[1].href,'qa-assistant-password-16');
 verify(managers.get('assistant-qa-id').active&&managers.get('assistant-qa-id').role==='ASSISTANT','assistant activation never becomes owner');
 await owner.reload();
 await owner.locator('.smt-delegate summary').first().click();
 const rights=owner.locator('[data-manager-rights="assistant-qa-id"]');
 await rights.locator('[data-allow="staff"]').check();
 await rights.locator('[data-allow="attendance"]').check();
 await rights.locator('[data-allow="payroll"]').check();
 await rights.locator('[data-permission-save]').click();
 await owner.waitForFunction(()=>document.querySelector('[data-manager-rights="assistant-qa-id"] input[data-allow="payroll"]')?.checked);
 verify(Object.values(permissions.get('assistant-qa-id')).every(Boolean),'owner grants three scoped assistant permissions via real UI');
 const assistant=await contextPage('/qa/manager?token=qa-assistant');
 await assistant.locator('#storeManagerContent').getByText('보조 관리자',{exact:false}).first().waitFor();
 verify(await assistant.locator('#storeManagerInviteForm').count()===0&&await assistant.locator('[data-permission-save]').count()===0,'assistant cannot invite/escalate permissions in manager UI');
 verify(api('store_delegated_permissions_set',{p_store_id:STORE,p_user_id:'assistant-qa-id',p_payroll_view:true},'qa-assistant').status===403,'backend denies assistant self-escalation');
 verify(api('store_limited_employee_update',{p_store_id:OTHER,p_employee_id:900101,p_name:'변조',p_memo:''},'qa-assistant').status===403,'backend rejects cross-store staff mutation');
 const limited=await contextPage('/qa/limited?token=qa-assistant');
 await limited.locator('.limited-staff-form').first().waitFor();
 await limited.locator('.limited-staff-form input[name="name"]').fill('개통 테스트 직원');
 await limited.locator('.limited-staff-form button[type="submit"]').click();
 await limited.locator('#limitedManagerNotice').getByText('직원 기본정보를 수정했습니다.').waitFor();
 verify(staff[0].name==='개통 테스트 직원'&&staff[0].store_id===STORE,'real delegated portal updates only store-scoped staff');
 await limited.locator('#limitedPayrollMonth').fill('2026-09');
 await limited.locator('#limitedPayrollLoad').click();
 await limited.locator('#limitedPayrollRows').getByText('세전',{exact:false}).waitFor();
 verify(true,'delegated payroll view renders only authorized closed month');
 await limited.close();await owner.close();await assistant.close();

 const recipe=await contextPage('/qa/recipe?token=qa-owner');
 await recipe.locator('.recipe-v220-card').first().waitFor();
 const edit=recipe.locator('.recipe-v220-edit').first();
 await edit.click();
 await recipe.locator('#rvName').fill('QA 개통점 아메리카노');
 await recipe.locator('#rvSave').click();
 await recipe.waitForFunction(()=>document.querySelector('.recipe-v220-card')?.textContent?.includes('QA 개통점 아메리카노'));
 verify(overrides.get(key(STORE,'AMERICANO'))?.menu_name==='QA 개통점 아메리카노','real recipe editor writes branch-local override');
 verify(!overrides.has(key(OTHER,'AMERICANO'))&&recipeBase.menu_name==='본사 아메리카노','HQ source and comparison branch recipe unchanged');
 const badRecipe=api('admin_store_recipe_override_save',{p_store_id:OTHER,p_menu_key:'AMERICANO',p_components:[{item_id:501,quantity:10}]},'qa-owner');
 verify(badRecipe.status===403,'cross-store recipe modification denied');
 await recipe.reload();
 await recipe.locator('.recipe-v220-card').first().waitFor();
 verify((await recipe.locator('.recipe-v220-card').first().innerText()).includes('QA 개통점 아메리카노'),'branch override persists across a real recipe UI reload');
 await recipe.close();
 verify(audits.some(a=>a.path.endsWith('/functions/v1/server-sync-sheet')&&a.body.mode==='invite_store_delegated_manager')&&audits.some(a=>a.path.endsWith('/rest/v1/rpc/admin_store_recipe_override_save')),'QA exercised actual UI network request paths');
 console.log('STORE OPENING ISOLATED BROWSER QA PASSED: '+steps+' assertions, '+mail.length+' synthetic invitations, '+audits.length+' intercepted API calls; no production writes.');
}catch(error){
 fs.mkdirSync('qa-results',{recursive:true});
 fs.writeFileSync('qa-results/store-opening-journey-browser-v1-failure.txt',String(error&&error.stack||error));
 for(const [ci,ctx] of browser.contexts().entries()){
  for(const [pi,page] of ctx.pages().entries()){
   try{
    await page.screenshot({path:'qa-results/store-opening-journey-browser-v1-'+ci+'-'+pi+'.png',fullPage:true,timeout:3000});
   }catch(_){/* Preserve the original test failure even if capture fails. */}
  }
 }
 throw error;
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
