// Full shipped app PIN pad -> REAL isolated PostgREST -> guarded DB functions.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const api=process.env.PIN_QA_HTTP||'http://127.0.0.1:55443';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost|postgrest):\d+$/.test(api),'isolated endpoint only');
const root=resolve('.');const server=createServer((req,res)=>{
 const name=new URL(req.url,'http://local').pathname,path=resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!path.startsWith(root+'/')||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404).end();return}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
let passed=0,id=710025;
try{for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{for(const width of [393,1280]){
  const emp=id++,context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();let working=false;const writes=[];
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();
   if(!u.pathname.includes('/rest/v1/rpc/'))return route.abort();
   const name=u.pathname.split('/').at(-1),args=JSON.parse(req.postData()||'{}');
   const reply=(b,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});
   if(['punch','pos_unlock_store'].includes(name)){
    assert.equal(Number(args.p_employee_id||emp),emp);
    if(name==='pos_unlock_store'){assert.equal(args.p_store_id,710001);assert.equal(args.p_employee_no,emp-710000)}
    const r=await fetch(api+'/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}),b=await r.json();
    writes.push({name,status:r.status,ok:b.ok,type:b.type});if(name==='punch'&&b.ok)working=b.type==='IN';return reply(b,r.status);
   }
   if(name==='list_stores')return reply([{id:710001,name:'Synthetic QA store',is_active:true}]);
   if(['pos_public_staff_cards','pos_employees_state','list_employees_state'].includes(name))return reply([{id:emp,name:'Synthetic QA employee',employee_no:emp-710000,store_id:710001,is_active:true,working,working_since:null,today_work_seconds:0}]);
   if(['is_admin','is_hq_admin','can_manage_store'].includes(name))return reply(false);
   if(name==='admin_context')return reply({role:'NONE',store_id:null});
   return reply([]); // Other app work is mocked, NEVER forwarded to production.
  });
  await page.goto(base+'/index.html?mode=store&store=710001#pos');await page.locator('#empGrid .emp').first().waitFor({timeout:20000});
  for(const expected of ['IN','OUT']){
   await page.locator('#empGrid .emp').first().click();await page.locator('#padVeil.show').waitFor();
   for(const digit of '1234')await page.locator('#padKeys').getByRole('button',{name:digit,exact:true}).click();
   await page.locator('#padKeys .ok-action').click();
   await page.waitForFunction(expected=>document.querySelector('#empGrid .emp')?.classList.contains('working')===(expected==='IN'),expected);
   assert.equal(writes.filter(x=>x.name==='punch').at(-1).type,expected);
   await page.locator('#success').click({force:true});
  }
  assert.equal(writes.filter(x=>x.name==='pos_unlock_store').length,1,'no extra kiosk login/PIN phase');
  assert.deepEqual(writes.filter(x=>x.name==='punch').map(x=>x.type),['IN','OUT']);
  assert.ok(writes.every(x=>x.ok&&x.status===200));passed++;console.log('PASS full app real isolated PIN flow '+engine+' '+width);
  await context.close();
 }}finally{await browser.close()}
}}finally{await new Promise(r=>server.close(r))}
console.log('PIN_SECURITY_BROWSER_PASS '+passed);
