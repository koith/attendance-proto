// #954: Natural HQ no-sales text wrapping, not a forced two-sentence break.
// Runs the actual shipped CSS and actual DOM content in Chromium/WebKit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';

const source=fs.readFileSync('index.html','utf8');
const style=source.match(/<style id="hqSalesNoticeNaturalWrap954">([\s\S]*?)<\/style>/)?.[1];
assert.ok(style,'natural-wrapping CSS must be shipped in the application');
const notice=source.match(/'<p class="empty hq-sales-notice" role="status">([^<]+)<\/p>'/)?.[1];
assert.ok(notice,'single text flow, not a forced <span>/<br> sentence split');
assert.equal(notice,'연결된 실제 매출 데이터가 없습니다. 시연용 거래는 매출 집계에서 제외했습니다.');
assert.doesNotMatch(style,/flex-direction\s*:\s*column|\.hq-sales-notice\s*>\s*span/,
 'styling must not force independent lines');
for(const browserType of [chromium,webkit]){
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><style>'+style+
   '</style><div id="fixture"><p class="empty hq-sales-notice" role="status">'+notice+'</p></div>');
  for(const [width,expectedWrapped] of [[800,false],[210,true]]){
   await page.evaluate(w=>document.getElementById('fixture').style.width=w+'px',width);
   const data=await page.locator('.hq-sales-notice').evaluate(node=>{
    const range=document.createRange();range.selectNodeContents(node);
    return {rectCount:range.getClientRects().length,
      content:node.textContent,display:getComputedStyle(node).display,
      children:node.children.length};
   });
   assert.equal(data.content,notice);
   assert.equal(data.children,0,'text must not be split into block children');
   assert.equal(data.display,'block');
   assert.equal(data.rectCount>1,expectedWrapped,
    browserType.name()+' '+width+'px actual line wrapping: '+data.rectCount);
  }
  await page.close();
  console.log('PASS #954 '+browserType.name()+' natural line wrapping, wide single-line, narrow responsive');
 }finally{await browser.close();}
}
