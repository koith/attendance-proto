import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
// Load the actual app scripts and DOM: mock CSS-only wraps missed real route geometry.
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1024,1280,1649,1920]){
  const page=await browser.newPage({viewport:{width,height:928}});
  await page.goto('file://'+resolve('index.html')+'#pos',{waitUntil:'domcontentloaded',timeout:45000});
  const measure=()=>page.evaluate(()=>{
   const rect=id=>{const e=document.querySelector(id);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,w:r.width,c:r.x+r.width/2}};
   return {wrap:rect('.wrap'),nav:rect('.tabwrap'),view:rect('#view'),scrollWidth:document.documentElement.scrollWidth,scrollX:window.scrollX};
  });
  const start=await measure();
  await page.evaluate(()=>{location.hash='#recipe'});
  await page.waitForTimeout(350);
  const recipe=await measure();
  await page.evaluate(()=>{
   const v=document.getElementById('view');
   if(!v.querySelector('.recipe-v220'))v.innerHTML='<section class="recipe-v220"><div class="recipe-v220-list"></div></section>';
   const list=v.querySelector('.recipe-v220-list');
   if(list)list.innerHTML=Array.from({length:100},(_,i)=>'<article class="recipe-v220-card"><button class="recipe-v220-open">레시피 '+i+'</button></article>').join('');
  });
  const long=await measure();
  await page.evaluate(()=>{location.hash='#admin'});
  await page.waitForTimeout(350);
  const admin=await measure();
  for(const [name,m] of Object.entries({recipe,long,admin})){
   for(const key of ['wrap','nav','view']){
    assert.ok(m[key]&&start[key],width+' '+name+' '+key+' missing');
    assert.ok(Math.abs(start[key].x-m[key].x)<0.6,width+' '+name+' '+key+' drift: '+start[key].x+' to '+m[key].x);
    assert.ok(Math.abs(start[key].w-m[key].w)<0.6,width+' '+name+' '+key+' width drift');
   }
   assert.ok(m.scrollWidth<=width,width+' '+name+' document horizontal overflow '+m.scrollWidth);
   assert.equal(m.scrollX,0,width+' '+name+' horizontal scroll');
  }
  console.log('PASS real route geometry',width,JSON.stringify({start,recipe,long,admin}));
  await page.close();
 }
}finally{await browser.close()}
