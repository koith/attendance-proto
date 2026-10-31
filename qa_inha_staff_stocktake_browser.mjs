import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium,webkit} from 'playwright';
const live=process.argv.includes('--live'),html=readFileSync('index.html','utf8'),module=readFileSync('operations_staff_stocktake_v1.js','utf8');
const predicate=html.match(/function canUseStaffStocktake\(\)\{[\s\S]*?\n\}/)[0];
const pos=html.slice(html.indexOf('async function renderPos(){'),html.indexOf('  const grid=',html.indexOf('async function renderPos(){')))+'}';
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 if(path==='/module.js'){res.setHeader('Content-Type','text/javascript');return res.end(module)}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body><main id="view"></main><script>let STORE_ENTRY_LOADING=false,STORE_ENTRY_UNAVAILABLE=false,CURRENT_STORE_ID=1,STORE_ENTRY_MODE="store";const LIVE=true,view=document.getElementById("view"),BE={posPublicStaffCards:async()=>[]};'+predicate+';'+pos+';window.setContext=async(id,loading=false,unavailable=false,mode="store")=>{CURRENT_STORE_ID=id;STORE_ENTRY_LOADING=loading;STORE_ENTRY_UNAVAILABLE=unavailable;STORE_ENTRY_MODE=mode;window.dispatchEvent(new CustomEvent("baekeok:store-context-change"));await renderPos()};renderPos();</script><script src="/module.js"></script></body></html>');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const fixture='http://127.0.0.1:'+server.address().port,base='https://koith.github.io/attendance-proto/',rows=[];
try{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{for(const width of [393,1280]){
   const context=await browser.newContext({viewport:{width,height:900},locale:'ko-KR'}),page=await context.newPage();
   await page.route('**/*',route=>{
    const r=route.request(),u=new URL(r.url());
    if(!live)return u.origin===fixture?route.continue():route.abort();
    if(u.origin==='https://koith.github.io')return r.method()==='GET'?route.continue():route.abort();
    const reads=new Set(['list_stores','pos_public_staff_cards','store_recipe_list_public','list_employees_state']);
    if(u.hostname==='waluhdgqhwjjwmflhrle.supabase.co'&&((r.method()==='GET'&&u.pathname==='/auth/v1/settings')||(r.method()==='POST'&&reads.has(u.pathname.split('/').at(-1)))))return route.continue();
    return route.abort(); // No auth, PIN, automatic-close, or business writes.
   });
   if(live){
    for(const id of [1,80,290]){
     await page.goto(base+'index.html?mode=store&store='+id+'#pos',{waitUntil:'domcontentloaded'});
     await page.waitForFunction(()=>typeof canUseStaffStocktake==='function'&&!STORE_ENTRY_LOADING);
     assert.equal(await page.evaluate(()=>canUseStaffStocktake()),id===1);
     assert.equal(await page.locator('#staffCountOpen').count(),id===1?1:0);
     await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof canUseStaffStocktake==='function'&&!STORE_ENTRY_LOADING);
     assert.equal(await page.locator('#staffCountOpen').count(),id===1?1:0);
     if(id!==1){await page.evaluate(()=>window.openStaffStocktake());assert.equal(await page.locator('.staff-count-modal').count(),0)}
     rows.push({engine,width,store:id,live:true,result:'PASS'});
    }
    await page.goto(base+'?mode=hq#dashboard',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof canUseStaffStocktake==='function');
    assert.equal(await page.locator('#staffCountOpen').count(),0);rows.push({engine,width,hq:true,result:'PASS'});
   }else{
    await page.goto(fixture);
    for(const [id,loading,unavailable,mode] of [[1,false,false,'store'],[80,false,false,'store'],[290,false,false,'store'],[2,false,false,'store'],[1,true,false,'store'],[1,false,true,'store'],[1,false,false,'hq']]){
     await page.evaluate(v=>setContext(...v),[id,loading,unavailable,mode]);
     const allowed=id===1&&!loading&&!unavailable&&mode!=='hq';
     assert.equal(await page.locator('#staffCountOpen').count(),allowed?1:0);
     await page.evaluate(()=>window.openStaffStocktake());assert.equal(await page.locator('.staff-count-modal').count(),allowed?1:0);
     if(allowed){await page.evaluate(()=>setContext(80));assert.equal(await page.locator('.staff-count-modal').count(),0)}
     rows.push({engine,width,store:id,loading,unavailable,mode,result:'PASS'});
    }
   }
   await context.close();
  }}finally{await browser.close()}
 }
}finally{await new Promise(done=>server.close(done))}
mkdirSync('qa-results',{recursive:true});writeFileSync('qa-results/inha-staff-stocktake'+(live?'-live':'')+'.json',JSON.stringify(rows,null,2));
console.log('INHA_STAFF_STOCKTAKE_BROWSER_PASS '+JSON.stringify({cases:rows.length,live,operatingWrite:false}));
