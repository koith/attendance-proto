// #1113: actual operations shell + production CSS in real Chromium viewports.
// The mocked shell only suppresses network draw; markup and CSS are shipped sources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const js=fs.readFileSync('operations_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('operations_v1.css','utf8');
const start=js.indexOf('function shell(tab){');
const end=js.indexOf('// Real, confirmed transactions only.',start);
assert.ok(start>0&&end>start,'production operations shell not found');
const source=js.slice(start,end);
const actionIds=['opsCollectOpen','opsUploadOpen','opsExportActual','opsSaleSkuPreview'];
const localStyles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]).join('\n');
function render(tab){
 const S={tab},view={innerHTML:''},clicked=[];
 const map=new Map([...actionIds,'opsStocktakeOpen','opsReconciliationOpen','opsRefresh']
  .map(id=>[id,{onclick:null}]));
 const document={getElementById:id=>map.get(id)||null};
 const window={mountAdminSubnav:()=>{},openStoreSaleSkuPreview:()=>clicked.push('sku'),
  openStoreInventoryStocktake:()=>clicked.push('stocktake'),
  openStoreOperationsReconciliation:()=>clicked.push('reconciliation')};
 const opsRefresh=map.get('opsRefresh');
 const openOpsModal=k=>clicked.push(k);
 const exportActualOperations=()=>clicked.push('export');
 const draw=()=>clicked.push('draw');
 const factory=new Function('S','range','view','window','document','draw',
  'opsRefresh','opsCollectOpen','opsUploadOpen','openOpsModal','exportActualOperations',source+';return shell;');
 factory(S,()=>['2026-10-01','2026-10-31'],view,window,document,draw,
  opsRefresh,map.get('opsCollectOpen'),map.get('opsUploadOpen'),openOpsModal,exportActualOperations)(tab);
 if(tab==='inquiry'){
  for(const id of actionIds)assert.equal(typeof map.get(id).onclick,'function',id+' lost handler');
  actionIds.forEach(id=>map.get(id).onclick());
  assert.deepEqual(clicked.slice(1),['collect','upload','export','sku']);
 }
 if(tab==='inventory')map.get('opsStocktakeOpen').onclick();
 if(tab==='dashboard')map.get('opsReconciliationOpen').onclick();
 return view.innerHTML;
}
const markups={inquiry:render('inquiry'),inventory:render('inventory'),dashboard:render('dashboard')};
const pageTitle=/<div class="ops-head page-title-row ops-page-header"><div class="ops-page-heading"><h2 class="page-title">([^<]+)<\/h2><\/div>/;
for(const [tab,markup] of Object.entries(markups)){
 assert.match(markup,pageTitle,tab+' heading must be first full-width row');
 assert.ok(markup.indexOf('class="ops-head-actions"')>markup.indexOf('class="ops-page-heading"'),
  'actions must follow heading');
}
assert.equal((markups.inquiry.match(/id="ops(?:CollectOpen|UploadOpen|ExportActual|SaleSkuPreview)"/g)||[]).length,4);
const publishedVersion=html.match(/const APP_VERSION="(v\d+\.\d+)"/)?.[1];
assert.ok(publishedVersion,'application version should be explicit');
assert.ok(html.includes('aria-label="현재 앱 버전 '+publishedVersion+'"'),
 'visible badge and runtime version must agree');
assert.match(html,/operations_v1\.css\?v=[a-zA-Z0-9.-]+/,'layout stylesheet must be cache-busted');
assert.match(html,/operations_v1\.js\?v=[a-zA-Z0-9.-]+/,'operations script must be cache-busted');

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,375,390,414,768,1280]){
  const ctx=await browser.newContext({viewport:{width,height:900},isMobile:width<=414,deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
   '<style>'+localStyles+'\n'+css+'\nbody{margin:0}#view{box-sizing:border-box;max-width:920px;margin:auto;padding:16px;min-width:0}</style>'+
   '<main id="view"></main></html>');
  for(const [tab,markup] of Object.entries(markups)){
   await page.locator('#view').evaluate((node,content)=>node.innerHTML=content,markup);
   if(width===414&&tab==='inquiry'){
    fs.mkdirSync('qa-results',{recursive:true});
    await page.screenshot({path:'qa-results/ops-header-414-mobile.png',fullPage:true});
   }
   const result=await page.evaluate(()=>{
    const header=document.querySelector('.ops-page-header');
    const title=document.querySelector('.ops-page-heading');
    const label=document.querySelector('.ops-page-heading .page-title');
    const rail=document.querySelector('.ops-page-header .ops-head-actions');
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {width:innerWidth,docWidth:document.documentElement.scrollWidth,
      direction:getComputedStyle(header).flexDirection,
      header:box(header),title:box(title),label:box(label),rail:rail?box(rail):null,
      buttons:rail?[...rail.querySelectorAll('button')].map(box):[],
      railOverflow:rail?{client:rail.clientWidth,scroll:rail.scrollWidth}:null};
   });
   assert.equal(result.direction,'column',tab+' '+width+'px: heading and actions must stack vertically');
   assert.ok(result.title.width>=result.header.width*.95,tab+' '+width+'px: squeezed page title');
   assert.ok(result.label.height<75,tab+' '+width+'px: title unexpectedly breaks vertically');
   assert.ok(result.docWidth<=width+1,tab+' '+width+'px: horizontal page overflow');
   if(result.rail){
    assert.ok(result.rail.top>=result.title.bottom-1,tab+' '+width+'px: actions overlap title');
    assert.ok(result.rail.width<=result.header.width+1,tab+' '+width+'px: toolbar escapes card');
    assert.ok(result.buttons.every(b=>Math.abs(b.top-result.buttons[0].top)<=1),
     tab+' '+width+'px: buttons need one horizontal row');
    if(tab==='inquiry'){
     assert.equal(result.buttons.length,4);
     await page.locator('.ops-page-header .ops-head-actions').evaluate(e=>e.scrollLeft=e.scrollWidth);
     const last=await page.locator('#opsSaleSkuPreview').boundingBox();
     const rail=await page.locator('.ops-page-header .ops-head-actions').boundingBox();
     assert.ok(last.x+last.width<=rail.x+rail.width+2,tab+' '+width+'px: final action unreachable');
    }
   }
  }
  await ctx.close();
  console.log('PASS mobile title+one-line independent toolbar viewport '+width+'px');
 }
}finally{await browser.close();}
console.log('PASS #1113: actual app render, original action handlers, 6 responsive widths, no title collision or page overflow');
