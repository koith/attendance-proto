// #1113 MTG-16: execute actual inventory renderer and production CSS in Chromium.
// No real staff, payroll, recipes, POS writes or server requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const source=fs.readFileSync('operations_reference_ui_v208.js','utf8');
const css=fs.readFileSync('operations_v1.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const begin=source.indexOf('async function renderInventory(refresh=false){');
const end=source.indexOf('async function loadRegisteredRecipes(',begin);
assert.ok(begin>0&&end>begin,'production inventory renderer must be present');
assert.match(source,/return '<section class="ops-order-panel" id="opsInventoryOrders">/);
const appVersion=Number(html.match(/const APP_VERSION="v0\.(\d+)"/)?.[1]);
assert.ok(Number.isSafeInteger(appVersion)&&appVersion>=331,'inventory shortcut renderer must remain active in subsequent releases');
assert.match(html,/operations_reference_ui_v208\.js\?v=[\w.-]+/,'inventory renderer must remain cache-busted');
assert.match(html,/operations_v1\.css\?v=[\w.-]+/,'inventory CSS must stay versioned on every new release');
assert.match(css,/\.ops-inventory-shortcuts\s*\{/,'real inventory navigation CSS must remain in release');
const functionBody=source.slice(begin,end);
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,375,390,414,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<=414,deviceScaleFactor:1});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<style>'+styles+'\n'+css+'\nhtml,body{margin:0}#opsBody{box-sizing:border-box;max-width:920px;margin:auto;padding:12px;min-width:0}</style>'+
    '<main id="opsBody"></main>');
  await page.evaluate(async code=>{
   window.mountAdminSubnav=()=>{};
   window.openInventoryEntryFromUnified=()=>{};
   window.openStoreInventoryAgeReview=()=>{};
   window.refreshStoreInventoryAgeAlert=()=>{};
   const REF={inventory:[{name:'에스프레소 원두',category:'커피',current_text:'3kg',minimum_text:'1kg',order_text:'2kg'}]};
   const managedInventory=[{name:'원두',on_hand:0,target_level:5}];
   const purchaseOrders=[{id:8}];
   const builder=new Function('document','window','REF','inventoryCategory','inventoryQuery',
    'managedInventory','purchaseOrders','stockState','orderPanel','receivingPanel',
    'esc','inventoryCard','loadInventoryManagement','shell','openPurchaseOrder','openReceiveOrder',
    code+';return renderInventory;');
   const render=builder(document,window,REF,'전체','',managedInventory,purchaseOrders,()=>({rank:1}),
    ()=>'<section class="ops-order-panel" id="opsInventoryOrders" style="min-height:130px"><b>발주 필요</b><button id="opsInventoryBulk">일괄 등록</button><button id="opsInventoryAdd">+ 재고 등록</button><button id="opsSupplierHandoffOpen">공급사 주문 입력 보조</button></section>',
    ()=>'<section class="ops-receiving-panel" style="min-height:130px"><b>입고 대기</b></section>',
    v=>String(v),
    row=>'<article class="ops-card" style="height:700px">'+row.name+'</article>',
    async()=>{},()=>document.getElementById('opsBody'),()=>{},()=>{});
   await render(true);
   const original=Element.prototype.scrollIntoView;
   Element.prototype.scrollIntoView=function(...args){
    window.lastInventoryShortcut=this.id;
    if(original)original.apply(this,args);
   };
  },functionBody);
  const nav=page.locator('nav.ops-inventory-shortcuts');
  assert.equal(await nav.count(),1,'real renderer must output one task shortcut rail');
  assert.equal(await nav.locator('button').count(),3,'reorder, review, catalog shortcuts');
  for(const id of ['opsInventoryOrders','opsInventoryAgeSection','opsInventoryCatalog'])
   assert.equal(await page.locator('#'+id).count(),1,'missing actual destination '+id);
  const metrics=await page.evaluate(()=>{
   const rail=document.querySelector('.ops-inventory-shortcuts');
   const box=rail.getBoundingClientRect();
   return {screen:innerWidth,doc:document.documentElement.scrollWidth,
    rail:box.width,body:document.querySelector('#opsBody').getBoundingClientRect().width,
    buttonHeights:[...rail.querySelectorAll('button')].map(x=>x.getBoundingClientRect().height)};
  });
  assert.ok(metrics.doc<=width+1,'whole page horizontal overflow: '+width+'px '+JSON.stringify(metrics));
  assert.ok(metrics.rail<=metrics.body+1,'shortcut bar escapes inventory at '+width+'px');
  assert.ok(metrics.buttonHeights.every(h=>h>=40),'mobile controls below safe touch target');
  await nav.locator('button').nth(0).click();
  assert.equal(await page.evaluate(()=>window.lastInventoryShortcut),'opsInventoryOrders');
  await nav.locator('button').nth(1).click();
  assert.equal(await page.evaluate(()=>window.lastInventoryShortcut),'opsInventoryAgeSection');
  await nav.locator('button').nth(2).click();
  assert.equal(await page.evaluate(()=>window.lastInventoryShortcut),'opsInventoryCatalog');
  assert.equal(await page.locator('#opsInventoryAdd').count(),1,'stock addition action must remain mounted');
  assert.equal(await page.locator('#opsSupplierHandoffOpen').count(),1,'optional supplier handoff action must remain mounted');
  assert.equal(await page.locator('#opsInventoryAgeReview').count(),1,'aging review action must remain mounted');
  if(width===390){
   fs.mkdirSync('qa-results',{recursive:true});
   await page.screenshot({path:'qa-results/inventory-shortcuts-390.png',fullPage:true});
  }
  await context.close();
  console.log('PASS inventory navigation + handlers preserved, viewport '+width+'px');
 }
}finally{await browser.close()}
console.log('PASS #1113: actual inventory renderer, role-neutral quick navigation, no page overflow');
