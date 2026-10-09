import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const html=fs.readFileSync('index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(css);
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1649,height:928}});
  await page.setContent(`<style>${css}</style><div class="wrap"><div id="mock" style="height:320px"></div></div>`);
  const short=await page.locator('.wrap').boundingBox();
  await page.locator('#mock').evaluate(el=>el.style.height='4000px');
  const long=await page.locator('.wrap').boundingBox();
  assert.ok(Math.abs(short.x-long.x)<0.5,`desktop left drift: ${short.x} -> ${long.x}`);
  assert.ok(Math.abs(short.width-long.width)<0.5,`desktop width drift: ${short.width} -> ${long.width}`);
  console.log('PASS 1649px desktop short/long layout remains centered:',short.x,long.x);
}finally{await browser.close()}
