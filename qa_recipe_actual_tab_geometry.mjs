import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Unlike the legacy scrollbar test, this renders the real app's root, view,
// recipe stylesheet and representative tab content, not an empty mock wrap.
const html=fs.readFileSync('index.html','utf8');
const base=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const recipe=fs.readFileSync('recipe_access_v220.css','utf8');
assert.ok(base,'inline app CSS missing');
const browser=await chromium.launch({headless:true});
try {
  for(const width of [1024,1280,1649,1920]){
    const page=await browser.newPage({viewport:{width,height:928}});
    await page.setContent(`<style>${base}\n${recipe}</style><div class="wrap"><div class="topbar"><header>백억커피</header></div><main id="view"><section id="panel"><h2>근무 현황</h2><div style="height:300px">근무 현황</div></section></main></div>`);
    const read=()=>page.evaluate(()=>{
      const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,width:r.width,center:r.x+r.width/2}};
      return {wrap:rect('.wrap'),view:rect('#view'),panel:rect('#panel'),scroll:document.documentElement.scrollWidth};
    });
    const attendance=await read();
    await page.locator('#panel').evaluate(el=>{el.outerHTML='<section id="panel" class="recipe-v220"><div class="recipe-v220-head"><h2>레시피</h2></div><div class="recipe-v220-toolbar"><label>분류<select><option>전체</option></select></label><label>상태<select><option>전체</option></select></label><label>검색<input></label></div><div class="recipe-v220-list">'+Array.from({length:70},(_,i)=>'<article class="recipe-v220-card"><button class="recipe-v220-open">레시피 '+i+'</button></article>').join('')+'</div></section>'});
    const recipes=await read();
    for(const key of ['wrap','view']){
      assert.ok(Math.abs(attendance[key].x-recipes[key].x)<0.5,`${width}px ${key} shifted ${attendance[key].x} -> ${recipes[key].x}`);
      assert.ok(Math.abs(attendance[key].width-recipes[key].width)<0.5,`${width}px ${key} width changed`);
    }
    assert.ok(Math.abs(recipes.panel.center-recipes.view.center)<0.5,`${width}px recipe center differs from view`);
    assert.ok(recipes.scroll<=width,`${width}px horizontal document overflow: ${recipes.scroll}`);
    console.log('PASS recipe tab geometry',width,attendance.wrap.x,recipes.wrap.x);
    await page.close();
  }
} finally { await browser.close(); }
