import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

/* Full index.html boot and actual recipe renderer/navigation.
 * This catches route-specific overflow and wrong centering that stylesheet
 * specimen tests cannot reproduce. All backend fetches are stubbed.
 */
const browser=await chromium.launch({headless:true,args:['--disable-features=OverlayScrollbar']});
try{
  for(const width of [1024,1280,1649,1920]){
    const page=await browser.newPage({viewport:{width,height:928},deviceScaleFactor:1});
    page.on('pageerror',e=>console.warn('browser error',String(e).slice(0,100)));
    await page.route(/waluhdgqhwjjwmflhrle\.supabase\.co/,async route=>{
      await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'});
    });
    await page.goto('file://'+path.join(process.cwd(),'index.html')+'#pos',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof window.renderRecipeHub==='function',{timeout:25000});
    await page.evaluate(()=>{
      BE.publicStoreRecipeList=async()=>Array.from({length:75},(_,i)=>({
        id:i+1,recipe_id:i+1,product_id:i+1,product_name:'메뉴 '+(i+1),
        name:'메뉴 '+(i+1),category:'커피',variants:[],components:[],thumbnail_url:null
      }));
    });
    const measure=()=>page.evaluate(()=>{
      const rect=s=>{const x=document.querySelector(s)?.getBoundingClientRect();return x?{left:x.left,right:x.right,width:x.width,center:x.left+x.width/2}:null};
      return {wrap:rect('.wrap'),topbar:rect('.topbar'),view:rect('#view'),recipe:rect('.recipe-v220'),viewport:innerWidth,scrollLeft:scrollX,scrollWidth:document.documentElement.scrollWidth,documentClientWidth:document.documentElement.clientWidth};
    });
    await page.evaluate(()=>{setTab('attendance');document.querySelector('#view').innerHTML='<section class="att-audit-content" style="height:300px"><h2>근무 현황</h2></section>';});
    const normal=await measure();
    await page.evaluate(async()=>{setTab('recipe');await window.renderRecipeHub();});
    await page.waitForSelector('.recipe-v220-list .recipe-v220-card',{timeout:15000});
    const recipe=await measure();
    for(const key of ['wrap','topbar','view']){
      assert.ok(Math.abs(normal[key].left-recipe[key].left)<=0.5,`${width}px ${key} left shifted by ${normal[key].left-recipe[key].left}`);
      assert.ok(Math.abs(normal[key].width-recipe[key].width)<=0.5,`${width}px ${key} width shifted`);
    }
    assert.ok(Math.abs(recipe.recipe.center-recipe.view.center)<=0.5,`${width}px recipe is not centered`);
    assert.equal(recipe.scrollLeft,0);
    assert.ok(recipe.scrollWidth<=width,`${width}px horizontal overflow ${recipe.scrollWidth}`);
    await page.evaluate(()=>{document.querySelector('#view').innerHTML='<section style="height:420px"><h2>관리</h2></section>';setTab('admin');});
    const admin=await measure();
    assert.ok(Math.abs(admin.wrap.left-recipe.wrap.left)<=0.5,`${width}px recipe->admin wrap moved`);
    console.log('PASS real mounted recipe navigation geometry',width,JSON.stringify({normal:normal.wrap,recipe:recipe.wrap,scroll:recipe.scrollWidth}));
    await page.close();
  }
} finally {await browser.close()}
