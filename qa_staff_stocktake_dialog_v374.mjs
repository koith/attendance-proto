// Executes the real staff dialog and shared styles against synthetic BE only.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium,webkit} from 'playwright';
const css=readFileSync('index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://local').pathname;
 if(['/invite-preview','/recovery-preview'].includes(p)){
  const name=p==='/invite-preview'?'invite':'recovery';res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(readFileSync('supabase/email-templates/'+name+'.html','utf8').replace('https://koith.github.io/attendance-proto/owner_activation.html#type=recovery&amp;token_hash={{ .TokenHash }}','#preview-only').replace('{{ .ConfirmationURL }}','#preview-only').replace('https://koith.github.io/attendance-proto/logo_combine.jpg','/logo_combine.jpg'));return;
 }
 if(p==='/logo_combine.jpg'){res.setHeader('Content-Type','image/jpeg');res.end(readFileSync('logo_combine.jpg'));return;}
 if(p==='/'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><link rel="stylesheet" href="/operations_v1.css"><link rel="stylesheet" href="/modal_header_968.css"><link rel="stylesheet" href="/operations_staff_stocktake_v1.css"><body><button class="btn btn-secondary" id="staffCountOpen" onclick="openStaffStocktake()">재고 파악(직원용)</button><script src="/operations_staff_stocktake_v1.js"></script></body></html>');return;
 }
 if(['/operations_v1.css','/modal_header_968.css','/operations_staff_stocktake_v1.css','/operations_staff_stocktake_v1.js'].includes(p)){
  res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync('.'+p));return;
 }
 res.writeHead(404).end();
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port,rows=[];mkdirSync('qa-results/staff-stocktake-dialog',{recursive:true});
async function fit(page){
 const result=await page.evaluate(()=>{
  const s=document.querySelector('.staff-count-sheet'),h=document.querySelector('.staff-count-head'),f=document.querySelector('#staffCountFooter');
  const b=s.getBoundingClientRect(),hb=h.getBoundingClientRect(),fb=f.hidden?null:f.getBoundingClientRect();
  return {overflow:s.scrollWidth>s.clientWidth+1,x:b.x,right:b.right,bottom:b.bottom,header:hb.top,footer:fb?.bottom,window:innerWidth,height:innerHeight,font:getComputedStyle(document.querySelector('#staffCountPin')).fontSize};
 });
 assert.equal(result.overflow,false);assert.ok(result.x>=-1&&result.right<=result.window+1);
 assert.ok(result.bottom<=result.height+1&&result.header>=-1);if(result.footer)assert.ok(result.footer<=result.height+1);
 assert.equal(result.font,'16px','iPhone inputs should not zoom on focus');
}
try{
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
   for(const width of [320,375,393,430,1280]){
    const context=await browser.newContext({viewport:{width,height:width===1280?900:760},locale:'ko-KR'}),page=await context.newPage();
    await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    await page.addInitScript(()=>{
     window.LIVE=true;window.canUseStaffStocktake=()=>true;window.staffQACalls=[];window.confirm=()=>true;
     window.BE={
      posPublicStaffCards:async()=>[{id:101,name:'가상 직원',working:true},{id:102,name:'퇴근 직원',working:false}],
      staffStocktakeCatalog:async(id,pin)=>{
       if(id!==101||pin!=='1234')throw Error('STAFF_PIN_REQUIRED');
       window.staffQACalls.push('catalog');return Array.from({length:10},(_,i)=>({id:i+11,name:i?'품목 '+i:'아주 긴 품목명으로 표시되는 테스트용 스페셜티 원두',unit:i?'개':'g'}));
      },
      staffStocktakeSubmit:async(id,pin,lines)=>{
       if(id!==101||pin!=='1234'||lines.length!==8)throw Error('BAD_SUBMISSION');
       window.staffQACalls.push('submit');return {status:'SUBMITTED',id:999,stock_changed:false};
      }
     };
    });
    await page.goto(base);await page.click('#staffCountOpen');
    await page.getByRole('dialog',{name:'재고 파악(직원용)'}).waitFor();
    assert.equal(await page.locator('#staffCountEmployee option').count(),1);
    assert.equal(await page.locator('#staffCountFooter').isVisible(),false);await fit(page);
    if(width===375)await page.screenshot({path:'qa-results/staff-stocktake-dialog/'+name+'-375-start.png'});
    await page.fill('#staffCountPin','1234');await page.click('#staffCountVerify');
    await page.locator('#staffCountWorkspace').waitFor({state:'visible'});
    assert.equal(await page.locator('#staffCountSubmit').isDisabled(),true);
    for(let i=0;i<8;i++){
     await page.selectOption('#staffCountItem',String(i+11));await page.fill('#staffCountQty',i?'2.5':'12.125');await page.click('#staffCountAdd');
    }
    assert.equal(await page.locator('.staff-count-line').count(),8);assert.equal(await page.locator('#staffCountLineCount').innerText(),'8개');
    await page.selectOption('#staffCountItem','11');await page.fill('#staffCountQty','0');await page.press('#staffCountQty','Enter');
    assert.equal(await page.locator('.staff-count-line').count(),8,'recount must replace the same local item');
    await fit(page);
    if([375,1280].includes(width))await page.screenshot({path:'qa-results/staff-stocktake-dialog/'+name+'-'+width+'-ready.png'});
    await page.click('#staffCountSubmit');
    await page.waitForFunction(()=>document.getElementById('staffCountStatus').textContent.includes('점주에게 제출했습니다'));
    assert.equal(await page.locator('#staffCountPin').inputValue(),'');assert.equal(await page.locator('#staffCountFooter').isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>window.staffQACalls),['catalog','submit']);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.staff-count-modal').count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'staffCountOpen');
    rows.push({engine:name,width,result:'PASS',operatingRequests:0});await context.close();
   }
   for(const template of ['invite','recovery'])for(const width of [375,1280]){
    const page=await browser.newPage({viewport:{width,height:1100}});
    await page.goto(base+'/'+template+'-preview');
    await page.waitForFunction(()=>document.querySelector('img')?.complete);
    assert.ok(await page.locator('img[alt="백억커피"]').evaluate(x=>x.naturalWidth>0));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await page.locator('a[href="#preview-only"]').count(),1);
    await page.screenshot({path:'qa-results/staff-stocktake-dialog/'+name+'-'+template+'-'+width+'.png',fullPage:true});
    await page.close();
   }
  }finally{await browser.close();}
 }
}finally{await new Promise(done=>server.close(done));}
assert.equal(rows.length,10);writeFileSync('qa-results/staff-stocktake-dialog/results.json',JSON.stringify(rows,null,2));
console.log('STAFF_COUNT_DIALOG_PASS '+JSON.stringify(rows));
