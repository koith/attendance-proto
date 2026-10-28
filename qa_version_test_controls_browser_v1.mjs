import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const index=fs.readFileSync('index.html','utf8');
const a=index.indexOf('function canShowInhaTestControls(){'),b=index.indexOf('function syncStoreContextUI(){',a);
assert.ok(a>0&&b>a);const gate=index.slice(a,b),styles=index.match(/<style>([\s\S]*?)<\/style>/)[1];
const proof=[];fs.mkdirSync('qa-results/inha-test-controls-v379',{recursive:true});
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
    <style>${styles}.wrap{padding:70px 20px 20px}.ordinary{display:block}</style>
    <div class="wrap"><button id="appVersion">v0.314</button><span class="ordinary">앱 화면</span></div>
    <script>let CURRENT_STORE_ID=${Number(url.searchParams.get('store')??1)},STORE_ENTRY_LOADING=${url.searchParams.has('loading')},STORE_ENTRY_UNAVAILABLE=${url.searchParams.has('unavailable')};const STORE_ENTRY_MODE=${JSON.stringify(url.searchParams.get('mode')||'store')};${gate}syncInhaTestControls();window.BaekeokTest={
      _enabled:${enabled},
      enabled(){return this._enabled;},
      get(){return {enabled:this._enabled,now:null}},
      set(s){this._enabled=s.enabled}
    };function kstNow(){return new Date()}</script>
    ${scripts}`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address(),base='http://127.0.0.1:'+address.port;
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
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
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
    await page.locator('#testTimeCancel').click();
    assert.equal(await page.locator('#testTimeModal').count(),0,'user closes blocking modal before using version button');checks++;
    await clickVersion(page);
    await assertDisplay(page,'#testModeControls','hidden','test mode hide controls');
    await assertDisplay(page,'#testModeBanner','hidden','test mode hide banner');
    assert.equal(await page.locator('#testTimeModal').count(),0,'hide closes time modal');checks++;
    assert.equal(await page.evaluate(()=>BaekeokTest.enabled()),true,'visibility never toggles test mode state');checks++;
    await clickVersion(page);
    await assertDisplay(page,'#testModeControls','visible','test mode restore controls');
    await assertDisplay(page,'#testModeBanner','visible','test mode restore banner');
    await page.close();
    for(const spec of ['store=80','store=2','store=0','store=1&mode=hq','store=1&loading','store=1&unavailable']){
      const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>localStorage.setItem('baekeok_test_controls_visible_v1','true'));
      await page.goto(base+'/?test&'+spec);
      await page.locator('#testModeControls').waitFor({state:'attached'});
      for(let click=0;click<3;click++){
        await assertDisplay(page,'#testModeControls','hidden','outside Inha '+spec);
        await assertDisplay(page,'#testModeBanner','hidden','outside Inha banner '+spec);
        await clickVersion(page);
      }
      assert.equal(await page.locator('#appVersion').getAttribute('aria-label'),'현재 앱 버전 v0.314');
      assert.equal(await page.evaluate(()=>localStorage.getItem('baekeok_test_controls_visible_v1')),'true');
      assert.equal(await page.evaluate(()=>BaekeokTest.enabled()),true);
      await page.evaluate(()=>{document.documentElement.classList.remove('test-controls-hidden-v1');const x=document.createElement('div');x.id='testTimeModal';document.body.appendChild(x)});
      await assertDisplay(page,'#testModeControls','hidden','late version preference cannot bypass store scope');
      await assertDisplay(page,'#testTimeModal','hidden','late time modal cannot bypass store scope');
      assert.deepEqual(errors,[]);
      if(spec==='store=80')await page.screenshot({path:'qa-results/inha-test-controls-v379/'+engine+'-'+viewport.width+'-store80.png'});
      proof.push({engine,width:viewport.width,spec,result:'PASS',stateUnchanged:true});await page.close();
    }
    const switchPage=await browser.newPage({viewport});await switchPage.goto(base+'/?test');await switchPage.locator('#testClockButton').click();
    await switchPage.evaluate(()=>{CURRENT_STORE_ID=80;syncInhaTestControls()});
    await assertDisplay(switchPage,'#testModeControls','hidden','Inha to store80');assert.equal(await switchPage.locator('#testTimeModal').count(),0);
    await switchPage.locator('#appVersion').click();
    await switchPage.evaluate(()=>{CURRENT_STORE_ID=1;syncInhaTestControls()});
    await assertDisplay(switchPage,'#testModeControls','visible','store80 back to Inha');assert.equal(await switchPage.evaluate(()=>BaekeokTest.enabled()),true);
    proof.push({engine,width:viewport.width,spec:'1→80→1',result:'PASS',stateUnchanged:true});await switchPage.close();
  }
  }finally{await browser.close()}
 }
  fs.writeFileSync('qa-results/inha-test-controls-v379/report.json',JSON.stringify(proof,null,2));console.log('INHA_TEST_CONTROLS_SCOPE_PASS '+proof.length);
  console.log('PASS: real test_mode_ui_v1.js version toggle, chromium mobile+desktop, early+late injection, persistence, banner, modal, state isolation; assertions='+checks);
}finally{
  await new Promise(resolve=>server.close(resolve));
}
