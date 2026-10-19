// #1175: real Chromium user interaction against the shipped supplier UI JS.
// No actual Supabase rows, supplier account, cart or order writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const script=fs.readFileSync('operations_supplier_handoff_v1.js','utf8');
const css=fs.readFileSync('operations_v1.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(x=>x[1]).join('\n');
const orders=[{id:41,store_id:1,item_id:77,manual_item_id:null,item_name:'원두 (서버 확정)',unit:'박스',order_unit:'박스',status:'PARTIAL',ordered_quantity:5,received_quantity:2,is_demo:false}];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<=390});
  const page=await context.newPage();
  await page.setContent('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
   styles+'\n'+css+'\nhtml,body{margin:0}#host{max-width:920px;padding:12px;margin:auto;box-sizing:border-box}</style></head><body><main id="host"></main></body></html>');
  await page.evaluate(data=>{
   window.CURRENT_STORE_ID=1;
   window.Auth={isLoggedIn:()=>true};
   window.BE={inventoryPurchaseOrders:async()=>data};
   window.confirm=()=>true;
   window.supplierCopy='';
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
    writeText:async text=>{window.supplierCopy=text}
   }});
  },orders);
  await page.addScriptTag({content:script});
  await page.evaluate(rows=>window.openSupplierOrderHandoff(rows,1),orders);
  const modal=page.locator('.ops-modal');
  assert.equal(await modal.count(),1,'missing actual supplier modal');
  const btn=page.locator('#opsHandoffCopy');
  assert.ok(await btn.isDisabled(),'no purchase order may be preselected');
  assert.equal(await page.locator('[data-handoff-order]').count(),1,'one valid pending order');
  await page.locator('[data-handoff-order]').check();
  assert.ok(await btn.isEnabled(),'manager can select one verified internal order');
  await page.evaluate(()=>window.CURRENT_STORE_ID=2);
  await btn.click();
  assert.equal(await page.evaluate(()=>window.supplierCopy),'','store switch must block');
  assert.match(await page.locator('#opsHandoffStatus').textContent(),/지점이 바뀌었습니다/);
  await page.evaluate(()=>window.CURRENT_STORE_ID=1);
  await btn.click();
  assert.match(await page.evaluate(()=>window.supplierCopy),/내부발주 #41 · 원두 \(서버 확정\) · 미입고 3 박스/);
  assert.match(await page.locator('#opsHandoffStatus').textContent(),/공급사 장바구니 반영·결제는 하지 않았습니다/);
  let metric=await page.evaluate(()=>({pageWidth:document.documentElement.scrollWidth,width:innerWidth,
    content:document.querySelector('.ops-modal-sheet').getBoundingClientRect().width}));
  assert.ok(metric.pageWidth<=width+1,'supplier modal page overflows '+width+'px '+JSON.stringify(metric));
  if(width===390){
   fs.mkdirSync('qa-results',{recursive:true});
   await page.screenshot({path:'qa-results/onlyone-handoff-390.png',fullPage:true});
  }
  await context.close();
  console.log('PASS supplier selection, owner review, new store reject and copy UI '+width+'px');
 }
}finally{await browser.close()}
