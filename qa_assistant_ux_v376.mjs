import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const index=readFileSync('index.html','utf8'),styles=index.match(/<style>([\s\S]*?)<\/style>/)[1];
const a=index.indexOf('function adminSubnav('),b=index.indexOf('\nfunction upgradeLegacyPageTitle(',a);assert.ok(a>0&&b>a);const menu=index.slice(a,b);
const html='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'</style><link rel="stylesheet" href="/store_manager_ui_v376.css"><div id="view"></div><script>const view=document.getElementById("view"),CURRENT_STORE_ID=80,LIVE=true,CONFIG={SUPABASE_URL:"https://assistant-ux.invalid",SUPABASE_ANON_KEY:"public-fixture"},Auth={token:"fixture",getUser:async()=>({email:"assistant@synthetic.invalid"}),clear:()=>sessionStorage.setItem("qaLogoutCount",String(Number(sessionStorage.getItem("qaLogoutCount")||0)+1))};function openPersonalSettings(){window.settingsOpened=true}function toast(){}</script><script>'+menu+'</script><script src="/store_limited_manager.js"></script><script>mountScopedManagerPortal({limited:true,attendance_view:window.QA_SCOPE!=="NONE",attendance_approve:window.QA_SCOPE==="ALL",staff_edit:window.QA_SCOPE==="ALL",payroll_view:false},80)</script>';
const server=createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;if(['/store_limited_manager.js','/store_manager_ui_v376.css'].includes(p)){res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync('.'+p));return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,proof=[];
mkdirSync('qa-results/assistant-ux-v376',{recursive:true});
try{for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});try{for(const width of [320,375,393,430,1280])for(const scope of ['NONE','VIEW','ALL']){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),calls=[];
 await page.addInitScript(scope=>{window.QA_SCOPE=scope},scope);
 await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();assert.equal(u.origin,'https://assistant-ux.invalid');const fn=u.pathname.split('/').at(-1);calls.push(fn);const data=fn==='store_limited_employee_list'?[{id:881,name:'동료',employee_no:1,is_active:true,memo:''}]:[];assert.ok(['store_limited_employee_list','store_limited_pending_requests'].includes(fn));return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto(base);
 const trigger=page.getByRole('button',{name:'관리자 계정 메뉴'});await trigger.waitFor();
 assert.equal(await page.locator('#limitedManagerLogout').count(),0);
 assert.equal(await page.locator('#adminAccountLogout').isVisible(),false);
 assert.equal(await page.locator('.admin-subtabs a[href="#pay"]').count(),0);
 if(scope!=='NONE'){
 const tile=page.locator('.scoped-work-entry');assert.ok((await tile.boundingBox()).height<=90);
 assert.equal(await tile.getByRole('link',{name:'전체 직원 근무현황 열기'}).getAttribute('href'),'actual_attendance.html?store=80');
 }
 if(scope==='ALL'){
 assert.equal(await page.locator('.limited-staff-form').isVisible(),false);
 await page.locator('[data-scoped-area="staff"]>summary').click();await page.locator('.limited-staff-form').waitFor();
 await page.locator('[data-scoped-area="staff"]>summary').click();
 }
 await trigger.click();await page.getByText('assistant@synthetic.invalid',{exact:true}).waitFor();
 page.once('dialog',d=>{assert.equal(d.type(),'confirm');d.dismiss()});
 await page.locator('#adminAccountLogout').click();assert.equal(await page.evaluate(()=>sessionStorage.getItem('qaLogoutCount')),null);
 await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
 await trigger.click();await page.locator('#adminAccountSettings').click();assert.equal(await page.evaluate(()=>window.settingsOpened),true);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'qa-results/assistant-ux-v376/'+engine+'-'+width+'-'+scope+'.png'});
 await trigger.click();page.once('dialog',d=>d.accept());await Promise.all([page.waitForEvent('framenavigated'),page.locator('#adminAccountLogout').click()]);
 await trigger.waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('qaLogoutCount')),'1');
 assert.equal(calls.some(fn=>fn.includes('payroll')),false);
 proof.push({engine,width,scope,result:'PASS',logoutCancelPreservesSession:true,logoutConfirm:true,operatingWrite:false});await context.close();
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r))}
writeFileSync('qa-results/assistant-ux-v376/report.json',JSON.stringify(proof,null,2));console.log('ASSISTANT_UX_BROWSER_PASS '+proof.length);

