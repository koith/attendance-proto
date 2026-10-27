// Real WebKit regression for legacy iPhone Safari URLs.
// All Supabase requests are intercepted with synthetic fixtures.
// No production Auth, database, user, payroll or attendance traffic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {webkit} from 'playwright';

const root=process.cwd();
const contentType={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const local=path.replace(/^\/attendance-proto\/?/,'')||'index.html';
 const absolute=resolve(root,local);
 if(!absolute.startsWith(root+sep)&&absolute!==root){res.writeHead(403).end();return;}
 try{
  const data=readFileSync(absolute);
  res.writeHead(200,{'Content-Type':contentType[extname(local)]||'application/octet-stream',
   'Cache-Control':'no-store'}).end(data);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const superOrigin='https://waluhdgqhwjjwmflhrle.supabase.co';
const expires=Math.floor(Date.now()/1000)-3600;
const expiredJwt='test.'+Buffer.from(JSON.stringify({exp:expires,role:'authenticated'})).toString('base64url')+'.test';
const report=[];
const browser=await webkit.launch({headless:true});
async function runScenario(path){
 const context=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:3,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 await page.addInitScript(token=>{
  localStorage.setItem('baekeok_auth',JSON.stringify({
   access_token:token,refresh_token:'synthetic-expired-revoked-refresh'
  }));
 },expiredJwt);
 const call={refresh:0,publicStore:0,deniedPrivileged:0,unrecognizedPaths:[]};
 await page.route('**/*',async route=>{
  const request=route.request();
  const url=request.url();
  if(url.startsWith(origin))return route.continue();
  if(!url.startsWith(superOrigin))return route.abort();
  const path=new URL(url).pathname;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
   'Access-Control-Allow-Headers':'apikey,authorization,content-type',
   'Content-Type':'application/json'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});
  if(path==='/auth/v1/token'){
   call.refresh++;
   return route.fulfill({status:400,headers,body:JSON.stringify({code:'refresh_token_not_found'})});
  }
  if(path==='/rest/v1/rpc/list_stores'){
   call.publicStore++;
   return route.fulfill({status:200,headers,body:JSON.stringify([
    {id:1,name:'인하대학교점',is_active:true}
   ])});
  }
  if(path==='/rest/v1/rpc/pos_public_staff_picker'||
     path==='/rest/v1/rpc/pos_public_staff_cards')
   return route.fulfill({status:200,headers,body:'[]'});
  call.deniedPrivileged++;
  call.unrecognizedPaths.push(path);
  return route.fulfill({status:401,headers,body:JSON.stringify({code:'not_authorized'})});
 });
 await page.goto(origin+'/attendance-proto/index.html'+path,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{
  const el=document.querySelector('#view');
  return el&&!el.textContent.includes('지점 연결 확인 중');
 },{timeout:14000}).catch(async error=>{
  const view=await page.locator('#view').innerText().catch(()=>'(missing)');
  throw Error('WEBKIT_STUCK_ON_STARTUP '+view.slice(0,250)+' '+error.message);
 });
 const result=await page.evaluate(()=>({
  version:document.getElementById('appVersion')?.textContent,
  view:document.getElementById('view')?.textContent||'',
  lockedName:document.getElementById('lockedStoreName')?.textContent||'',
  savedSession:localStorage.getItem('baekeok_auth')
 }));
 assert.equal(result.version,'v0.371','Must test the new release');
 assert.ok(!result.view.includes('지점 서버 연결이 지연되고 있습니다.'),'Safari must not falsely report backend down');
 assert.ok(!result.view.includes('지점 확인 필요'),'Safari must not show fake store lock');
 assert.equal(result.savedSession,null,'Only invalid local admin session is removed');
 assert.ok(call.refresh>=1,'Expired Safari JWT must request official refresh once');
 assert.ok(call.publicStore>=1,'Public store readiness must still be independently verified');
 assert.equal(call.deniedPrivileged,0,'Expired token cannot call an authorized RPC: '+call.unrecognizedPaths.join(','));
 report.push({path,refresh:call.refresh,publicStore:call.publicStore,
  legacySafariRecovered:true,version:result.version});
 await context.close();
}
try{
 await runScenario('?mode=store&store=1#pos');
 await runScenario('#pos');
 console.log('SAFARI_WEBKIT_LEGACY_LINKS_PASS '+JSON.stringify(report));
}finally{
 await browser.close();
 await new Promise(done=>server.close(done));
}
