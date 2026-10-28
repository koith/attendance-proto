import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const allowed=new Set(['actual_attendance.html','actual_attendance.js','actual_attendance.css','actual_attendance_correction.css','actual_attendance_test_mode_v1.js','supabase_session_resilience_v1.js','no_double_tap_zoom.js']);
const server=createServer((req,res)=>{const f=new URL(req.url,'http://local').pathname.slice(1);if(!allowed.has(f)||!existsSync(f)){res.writeHead(404).end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,proof=[];
mkdirSync('qa-results/assistant-attendance',{recursive:true});
try{for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});try{for(const width of [375,1280])for(const grant of ['VIEW','MANAGE','NONE']){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),calls=[];
 await page.addInitScript(()=>localStorage.setItem('baekeok_auth',JSON.stringify({access_token:'synthetic-only'})));
 const ym=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,7),day=ym+'-01';
 await page.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();
 assert.equal(u.origin,'https://waluhdgqhwjjwmflhrle.supabase.co');
 const fn=u.pathname.split('/').at(-1),body=JSON.parse(req.postData()||'{}');calls.push({fn,body});
 const send=(v,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
 if(fn==='admin_context')return send({role:'STORE_MANAGER',store_id:80});
 if(fn==='store_delegated_permissions_self')return send({limited:true,attendance_view:grant!=='NONE',attendance_approve:grant==='MANAGE',staff_edit:false,payroll_view:false});
 if(fn==='store_attendance_employees')return send([{id:881,name:'동료 A',employee_no:1,is_active:true,store_id:80},{id:882,name:'동료 B',employee_no:2,is_active:true,store_id:80}]);
 if(fn==='store_attendance_settings')return send({open_minute:420,close_minute:1500});
 if(fn==='store_attendance_events')return send({events:[{id:901,employee_id:881,event_type:'IN',event_at:day+'T09:00:00'},{id:902,employee_id:881,event_type:'OUT',event_at:day+'T18:00:00'},{id:903,employee_id:882,event_type:'IN',event_at:day+'T10:00:00'},{id:904,employee_id:882,event_type:'OUT',event_at:day+'T19:00:00'}],corrections:[]});
 throw Error('unexpected request '+fn);
 });
 await page.goto(base+'/actual_attendance.html?store=80');
 if(grant==='NONE'){await page.getByText('ATTENDANCE_VIEW_NOT_ALLOWED',{exact:false}).waitFor();assert.equal(calls.some(x=>x.fn==='store_attendance_employees'),false);}
 else{
 await page.locator('[data-day="'+day+'"]').click();
 await page.getByText('동료 A',{exact:false}).first().waitFor();await page.getByText('동료 B',{exact:false}).first().waitFor();
 assert.equal(await page.locator('#mrPin').count(),0);
 if(grant==='VIEW')assert.equal(await page.locator('.session-actions button,#attendanceAddBtn').count(),0);
 else{assert.ok(await page.locator('.session-actions button').count()>=4);await page.locator('.session-actions .session-fix').first().click();await page.getByRole('dialog').waitFor();assert.ok(await page.locator('#correctionSave').count()||await page.locator('#actualCorrectionVeil').count());}
 await page.screenshot({path:'qa-results/assistant-attendance/'+engine+'-'+width+'-'+grant+'.png'});
 assert.ok(calls.filter(x=>x.fn.startsWith('store_attendance_')).every(x=>!('p_store_id' in x.body)||x.body.p_store_id===80));
 }
 assert.equal(calls.some(x=>x.fn==='staff_actual_attendance'||x.fn==='store_limited_payroll_read'),false);
 proof.push({engine,width,grant,result:'PASS',operatingWrite:false});await context.close();
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
writeFileSync('qa-results/assistant-attendance/report.json',JSON.stringify(proof,null,2));console.log('ASSISTANT_ATTENDANCE_BROWSER_PASS '+proof.length);

