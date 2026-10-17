import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';

const root=process.cwd();
const files={
  '/test_mode_ui_v1.js':fs.readFileSync(root+'/test_mode_ui_v1.js'),
  '/version_test_toggle_982.js':fs.readFileSync(root+'/version_test_toggle_982.js')
};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname in files){
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    return res.end(files[url.pathname]);
  }
  const late=url.searchParams.has('late');
  const enabled=url.searchParams.has('test');
  const scripts=late
    ?'<script src="/test_mode_ui_v1.js"></script><script src="/version_test_toggle_982.js"></script>'
    :'<script src="/version_test_toggle_982.js"></script><script src="/test_mode_ui_v1.js"></script>';
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>.wrap{padding:20px}.ordinary{display:block}</style>
    <div class="wrap"><button id="appVersion">v0.314</button><span class="ordinary">앱 화면</span></div>
    <script>window.BaekeokTest={
      _enabled:${enabled},
      enabled(){return this._enabled;},
      get(){return {enabled:this._enabled,now:null}},
      set(s){this._enabled=s.enabled}
    };function kstNow(){return new Date()}</script>
    ${scripts}`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address(),base='http://127.0.0.1:'+address.port;
const browser=await chromium.launch({headless:true});
let checks=0;
async function assertDisplay(page,selector,expected,reason){
  const display=await page.locator(selector).evaluate(el=>getComputedStyle(el).display);
  assert.equal(display==='none'?'hidden':'visible',expected,reason+' ('+selector+':'+display+')');
  checks++;
}
async function clickVersion(page){
  await page.locator('#appVersion').click();
}
try{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    for(const order of ['early','late']){
      const page=await browser.newPage({viewport});
      const url=base+'/?'+(order==='late'?'late&':'');
      await page.goto(url);
      await page.locator('#testModeControls').waitFor();
      await assertDisplay(page,'#testModeControls','visible','default '+order);
      assert.equal(await page.locator('#testModeCorner .tm-label').textContent(),'LIVE');
      checks++;
      await clickVersion(page);
      await assertDisplay(page,'#testModeControls','hidden','first click hides');
      assert.equal(await page.locator('#appVersion').getAttribute('aria-pressed'),'false');checks++;
      await page.reload();
      await page.locator('#testModeControls').waitFor({state:'attached'});
      await assertDisplay(page,'#testModeControls','hidden','reload remembers hidden');
      await clickVersion(page);
      await assertDisplay(page,'#testModeControls','visible','second click restores');
      await clickVersion(page);
      await assertDisplay(page,'#testModeControls','hidden','third click hides');
      await page.evaluate(()=>{
        document.getElementById('testModeControls').remove();
        const wrap=document.createElement('div');
        wrap.id='testModeControls';wrap.textContent='LIVE ◷';
        document.body.appendChild(wrap);
      });
      await assertDisplay(page,'#testModeControls','hidden','late reinsert remains hidden');
      assert.equal(await page.locator('.ordinary').isVisible(),true);checks++;
      await page.close();
    }
    const page=await browser.newPage({viewport});
    await page.goto(base+'/?test');
    await page.locator('#testModeBanner').waitFor();
    await assertDisplay(page,'#testModeControls','visible','test mode default controls');
    await assertDisplay(page,'#testModeBanner','visible','test mode default banner');
    await page.locator('#testClockButton').click();
    assert.equal(await page.locator('#testTimeModal').count(),1);checks++;
    await clickVersion(page);
    await assertDisplay(page,'#testModeControls','hidden','test mode hide controls');
    await assertDisplay(page,'#testModeBanner','hidden','test mode hide banner');
    assert.equal(await page.locator('#testTimeModal').count(),0,'hide closes time modal');checks++;
    assert.equal(await page.evaluate(()=>BaekeokTest.enabled()),true,'visibility never toggles test mode state');checks++;
    await clickVersion(page);
    await assertDisplay(page,'#testModeControls','visible','test mode restore controls');
    await assertDisplay(page,'#testModeBanner','visible','test mode restore banner');
    await page.close();
  }
  console.log('PASS: real test_mode_ui_v1.js version toggle, chromium mobile+desktop, early+late injection, persistence, banner, modal, state isolation; assertions='+checks);
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
