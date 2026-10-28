// --live reads deployed Pages and narrowly allowed public/Auth GET endpoints.
// Fixture mode executes the same app with synthetic Auth/RPC transports.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const live=process.argv.includes('--live'),expectedVersion='v0.373',root=process.cwd();
const expectedIndex=readFileSync('index.html','utf8');
const apiOrigin='https://waluhdgqhwjjwmflhrle.supabase.co';
let server,base='https://koith.github.io';
if(!live){
 server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  const local=pathname.replace(/^\/attendance-proto\/?/,'')||'index.html';
  const file=resolve(root,local);
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  if(local==='app-release.json'){res.writeHead(404).end();return;}
  try{res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'}[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(readFileSync(file));}
  catch{res.writeHead(404).end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+server.address().port;
}
const activeBrowsers=new Set();
const report=[],paths=['/attendance-proto/','/attendance-proto/index.html?v=24#pos',
 '/attendance-proto/#dashboard','/attendance-proto/index.html?mode=hq#dashboard',
 '/attendance-proto/?mode=store&store=1#pos','/attendance-proto/index.html?mode=store&store=1&v=0.371#pos'];
const profiles=live?['fresh','expired-no-refresh','hosted-rejected-refresh']:['fresh','expired-no-refresh','hosted-rejected-refresh','reused-refresh','superseded','forbidden','auth-network','store-network'];
const jwt=exp=>'qa.'+Buffer.from(JSON.stringify({exp,sub:'synthetic-identity'})).toString('base64url')+'.test';
const readOnlyRPC=new Set(['list_stores','pos_public_staff_picker','pos_public_staff_cards','pos_employees_state']);
async function prepare(context,profile){
 await context.addInitScript(({profile,token})=>{
  if(localStorage.getItem('qa_legacy_seeded'))return;
  localStorage.setItem('qa_legacy_seeded','1');localStorage.setItem('qa_preserve','unchanged');
  sessionStorage.setItem('baekeok_store_id','80');sessionStorage.setItem('baekeok_store_name','1호점');
  if(profile!=='fresh'&&profile!=='store-network')localStorage.setItem('baekeok_auth',JSON.stringify({access_token:token,...(['reused-refresh','hosted-rejected-refresh'].includes(profile)?{refresh_token:'qa1243v373xx'}:{})}));
 },{profile,token:jwt(Math.floor(Date.now()/1000)+(profile.startsWith('expired')||['reused-refresh','hosted-rejected-refresh'].includes(profile)?-3600:3600))});
}
async function visit(browser,engine,path,profile,storageState){
 const context=await browser.newContext({viewport:{width:engine==='webkit'?393:1280,height:900},locale:'ko-KR',timezoneId:'Asia/Seoul',...(storageState?{storageState}:{})});
 if(!storageState)await prepare(context,profile);const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[],calls=[];let fault=true,hostedRejection;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===base){assert.ok(['GET','HEAD'].includes(req.method()));return route.continue();}
  if(u.origin!==apiOrigin)return route.abort();
  const cors={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'apikey,authorization,content-type'};
  const reply=(body,status=200)=>route.fulfill({status,headers:cors,contentType:'application/json',body:JSON.stringify(body)});
  const name=u.pathname.split('/').pop();calls.push({path:u.pathname,method:req.method()});
  if(live){
   if(u.pathname==='/auth/v1/token'){
    assert.equal(profile,'hosted-rejected-refresh');assert.equal(req.method(),'POST');
    assert.equal(u.search,'?grant_type=refresh_token');
    assert.deepEqual(JSON.parse(req.postData()),{refresh_token:'qa1243v373xx'});
    const response=await route.fetch({timeout:15000});const body=await response.json();
    assert.equal(response.status(),400);assert.equal(body.error_code,'refresh_token_not_found');
    hostedRejection={status:response.status(),numericCode:body.code,errorCode:body.error_code};
    return route.fulfill({response});
   }
   const publicAuth=u.pathname==='/auth/v1/settings',publicRPC=u.pathname.startsWith('/rest/v1/rpc/')&&readOnlyRPC.has(name);
   assert.ok((publicAuth&&['GET','OPTIONS'].includes(req.method()))||
    (publicRPC&&['POST','OPTIONS'].includes(req.method())),'OPERATING_WRITE_FORBIDDEN '+u.pathname);
   if(req.method()==='OPTIONS')return route.continue();
   const body=req.postData()?JSON.parse(req.postData()):{};
   if(body.p_store_id!==undefined)assert.equal(Number(body.p_store_id),1,'foreign store request forbidden');
   return route.continue();
  }
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors,body:''});
  if(u.pathname==='/auth/v1/token')return reply(profile==='hosted-rejected-refresh'?{code:400,error_code:'refresh_token_not_found',msg:'Invalid Refresh Token: Refresh Token Not Found'}:{code:'refresh_token_already_used'},400);
  if(name==='admin_context'){
   if(profile==='auth-network'&&fault)return route.abort('failed');
   if(profile==='superseded')return reply({code:'PT403',message:'SESSION_SUPERSEDED'},403);
   if(profile==='forbidden')return reply({code:'42501',message:'NOT_AUTHORIZED'},403);
   return reply({role:'HQ',store_id:null});
  }
  if(name==='list_stores'){
   if(profile==='store-network'&&fault)return route.abort('failed');
   return reply([{id:1,name:'인하대학교점',is_active:true}]);
  }
  if(name==='is_hq_admin'||name==='is_admin')return reply(true);
  if(name==='hq_field_data_readiness')return reply({store_ready:true,operational_ready:true});
  return reply([]);
 });
 const response=await page.goto(base+path,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
 await page.waitForFunction(()=>!document.querySelector('#view')?.textContent.includes('지점 연결 확인 중'),null,{timeout:23000});
 if(profile==='forbidden'||profile==='auth-network'){
  assert.equal(await page.locator('#startupAdminLogin').count(),1);
  assert.ok(!await page.locator('#view').innerText().then(x=>x.includes('지점 서버 연결이 지연')));
  assert.ok(!calls.some(c=>c.path.endsWith('/list_stores')),'unverified account cannot fall back to Inha');
  if(profile==='auth-network'){
   fault=false;await page.locator('#retryStoreConnect').click();
   await page.waitForFunction(()=>document.querySelector('#conn')?.textContent.includes('클라우드 연결됨'));
  }else{
   await page.locator('#startupAdminLogin').click();await page.locator('#loginEmail').waitFor();
  }
 }else{
  if(profile==='store-network'){
   assert.match(await page.locator('#conn').innerText(),/연결 확인 실패/);
   fault=false;await page.locator('#retryStoreConnect').click();
   await page.waitForFunction(()=>document.querySelector('#conn')?.textContent.includes('클라우드 연결됨'));
  }
  if(profile==='hosted-rejected-refresh'){
   if(live)assert.equal(hostedRejection?.errorCode,'refresh_token_not_found');
   assert.equal(await page.evaluate(()=>localStorage.getItem('baekeok_auth')),null);
  }
  const view=await page.locator('#view').innerText();
  assert.ok(!/지점 서버 연결이 지연|지점 운영 준비 중/.test(view));
  assert.equal((await page.locator('#appVersion').innerText()).trim(),expectedVersion);
  assert.match(await page.locator('#conn').innerText(),/클라우드 연결됨/);
  if(path.includes('#dashboard')){
   await page.locator('#loginEmail').waitFor();
   if(live)assert.equal(await page.evaluate(async()=>{
    const r=await fetch(CONFIG.SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:CONFIG.SUPABASE_ANON_KEY}});return r.status;
   }),200,'Auth settings and CORS must be reachable from the original browser URL');
  }
  else assert.equal(await page.evaluate(()=>CURRENT_STORE_ID),1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#conn')?.textContent.includes('클라우드 연결됨'),null,{timeout:23000});
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('qa_preserve')),'unchanged');
 assert.deepEqual(errors,[]);
 const state=await context.storageState();
 report.push({engine,path,profile,result:'PASS',version:expectedVersion,readOnly:live,requests:calls.length,...(hostedRejection?{hostedRejection}:{})});
 await context.close();return state;
}
try{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  let browser=await type.launch({headless:true}),saved;activeBrowsers.add(browser);
  for(const path of paths)for(const profile of profiles){
   // Fault recovery is verified on the legacy root; all normal stored/fresh
   // profiles traverse every real legacy/new URL form and reload.
   if(!live&&['forbidden','auth-network','store-network','superseded','reused-refresh'].includes(profile)&&path!==paths[0])continue;
   saved=await visit(browser,engine,path,profile);
  }
  await browser.close();activeBrowsers.delete(browser);browser=await type.launch({headless:true});activeBrowsers.add(browser);
  await visit(browser,engine,paths[2],'fresh',saved);
  report[report.length-1].profile='browser-process-restart';
  await browser.close();activeBrowsers.delete(browser);
 }
}finally{await Promise.allSettled([...activeBrowsers].map(b=>b.close()));if(server)await new Promise(done=>server.close(done));}
mkdirSync('qa-results',{recursive:true});
writeFileSync('qa-results/legacy-entry-v372-'+(live?'live':'fixture')+'.json',JSON.stringify({commit:process.env.GITHUB_SHA,harnessCommit:process.env.QA1243_HARNESS_SHA||process.env.GITHUB_SHA,scope:live?'DEPLOYED_URL_READ_ONLY':'REAL_APPLICATION_SYNTHETIC_NETWORK',operatingWrite:false,report},null,2));
console.log('LEGACY_ENTRY_'+(live?'DEPLOYED':'FIXTURE')+'_PASS '+JSON.stringify({count:report.length,version:expectedVersion,operatingWrite:false,report}));
