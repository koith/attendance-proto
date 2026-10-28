import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const appStyles=readFileSync('index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const html='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+appStyles+'</style><link rel="stylesheet" href="/store_manager_ui_v376.css"><div class="employee-tabs"></div><div class="employee-panel"></div><script>const CURRENT_STORE_ID=80,CONFIG={SUPABASE_URL:"https://assistant-fixture.invalid",SUPABASE_ANON_KEY:"fixture-public"},Auth={token:"fixture",getUser:async()=>({id:window.TEST_ROLE==="OWNER"?"owner-id":"assistant-id",email:"test@synthetic.invalid"})};function toast(k,t,m){window.NOTICES.push({k,t,m})}</script><script src="/store_manager_tab.js"></script><script>mountStoreManagerTab()</script>';
const server=createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;if(p==='/store_manager_ui_v376.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync('store_manager_ui_v376.css'));return;}res.setHeader('Content-Type',p==='/store_manager_tab.js'?'text/javascript':'text/html; charset=utf-8');res.end(p==='/store_manager_tab.js'?readFileSync('store_manager_tab.js'):html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,proof=[];
mkdirSync('qa-results/assistant-permissions',{recursive:true});
try{for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});try{for(const width of [320,375,393,430,1280])for(const role of ['OWNER','ASSISTANT']){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),calls=[];
 let rights={attendance_view:false,attendance_approve:false,staff_edit:false},removed=false;
 await page.addInitScript(role=>{window.TEST_ROLE=role;window.NOTICES=[]},role);
 await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();
 assert.equal(u.origin,'https://assistant-fixture.invalid');const fn=u.pathname.split('/').at(-1),body=JSON.parse(req.postData()||'{}');calls.push({fn,body});
 const send=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
 const rows=[{user_id:'owner-id',email:'owner@synthetic.invalid',manager_role:'OWNER'},...removed?[]:[{user_id:'assistant-id',email:'assistant@synthetic.invalid',manager_role:'MANAGER'}]];
 if(fn==='store_delegated_manager_list')return send(rows);
 if(fn==='store_manager_invitation_states')return send(rows.map(r=>({...r,intended_role:r.manager_role==='OWNER'?'OWNER':'ASSISTANT',account_state:'ACTIVE'})));
 if(fn==='is_hq_admin')return send(false);
 if(fn==='store_assistant_permissions_list')return send([{user_id:'assistant-id',...rights}]);
 if(fn==='store_assistant_permissions_set'){assert.equal(body.p_store_id,80);assert.equal(body.p_user_id,'assistant-id');assert.equal('p_payroll_view' in body,false);rights={attendance_view:body.p_attendance_view||body.p_attendance_manage,attendance_approve:body.p_attendance_manage,staff_edit:body.p_staff_edit};return send({ok:true});}
 if(fn==='store_delegated_manager_change'){assert.equal(body.p_action,'REVOKE');assert.equal(body.p_user_id,'assistant-id');removed=true;return send({ok:true});}
 throw Error('unexpected request '+fn);
 });
 page.on('dialog',d=>d.accept());await page.goto(base);await page.locator('.smt-delegate').waitFor();
 if(role==='OWNER'){
 const manage=page.locator('[data-manager-manage]');await manage.click();const dialog=page.getByRole('dialog');
 await dialog.waitFor();assert.equal(await dialog.locator('input').count(),3);
 assert.match(await dialog.innerText(),/급여 정보는 보조 관리자에게 공개되지 않습니다/);
 assert.ok(await dialog.locator('[data-manager-revoke]').isVisible());
 const saveStyle=await dialog.locator('[data-permission-save]').evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,height:n.getBoundingClientRect().height}));
 assert.notEqual(saveStyle.background,'rgb(255, 255, 255)');assert.equal(saveStyle.color,'rgb(255, 255, 255)');assert.ok(saveStyle.height>=44);
 const dangerStyle=await dialog.locator('[data-manager-revoke]').evaluate(n=>({color:getComputedStyle(n).color,height:n.getBoundingClientRect().height}));
 assert.equal(dangerStyle.color,'rgb(180, 35, 24)');assert.ok(dangerStyle.height>=44);
 await dialog.locator('[data-allow="attendance"]').check();assert.equal(await dialog.locator('[data-allow="view"]').isChecked(),true);
 await dialog.locator('[data-allow="view"]').uncheck();assert.equal(await dialog.locator('[data-allow="attendance"]').isChecked(),false);
 await dialog.locator('[data-allow="view"]').check();await dialog.locator('[data-permission-save]').click();await dialog.waitFor({state:'detached'});
 assert.deepEqual(rights,{attendance_view:true,attendance_approve:false,staff_edit:false});
 await manage.click();await dialog.locator('[data-allow="attendance"]').check();await dialog.locator('[data-allow="staff"]').check();await dialog.locator('[data-permission-save]').click();await dialog.waitFor({state:'detached'});
 assert.deepEqual(rights,{attendance_view:true,attendance_approve:true,staff_edit:true});
 await manage.click();await page.screenshot({path:'qa-results/assistant-permissions/'+engine+'-'+width+'.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await manage.evaluate(n=>n===document.activeElement),true);
 await manage.click();await dialog.locator('[data-manager-revoke]').click();await dialog.waitFor({state:'detached'});
 await page.locator('.smt-delegate').waitFor({state:'detached'});assert.ok(await page.locator('.smt-owner').isVisible());
 }else{assert.equal(await page.locator('[data-manager-manage]').count(),0);assert.equal(calls.some(x=>x.fn==='store_assistant_permissions_set'),false);}
 proof.push({engine,width,role,result:'PASS',operatingWrite:false});await context.close();
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
writeFileSync('qa-results/assistant-permissions/report.json',JSON.stringify(proof,null,2));console.log('ASSISTANT_PERMISSIONS_BROWSER_PASS '+proof.length);

