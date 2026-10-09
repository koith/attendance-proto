import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// The attendance tab opens actual_attendance.html, not another #view panel.
// This regression compares the TWO REAL stylesheets at their actual desktop
// breakpoints, with tall content and a classic 17px scrollbar.
const html=fs.readFileSync('index.html','utf8');
const indexCss=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const attendanceCss=fs.readFileSync('actual_attendance.css','utf8');
assert.ok(indexCss&&attendanceCss);
const browser=await chromium.launch({headless:true,args:['--disable-features=OverlayScrollbar']});
try{
  for(const width of [769,800,899,900,1024,1170,1279,1280,1649,1920]){
    const page=await browser.newPage({viewport:{width,height:928}});
    const read=()=>page.evaluate(()=>{
      const rect=document.querySelector('.wrap').getBoundingClientRect();
      return {left:rect.left,right:rect.right,width:rect.width,center:rect.left+rect.width/2,scroll:document.documentElement.scrollWidth};
    });
    await page.setContent(`<style>${indexCss}html::-webkit-scrollbar{width:17px}</style>
      <div class="wrap"><div class="topbar">출퇴근 | 근무현황 | 레시피 | 관리</div>
      <main id="view"><div class="recipe-v220"><h2>레시피</h2><div style="height:2400px">메뉴 목록</div></div></main></div>`);
    const recipe=await read();
    await page.setContent(`<style>${attendanceCss}html::-webkit-scrollbar{width:17px}</style>
      <div class="wrap"><header class="top"><h2>근무현황</h2></header><div style="height:2400px">근태 기록</div></div>`);
    const attendance=await read();
    for(const f of ['left','right','width','center']){
      assert.ok(Math.abs(recipe[f]-attendance[f])<=0.5,
        `${width}px actual_attendance.html <-> recipe ${f} shifted: ${JSON.stringify({recipe,attendance})}`);
    }
    assert.ok(recipe.scroll<=width&&attendance.scroll<=width,`${width}px overflow`);
    console.log('PASS cross-document attendance/recipe alignment',width,recipe.left,attendance.left);
    await page.close();
  }
}finally{await browser.close()}
