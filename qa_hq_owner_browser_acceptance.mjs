import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 for(const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:900}]]) {
  const page=await browser.newPage({viewport,locale:'ko-KR'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/rpc/**',route=>{
   const rpc=route.request().url().split('/').pop();
   const stores=Array.from({length:283},(_,i)=>({id:i+1,name:i===0?'강남역점':i===1?'송파역점':i===2?'주소미등록점':'테스트'+i+'점',code:'S'+i,region_group:i%2?'경기':'서울',road_address:i===0?'서울특별시 강남구 테헤란로 10':i===1?'서울특별시 송파구 올림픽로 20':i===3?'경기도 수원시 영통구 대학로 12':i===5?'경기도 수원시 팔달구 매산로 3':''}));
   const payload=rpc==='hq_stores_onboarding_list'?stores:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.setContent('<div id="adAccount"></div>');
  await page.evaluate(()=>{
   window.CONFIG={SUPABASE_URL:'https://qa.invalid',SUPABASE_ANON_KEY:'qa'};
   window.Auth={token:'qa-token'};
   window.BE={listAuthUsers:async()=>[]};
  });
  await page.addScriptTag({path:'hq_owner_console.js'});
  assert.equal(await page.evaluate(()=>typeof window.mountHqOwnerConsole),'function','HQ module failed to register');
  await page.evaluate(()=>window.mountHqOwnerConsole(document.getElementById('adAccount')));
  await page.locator('.hq-owner-row').first().waitFor();
  assert.equal(await page.locator('.hq-owner-row').count(),283);
  await page.locator('[data-quick-mode="initial"]').click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(),/가나다순 찾기/);
  assert.doesNotMatch(await page.locator('[data-letter="ㄱ"]').getAttribute('class')||'',/active/);
  await page.locator('#hqQuickClose').click();
  await page.locator('[data-quick-mode="region"]').click();
  assert.match(await page.getByRole('dialog').innerText(),/지역별 찾기/);
  await page.locator('#hqQuickProvince').selectOption('서울특별시');
  assert.ok(await page.locator('[data-quick-store]').count()>0);
  await page.locator('#hqQuickDistrict').selectOption('강남구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['강남역점'],'강남구 must only show verified addresses');
  await page.locator('#hqQuickDistrict').selectOption('송파구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['송파역점'],'송파구 must not show Gangnam or unclassified stores');
  await page.locator('#hqQuickDistrict').selectOption('종로구');
  assert.equal(await page.locator('[data-quick-store]').count(),0,'district without addresses must show no stores');
  await page.locator('#hqQuickProvince').selectOption('경기도');
  await page.locator('#hqQuickDistrict').selectOption('수원시');
  await page.locator('#hqQuickSubdistrict').selectOption('영통구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['테스트3점'],'city subdistrict filtering must be exact');
  await page.locator('#hqQuickSubdistrict').selectOption('팔달구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['테스트5점'],'changing subdistrict must change stores');
  await page.locator('#hqQuickClose').click();
  await page.locator('[data-quick-mode="recent"]').click();
  assert.match(await page.getByRole('dialog').innerText(),/최근 지점/);
  await page.locator('#hqQuickClose').click();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.deepEqual(errors,[],name+' console errors');
  await page.close();
  console.log('PASS HQ owner browser acceptance '+name);
 }
} finally {await browser.close()}
