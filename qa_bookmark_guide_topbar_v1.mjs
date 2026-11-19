import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit,devices} from 'playwright';

const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('bookmark_guide_v1.js','utf8');
const css=fs.readFileSync('bookmark_guide_v1.css','utf8');
const primaryStyle=html.match(/<style>([\s\S]*?)<\/style>/)?.[1]||'';
const versionStyle=html.match(/<style id="versionButton973">([\s\S]*?)<\/style>/)?.[1]||'';
const connection=html.match(/<div class="connection-row">[^\n]*/)?.[0]||'';
const modal=html.match(/<!-- Globally available bookmark guidance:[\s\S]*?(?=<!-- PIN pad -->)/)?.[0]||'';
assert.ok(connection.includes('id="bookmarkGuideOpen"'));
assert.ok(connection.includes('id="appVersion"'));
assert.ok(connection.indexOf('id="bookmarkGuideOpen"')<connection.indexOf('id="appVersion"'));
assert.match(html,/<script src="bookmark_guide_v1.js\?v=20261119v392" defer><\/script>/);
assert.match(html,/<link rel="stylesheet" href="bookmark_guide_v1.css\?v=20261119v392">/);
assert.match(html,/const APP_VERSION="v0\.392";/);
assert.equal((html.match(/id="bookmarkGuideVeil"/g)||[]).length,1);
assert.ok(modal.includes('data-bookmark-browser="chrome"'));
assert.ok(modal.includes('data-bookmark-browser="edge"'));
assert.ok(modal.includes('data-bookmark-browser="ie"'));
const fakePage=`<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${primaryStyle}\n${versionStyle}\n${css}</style></head><body>
<div class="wrap"><div class="topbar">${connection}
<header><div class="brand"><strong>백억커피</strong><span id="lockedStoreName">수원탑동점</span></div><div class="clock">16:30</div></header>
<div class="tabwrap"><div class="tabs store-tabs"><a href="#pos">출퇴근</a><a href="#attendance">근무현황</a><a href="#recipe">레시피</a><a href="#admin">관리</a></div></div>
</div><main id="view"><p>내용</p></main></div>
${modal}</body></html>`;
const site='https://koith.github.io/attendance-proto/';
const stores=[1,80,94,100,131,133,139,187,200,230,260,290,325,326,328,329,330,331];
const environments=[
  {name:'desktop-chromium',browser:chromium,context:{viewport:{width:1280,height:800}}},
  {name:'iphone-webkit',browser:webkit,context:{...devices['iPhone 13'],locale:'ko-KR'}}
];
let checks=0;
for(const env of environments){
 const browser=await env.browser.launch({headless:true});
 try{
  const context=await browser.newContext(env.context);
  await context.route('https://koith.github.io/attendance-proto/**',route=>route.fulfill({status:200,contentType:'text/html',body:fakePage}));
  async function load(path){
    const page=await context.newPage();
    await page.goto(site+path,{waitUntil:'domcontentloaded',timeout:15000});
    await page.addScriptTag({content:js});
    await page.locator('#bookmarkGuideOpen').waitFor({timeout:4000});
    return page;
  }
  const hq=await load('index.html#dashboard');
  try{
    assert.equal(await hq.locator('#bookmarkGuideOpen').count(),1);
    await hq.locator('#bookmarkGuideOpen').click();
    assert.equal(await hq.locator('#bookmarkGuideVeil').isVisible(),true);
    assert.equal(await hq.locator('#bookmarkGuideUrl').textContent(),site);
    for(const [tab,keyword] of [['edge','Microsoft Edge'],['ie','Internet Explorer'],['chrome','Google Chrome']]){
      await hq.locator('[data-bookmark-browser="'+tab+'"]').click();
      assert.ok((await hq.locator('#bookmarkGuideInstruction').textContent()).includes(keyword));
    }
    await hq.keyboard.press('Escape');
    assert.equal(await hq.locator('#bookmarkGuideVeil').isVisible(),false);
    assert.equal(await hq.locator('#bookmarkGuideOpen').getAttribute('aria-expanded'),'false');
    const header=await hq.locator('.connection-row').boundingBox();
    const button=await hq.locator('#bookmarkGuideOpen').boundingBox();
    const version=await hq.locator('#appVersion').boundingBox();
    assert.ok(header&&button&&version);
    assert.ok(button.x>=header.x&&button.x+button.width<=version.x+1,
      'Bookmark button must sit in global bar immediately before version');
    checks++;
  }finally{await hq.close()}
  for(const id of stores){
    const page=await load('index.html?mode=store&store='+id+'#pos');
    try{
      const trigger=page.locator('#bookmarkGuideOpen');
      await trigger.click();
      const want=site+'index.html?mode=store&store='+id+'#pos';
      assert.equal(await page.locator('#bookmarkGuideUrl').textContent(),want,
        'Wrong or cross-branch bookmark for '+id);
      await page.locator('#bookmarkGuideClose').click();
      await page.locator('a[href="#attendance"]').click();
      await trigger.click();
      assert.equal(await page.locator('#bookmarkGuideUrl').textContent(),want,
        'Changing menus must never change saved POS entry: '+id);
      await page.locator('#bookmarkGuideClose').click();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<=2,'Horizontal overflow in '+env.name+' '+id+': '+overflow);
      checks++;
    }finally{await page.close()}
  }
  console.log('PASS',env.name,'HQ + all',stores.length,'stores: menu-persistent topbar, right URL, no overflow');
  await context.close();
 }finally{await browser.close()}
}
assert.equal(checks,(stores.length+1)*environments.length);
console.log('BOOKMARK_TOPBAR_QA',JSON.stringify({checks,passed:checks,failures:0}));
