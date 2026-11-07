import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

const base=(process.env.APP_SMOKE_HOST||'https://koith.github.io/attendance-proto').replace(/\/$/,'');
const index=fs.readFileSync('index.html','utf8');
const expected=index.match(/const APP_VERSION="(v[0-9.]+)"/)?.[1];
assert.ok(expected,'APP_VERSION missing in repository index');
const toggleAsset='version_test_toggle_982.js';
const expectedToggle=fs.readFileSync(toggleAsset,'utf8');
const browser=await chromium.launch({headless:true});
let checks=0;
try{
  const request=await browser.newPage();
  const liveAsset=await request.request.get(base+'/'+toggleAsset+'?release='+encodeURIComponent(expected)+'&assetcheck=1',
    {headers:{'Cache-Control':'no-cache'},timeout:25000});
  assert.equal(liveAsset.status(),200,'LIVE toggle JavaScript must be served');
  assert.equal(await liveAsset.text(),expectedToggle,'LIVE JS differs from merged source');checks++;
  await request.close();

  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});
    const page=await context.newPage();
    // Only three verified read-only public POS RPCs are allowed through.
    // Every other Supabase request is intercepted, never sent to production.
    const publicRead=new Set(['list_stores','pos_public_staff_cards','pos_public_staff_picker']);
    await page.route('**/*',async route=>{
      const request=route.request(),u=new URL(request.url());
      if(u.hostname.endsWith('.supabase.co')){
        const name=u.pathname.split('/').pop();
        if(u.origin==='https://waluhdgqhwjjwmflhrle.supabase.co' &&
           request.method()==='POST' && publicRead.has(name))
          return route.continue();
        return route.fulfill({status:403,contentType:'application/json',body:'{}'});
      }
      if(!['GET','HEAD','OPTIONS'].includes(request.method()))
        return route.abort('blockedbyclient');
      return route.continue();
    });
    await page.goto(base+'/index.html?mode=store&store=1&release='+
      encodeURIComponent(expected)+'&ui_check='+viewport.width+'#pos',
      {waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>document.documentElement.classList.contains('inha-test-controls'),
      null,{timeout:30000});
    await page.locator('#testModeControls').waitFor({state:'visible',timeout:30000});
    assert.equal((await page.locator('#appVersion').innerText()).trim(),expected);
    assert.equal(await page.locator('#appVersion').evaluate(el=>getComputedStyle(el).pointerEvents),
      'auto','Version badge must accept ACTUAL pointer input');checks+=2;
    assert.equal(await page.locator('#testModeControls').isVisible(),true,'Test controls default visible');checks++;
    await page.locator('#appVersion').click({timeout:12000});
    assert.equal(await page.locator('#testModeControls').isVisible(),false,'First ACTUAL click hides controls');checks++;
    await page.locator('#appVersion').click({timeout:12000});
    assert.equal(await page.locator('#testModeControls').isVisible(),true,'Second ACTUAL click restores controls');checks++;
    await page.locator('#appVersion').click({timeout:12000});
    assert.equal(await page.locator('#testModeControls').isVisible(),false,'Third ACTUAL click hides again');checks++;
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('inha-test-controls'),
      null,{timeout:30000});
    await page.locator('#testModeControls').waitFor({state:'attached',timeout:30000});
    assert.equal(await page.locator('#testModeControls').isVisible(),false,'Hidden preference persists reload');checks++;
    await page.locator('#appVersion').click({timeout:12000});
    assert.equal(await page.locator('#testModeControls').isVisible(),true,'Reloaded controls restore');checks++;
    // The same real published app must hide test controls on the HQ landing
    // route: production staff-only test buttons must not leak into HQ.
    await page.goto(base+'/index.html#dashboard',{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('#testModeControls').waitFor({state:'attached',timeout:30000});
    assert.equal(await page.locator('#testModeControls').isVisible(),false,
      'HQ must hide Inha-only test controls');checks++;
    await context.close();
  }
  console.log('PASS: actual published Pages v'+expected+' LIVE/clock UI click hide-show-hide, Chromium mobile+desktop, persisted state, byte-identical script, assertions='+checks);
}finally{
  await browser.close();
}
