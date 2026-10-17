/* #1000 Isolated E2E. Real owner_activation.js and recipe_access_v220.js
 * run in Chromium. Fake mailbox, RPCs, staff and recipes. Never touch production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';
const index=fs.readFileSync('index.html','utf8');
const anon=index.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+)"/)?.[1];
assert.ok(anon);
const tokens=new Map(),mail=[],overrides=new Map();
const baseRecipe=Object.freeze({product_id:90001,recipe_version_id:111,
 menu_key:'QA-COFFEE',menu_name:'본사 테스트 라떼',category:'라떼&버블티',
 thumbnail_url:'',assignment_status:'ACTIVE',is_overridden:false,
 instructions:[{label:'ICED',content:'우유 180ml'}],
 components:[{item_id:7,item_name:'우유',unit:'ml',quantity:180}]});
const workers=new Map([[210,{id:210,name:'샌드박스 직원',store_id:701,working:false,pin:'1234'}],
 [220,{id:220,name:'타지점 직원',store_id:702,working:true,pin:'4321'}]]);
let checks=0;function ok(v,msg){assert.ok(v,msg);checks++;}
function invite(role,store,name){
 const token='synthetic-'+name+'-'+role+'-'+store;
 const u={role,store,email:name+'@synthetic.invalid',token,ownerAssigned:false,
 ownerIntent:role==='OWNER',confirmed:false};
 tokens.set(token,u);
 mail.push({to:u.email,role,href:'/owner_activation.html#access_token='+token+'&refresh_token=synthetic-refresh'});
 return u;
}
const send=(res,data,status=200)=>{
 res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify(data));
};
const forStore=id=>overrides.has(id)?{...baseRecipe,...overrides.get(id),is_overridden:true}:{...baseRecipe};
function recipePage(){return `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>.recipe-v220-modal{position:fixed;inset:0;background:white;z-index:50;overflow:auto;padding:15px}</style>
<main id="view"></main>
<script>
 const p=new URLSearchParams(location.search),CURRENT_STORE_ID=Number(p.get('store')||701);
 const role=p.get('role')||'OWNER',view=document.getElementById('view'),LIVE=true;
 const Auth={isLoggedIn:()=>role!=='STAFF'};
 const api=async(name,fields={})=>{
   const r=await fetch('/qa/'+name,{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({store:CURRENT_STORE_ID,role,...fields})});
   const data=await r.json();if(!r.ok)throw Error(data.message||'QA API failure');return data;
 };
 const BE={
   isAdmin:async()=>role!=='STAFF',
   storeRecipeList:id=>api('recipe-list',{store:id}),
   storeRecipeOverrideSave:(store,menuKey,name,category,components,thumbnail,instructions)=>
     api('recipe-save',{store,menuKey,name,category,components,thumbnail,instructions}),
   storeRecipeOverrideClear:(store,menuKey)=>api('recipe-clear',{store,menuKey}),
   inventoryItems:()=>Promise.resolve([{id:7,name:'우유',sku:'QA-MILK',unit:'ml'}]),
   listEmployeesState:()=>api('employees'),
   staffRecipeList:(id,pin,store)=>api('staff-recipe',{id,pin,store})
 };
</script>
<script src="/recipe_access_v220.js"></script>
<script>renderRecipeHub();</script></html>`;
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/index.html'){
   res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
   return res.end(req.headers['sec-fetch-dest']==='document'?
     '<!doctype html><main id="landed">지점 접속 성공</main>':index);
  }
  if(u.pathname==='/recipe-fixture.html'){
   res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
   return res.end(recipePage());
  }
  if(['/owner_activation.html','/owner_activation.js','/recipe_access_v220.js'].includes(u.pathname)){
   res.writeHead(200,{'Content-Type':u.pathname.endsWith('.js')?'text/javascript':'text/html'});
   return res.end(fs.readFileSync(process.cwd()+u.pathname));
  }
  if(u.pathname.startsWith('/qa/')){
   let body='';for await(const buf of req)body+=buf;
   const x=JSON.parse(body||'{}'),store=Number(x.store),mode=u.pathname.slice(4);
   if(mode==='recipe-list')return send(res,[forStore(store)]);
   if(mode==='employees')return send(res,[...workers.values()].filter(w=>w.store_id===store).map(({pin,...w})=>w));
   if(mode==='staff-recipe'){
    const w=workers.get(Number(x.id));
    if(!w||w.store_id!==store)return send(res,{message:'WRONG_STORE'},403);
    if(w.pin!==x.pin)return send(res,{message:'BAD_PIN'},403);
    if(!w.working)return send(res,{message:'NOT_CLOCKED_IN'},403);
    return send(res,[forStore(store)]);
   }
   if(!['OWNER','ASSISTANT'].includes(x.role))return send(res,{message:'NOT_AUTHORIZED'},403);
   if(x.menuKey!==baseRecipe.menu_key)return send(res,{message:'MENU_NOT_FOUND'},404);
   if(mode==='recipe-save'){
    if(!x.components?.length)return send(res,{message:'NO_COMPONENTS'},400);
    overrides.set(store,{menu_name:x.name,category:x.category,thumbnail_url:x.thumbnail,
      instructions:x.instructions,components:x.components});return send(res,{ok:true});
   }
   if(mode==='recipe-clear'){overrides.delete(store);return send(res,{ok:true});}
  }
  res.writeHead(404);res.end('Not found');
 }catch(e){send(res,{message:String(e.message||e)},500)}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
async function activate(u,{password='SyntheticPassword-123!',confirm=password,
 fail=false,ctxStore=u.store,success=true,forceSubmit=false}={}){
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errs=[];
 page.on('pageerror',e=>errs.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin===base)return route.continue();
  if(url.origin!==anon)return route.abort('blockedbyclient');
  const tok=(route.request().headers()['authorization']||'').replace(/^Bearer /i,'');
  const record=tokens.get(tok),fn=url.pathname.split('/').pop();
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  calls.push(fn);
  if(!record)return reply({message:'BAD_TOKEN'},401);
  if(url.pathname==='/auth/v1/user'&&route.request().method()==='PUT'){
   record.confirmed=true;record.password=JSON.parse(route.request().postData()).password;
   return reply({id:'mock-'+record.store});
  }
  if(fn==='store_primary_owner_accept_invitation'){
   if(fail)return reply({message:'SYNTHETIC_ACCEPT_FAILURE'},409);
   if(!record.confirmed)return reply({message:'NOT_CONFIRMED'},403);
   if(record.ownerIntent)record.ownerAssigned=true;
   return reply({ok:true,store_id:record.store,owner_assigned:record.ownerAssigned});
  }
  if(fn==='admin_context')return reply({role:'STORE_MANAGER',store_id:ctxStore});
  return reply({message:'UNKNOWN_ENDPOINT'},404);
 });
 await page.goto(base+mail.find(m=>m.to===u.email).href);
 await page.locator('#activateForm').waitFor({state:'visible',timeout:8000});
 await page.locator('#password').fill(password);
 await page.locator('#repeat').fill(confirm);
 // HTML minlength is only one layer. Also invoke the real submit handler
 // directly to verify the JS guard cannot be bypassed by a crafted submit.
 if(forceSubmit)await page.locator('#activateForm').evaluate(form=>
   form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 else await page.locator('#confirm').click();
 if(success){
  await page.waitForURL(new RegExp('/index[.]html[?]mode=store&store='+u.store+'#pos'),{timeout:8000});
  ok(calls.indexOf('user')>=0&&calls.indexOf('user')<calls.indexOf('store_primary_owner_accept_invitation'),
    'Password PUT must precede accept RPC');
  ok(calls.includes('admin_context'),'Activated account requires role check');
  ok((await page.evaluate(()=>JSON.parse(localStorage.getItem('baekeok_auth')||'null')))?.access_token===u.token,
    'Persist only the accepted account session');
 }else{
  await page.waitForTimeout(180);
  ok(page.url().includes('/owner_activation.html'),'Rejected invite must not redirect');
  ok((await page.evaluate(()=>localStorage.getItem('baekeok_auth')))===null,'Rejected invite must not save token');
 }
 ok(errs.length===0,'No activation JavaScript errors: '+errs);
 await page.close();
}
async function recipes(){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errs=[];
 page.on('pageerror',e=>errs.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  return u.origin===base?route.continue():route.abort('blockedbyclient');
 });
 const visit=async(store,role)=>{
  await page.goto(base+'/recipe-fixture.html?store='+store+'&role='+role);
  await page.locator('.recipe-v220,#rvStaffRetry').first().waitFor({timeout:7000});
 };
 await visit(701,'OWNER');
 ok((await page.locator('#view').innerText()).includes(baseRecipe.menu_name),'Source recipe initially shown');
 await page.locator('.recipe-v220-edit').click();
 await page.locator('#rvName').fill('지점 전용 테스트 라떼');
 await page.locator('[data-variant] textarea').first().fill('우유 220ml');
 await page.locator('#rvSave').click();
 await page.waitForFunction(()=>document.querySelector('#view')?.textContent?.includes('지점 전용 테스트 라떼'),null,{timeout:6000});
 ok(overrides.has(701),'Actual editor saved local override');
 ok(!overrides.has(702),'Other store override untouched');
 ok(baseRecipe.menu_name==='본사 테스트 라떼'&&baseRecipe.instructions[0].content==='우유 180ml','Source recipe immutable');
 await visit(702,'OWNER');
 ok((await page.locator('#view').innerText()).includes('본사 테스트 라떼'),'Other branch gets original source');
 await visit(701,'STAFF');
 ok((await page.locator('#view').innerText()).includes('현재 출근 중인 직원만'),'Offshift staff blocked');
 workers.get(210).working=true;
 await page.locator('#rvStaffRetry').click();
 await page.locator('#rvStaffPin').fill('9999');
 await page.locator('#rvStaffRead').click();
 await page.waitForTimeout(100);
 ok((await page.locator('#rvStaffError').innerText()).length>0,'Bad staff PIN blocked');
 await page.locator('#rvStaffPin').fill('1234');
 await page.locator('#rvStaffRead').click();
 await page.locator('.recipe-v220-card').waitFor({timeout:6000});
 ok((await page.locator('#view').innerText()).includes('지점 전용 테스트 라떼'),'Shift-verified employee reads local recipe');
 ok((await page.locator('[data-edit]').count())===0,'Staff has no editor');
 await visit(701,'OWNER');
 await page.locator('.recipe-v220-edit').click();
 await page.locator('#rvReset').click();
 await page.waitForFunction(()=>document.querySelector('#view')?.textContent?.includes('본사 테스트 라떼'),null,{timeout:6000});
 ok(!overrides.has(701)&&!overrides.has(702),'Reset restores canonical recipe without leaking stores');
 ok(errs.length===0,'No recipe JS error: '+errs);
 await page.close();
}
try{
 const owner=invite('OWNER',701,'owner'),assistant=invite('ASSISTANT',701,'assistant');
 const mismatch=invite('OWNER',702,'wrong-store'),invalid=invite('OWNER',701,'bad-password');
 const reject=invite('OWNER',701,'server-failure');
 ok(mail.length===5,'Mailbox contains five fake invitations, no SMTP');
 await activate(owner);ok(owner.ownerAssigned,'Representative promotion from real activation page');
 await activate(assistant);ok(!assistant.ownerAssigned,'Assistant must not be promoted to owner');
 await activate(mismatch,{ctxStore:701,success:false});
 await activate(invalid,{password:'short',success:false}); // Native HTML validity
 await activate(invalid,{password:'short',forceSubmit:true,success:false}); // JS handler security
 await activate(reject,{fail:true,success:false});
 await recipes();
 console.log('PASS #1000 sandbox browser: invite/accept/password/owner/assistant/error/recipe edit/reset/employee access; assertions='+checks);
}catch(error){
 fs.mkdirSync('qa-results',{recursive:true});
 fs.writeFileSync('qa-results/store-opening-browser-v1-failure.txt',String(error&&error.stack||error));
 for(const [ci,ctx] of browser.contexts().entries()){
  for(const [pi,page] of ctx.pages().entries()){
   try{
    await page.screenshot({path:'qa-results/store-opening-browser-v1-'+ci+'-'+pi+'.png',fullPage:true,timeout:3000});
   }catch(_){/* Preserve the original test failure even if capture fails. */}
  }
 }
 throw error;
}finally{
 await browser.close();
 await new Promise(r=>server.close(r));
}
