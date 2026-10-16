import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync('index.html','utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1]||'';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 for(const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:900}]]) {
  const page=await browser.newPage({viewport,locale:'ko-KR'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/rpc/**',route=>{
   const rpc=route.request().url().split('/').pop();
   const stores=Array.from({length:283},(_,i)=>({id:i+1,name:i===0?'강남역점':i===1?'송파역점':i===2?'주소미등록점':'테스트'+i+'점',code:'S'+i,region_group:i%2?'경기':'서울',road_address:i===0?'서울특별시 강남구 테헤란로 10':i===1?'서울특별시 송파구 올림픽로 20':i===3?'경기도 수원시 영통구 대학로 12':i===5?'경기도 수원시 팔달구 매산로 3':''}));
   const locations=[{store_id:1,province:'서울특별시',district:'강남구',subdistrict:'',address:'서울 강남구 테헤란로 10'},{store_id:2,province:'서울특별시',district:'송파구',subdistrict:'',address:'서울 송파구 올림픽로 20'},{store_id:4,province:'경기도',district:'수원시',subdistrict:'영통구',address:'경기 수원시 영통구 대학로 12'},{store_id:6,province:'경기도',district:'수원시',subdistrict:'팔달구',address:'경기 수원시 팔달구 매산로 3'},...Array.from({length:30},(_,i)=>({store_id:i+20,province:'서울특별시',district:'종로구',subdistrict:'',address:'서울 종로구 테스트로 '+i})),{store_id:7,province:'부산광역시',district:'금정구',subdistrict:'',address:'부산 금정구'},{store_id:8,province:'부산광역시',district:'동래구',subdistrict:'',address:'부산 동래구'},{store_id:9,province:'부산광역시',district:'기장군',subdistrict:'',address:'부산 기장군'}];
   const managers=[
    {store_id:1,user_id:'owner-1',email:'owner@synthetic.invalid',intended_role:'OWNER',account_state:'ACTIVE',registered_at:'2026-10-16T09:00:00Z'},
    {store_id:1,user_id:'delegate-later',email:'later@synthetic.invalid',intended_role:'ASSISTANT',account_state:'ACTIVE',registered_at:'2026-09-08T09:00:00Z'},
    {store_id:1,user_id:'delegate-earlier',email:'earlier@synthetic.invalid',intended_role:'ASSISTANT',account_state:'ACTIVE',registered_at:'2026-07-01T09:00:00Z'},
    {store_id:1,user_id:'pending-1',email:'pending@synthetic.invalid',intended_role:'OWNER',account_state:'PENDING',registered_at:'2026-06-01T09:00:00Z'}
   ];
   const payload=rpc==='hq_stores_onboarding_list'?stores:rpc==='hq_store_locations_list'?locations:rpc==='hq_store_manager_directory'?managers:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.route('https://qa.invalid/',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><div id="accountVeil" class="show"><div id="adAccount"></div></div><input id="outsideQuickInput">'}));
  await page.goto('https://qa.invalid/');
  await page.addStyleTag({content:css});
  await page.evaluate(()=>{
   window.CONFIG={SUPABASE_URL:'https://qa.invalid',SUPABASE_ANON_KEY:'qa'};
   window.Auth={token:'qa-token'};
   window.BE={listAuthUsers:async()=>[]};
   const originalAdd=document.addEventListener.bind(document);
   const originalRemove=document.removeEventListener.bind(document);
   const activeKeys=new Set();
   document.addEventListener=(type,fn,...opts)=>{
     if(type==='keydown')activeKeys.add(fn);
     return originalAdd(type,fn,...opts);
   };
   document.removeEventListener=(type,fn,...opts)=>{
     if(type==='keydown')activeKeys.delete(fn);
     return originalRemove(type,fn,...opts);
   };
   window.__hqActiveDocKeys=activeKeys;
  });
  await page.addScriptTag({path:'hq_owner_console.js'});
  assert.equal(await page.evaluate(()=>typeof window.mountHqOwnerConsole),'function','HQ module failed to register');
  await page.evaluate(()=>window.mountHqOwnerConsole(document.getElementById('adAccount')));
  await page.locator('.hq-owner-row').first().waitFor();
  assert.equal(await page.locator('.hq-owner-row').count(),283);
  // HQ store-manager contract: default read-only status, separate invite/remove,
  // representative first and assistants chronologically regardless of server array order.
  await page.locator('.hq-owner-row').first().click();
  assert.equal(await page.locator('[data-manager-tab="status"]').getAttribute('aria-selected'),'true');
  // The tallest of status/invite/remove owns a single constant detail height.
  const readManagerGeometry=()=>page.locator('.hq-manager-panel-frame').evaluate(el=>{
    const rect=el.getBoundingClientRect();
    return {height:rect.height,scrollHeight:el.scrollHeight,maxHeight:parseFloat(getComputedStyle(el).maxHeight)};
  });
  const statusFrame=await readManagerGeometry();
  assert.ok(statusFrame.height>0 && statusFrame.height<=statusFrame.maxHeight+1,'tab frame must fit viewport');

  assert.deepEqual(await page.locator('.hq-manager-roster-row strong').allTextContents(),[
    'owner@synthetic.invalid','earlier@synthetic.invalid','later@synthetic.invalid'
  ]);
  assert.equal(await page.locator('.hq-manager-pending-row').count(),1);
  assert.equal(await page.locator('.hq-manager-roster-tag').count(),4,'each manager and invite needs a compact role badge');
  assert.match(await page.locator('.hq-manager-pending-row p').innerText(),/인증·비밀번호 설정 대기:/);
  assert.equal(await page.locator('.hq-manager-empty').count(),0);
  assert.equal(await page.locator('[data-manager-remove]').count(),0,'read-only status must never offer removal controls');
  await page.locator('[data-manager-tab="invite"]').click();
  const inviteFrame=await readManagerGeometry();
  assert.ok(inviteFrame.scrollHeight<=inviteFrame.height+1 || inviteFrame.height<=inviteFrame.maxHeight+1,
    name+': long invitation panel must remain scrollable within its bounded frame');
  assert.ok(Math.abs(inviteFrame.height-statusFrame.height)<=1,
    name+': status and invite must keep identical detail height');

  assert.equal(await page.locator('#hqInviteRole').count(),1);
  assert.equal(await page.locator('[data-manager-remove]').count(),0);
  assert.equal(await page.locator('[data-invite-cancel]').count(),1,'pending invite cancellation must only be in invitation tab');
  assert.equal(await page.locator('[data-owner-resend]').count(),1,'pending invite resend must be next to cancellation');
  assert.equal(await page.locator('.hq-manager-invite-row').count(),1);
  assert.equal(await page.locator('.hq-manager-invite-row').evaluate(el=>getComputedStyle(el).flexDirection),'column',
    'email, role/status, actions must stack on mobile and desktop');
  assert.equal(await page.locator('.hq-manager-invite-row>span').evaluate(el=>getComputedStyle(el).flexDirection),'column');
  assert.match(await page.locator('.hq-manager-invite-row strong').innerText(),/pending@synthetic.invalid/);
  assert.match(await page.locator('.hq-manager-invite-row small').innerText(),/대표 관리자 · 인증 대기/);
  const card=await page.locator('.hq-manager-invite-row').evaluate(el=>{
    const email=el.querySelector('strong').getBoundingClientRect();
    const state=el.querySelector('small').getBoundingClientRect();
    const actions=el.querySelector('.hq-manager-invite-actions').getBoundingClientRect();
    return {emailY:email.y,stateY:state.y,actionsY:actions.y}
  });
  assert.ok(card.emailY<card.stateY && card.stateY<card.actionsY,'pending invitation must be rendered in three lines');

  assert.equal(await page.locator('#hqInviteRole').locator('option').count(),2);
  await page.locator('[data-manager-tab="remove"]').click();
  const removeFrame=await readManagerGeometry();
  assert.ok(Math.abs(removeFrame.height-statusFrame.height)<=1,
    name+': status, invite and remove must keep identical detail height');
  await page.locator('[data-manager-tab="status"]').click();
  const revisitedFrame=await readManagerGeometry();
  assert.ok(Math.abs(revisitedFrame.height-statusFrame.height)<=1,
    name+': revisiting status must not resize the store detail');
  await page.locator('[data-manager-tab="remove"]').click();

  assert.equal(await page.locator('[data-manager-remove]').count(),3,'only confirmed managers may appear in removal tab');
  assert.equal(await page.locator('[data-invite-cancel]').count(),0,'pending invite cancellation must not be in manager removal tab');
  await page.locator('.hq-owner-row').nth(1).click();
  assert.equal(await page.locator('[data-manager-tab="status"]').getAttribute('aria-selected'),'true',
    'switching selected store always resets to status');

  const activeQuickListeners=()=>page.evaluate(()=>window.__hqActiveDocKeys.size);
  assert.equal(await activeQuickListeners(),0,'Closed picker must not keep global keyboard listener');
  const dims=[];const snap=async()=>{const r=await page.getByRole('dialog').boundingBox();assert.ok(r);dims.push([Math.round(r.width),Math.round(r.height)])};
  await page.locator('[data-quick-mode="initial"]').click();
  await snap();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(),/가나다순 찾기/);
  assert.equal(await activeQuickListeners(),1,'Open picker needs exactly one global fallback listener');
  assert.doesNotMatch(await page.locator('[data-letter="ㄱ"]').getAttribute('class')||'',/active/);
  await page.locator('#hqQuickClose').click();
  assert.equal(await activeQuickListeners(),0,'Close must fully unregister fallback listener');
  await page.locator('[data-quick-mode="region"]').click();
  assert.match(await page.getByRole('dialog').innerText(),/지역별 찾기/);
  await page.locator('#hqQuickProvince').selectOption('서울특별시');
  assert.equal(await page.locator('[data-quick-store]').count(),32,'32 official source stores only');
  assert.equal(await page.locator('[data-quick-store="3"]').count(),0,'region_group must not assign unknown address');
  await snap();
  const sizes=await page.locator('.hq-quick-results').evaluate(x=>[x.scrollHeight,x.clientHeight]);
  assert.ok(sizes[0]>sizes[1],'scroll must be internal to dialog');
  assert.ok(await page.locator('[data-quick-store]').count()>0);
  await page.locator('#hqQuickDistrict').selectOption('강남구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['강남역점'],'강남구 must only show verified addresses');
  await page.locator('#hqQuickDistrict').selectOption('송파구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['송파역점'],'송파구 must not show Gangnam or unclassified stores');
  await page.locator('#hqQuickDistrict').selectOption('강북구');
  assert.equal(await page.locator('[data-quick-store]').count(),0,'district without addresses must show no stores');
  await page.locator('#hqQuickProvince').selectOption('경기도');
  await page.locator('#hqQuickDistrict').selectOption('수원시');
  await page.locator('#hqQuickSubdistrict').selectOption('영통구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['테스트3점'],'city subdistrict filtering must be exact');
  await snap();
  await page.locator('#hqQuickSubdistrict').selectOption('팔달구');
  assert.deepEqual(await page.locator('[data-quick-store] span').allTextContents(),['테스트5점'],'changing subdistrict must change stores');
  await page.locator('#hqQuickProvince').selectOption('부산광역시');
  assert.equal(await page.locator('[data-quick-store]').count(),3,'Busan all must include three located stores');
  await page.locator('#hqQuickDistrict').selectOption('금정구');
  assert.equal(await page.locator('[data-quick-store]').count(),1,'Busan Geumjeong district must have store');
  await page.locator('#hqQuickDistrict').selectOption('동래구');
  assert.equal(await page.locator('[data-quick-store]').count(),1,'Busan Dongnae district must have store');
  await page.locator('#hqQuickDistrict').selectOption('기장군');
  assert.equal(await page.locator('[data-quick-store]').count(),1,'Busan Gijang county must have store');
  await page.locator('#hqQuickClose').click();
  await page.locator('[data-quick-mode="region"]').click();
  assert.equal(await page.locator('#hqQuickProvince').inputValue(),'','province selection must reset');
  await page.locator('#hqQuickProvince').selectOption('주소 미확인');
  assert.equal(await page.locator('[data-quick-store]').count(),246,'unmapped stores grouped exclusively in unknown');
  await page.locator('#hqQuickProvince').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0,'Escape must close the region dialog');
  assert.equal(await page.locator('[data-quick-mode="region"]').evaluate(el=>document.activeElement===el),true,
    'Escape must restore keyboard focus to the region trigger');
  await page.locator('[data-quick-mode="region"]').click();
  assert.equal(await page.locator('#hqQuickProvince').inputValue(),'','Escape must reset the region before reopen');
  assert.equal(await page.locator('#hqQuickDistrict').isDisabled(),true,'No stale district after Escape');
  await page.locator('#hqQuickClose').click();
  await page.locator('[data-quick-mode="recent"]').click();
  await snap();
  assert.equal(new Set(dims.map(d=>d[0])).size,1,'dialog width unchanged');
  assert.equal(new Set(dims.map(d=>d[1])).size,1,'dialog height unchanged');
  assert.match(await page.getByRole('dialog').innerText(),/최근 지점/);
  await page.locator('#hqQuickClose').click();
  assert.equal(await page.getByRole('dialog').count(),0);

  await page.locator('[data-quick-mode="region"]').click();
  assert.equal(await page.locator('#hqQuickClose').evaluate(el=>document.activeElement===el),true,
    'region dialog must initially focus its close button');
  await page.locator('#hqQuickProvince').selectOption('부산광역시');
  await page.locator('#hqQuickDistrict').selectOption('기장군');
  await page.locator('[data-quick-store="9"]').click();
  assert.equal(await page.locator('.hq-owner-row.active').getAttribute('data-store'),'9',
    'choosing a quick store must update the selected store');

  const focusAt=index=>page.getByRole('dialog').evaluate((dialog,i)=>{
    const controls=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(el=>el.tabIndex>=0&&!el.hidden&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    return controls[i]===document.activeElement;
  },index);
  const controlCount=()=>page.getByRole('dialog').evaluate(dialog=>[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(el=>el.tabIndex>=0&&!el.hidden&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').length);
  for(const mode of ['region','initial','recent']){
    const trigger=page.locator(`[data-quick-mode="${mode}"]`);
    await trigger.click();
    assert.equal(await page.locator('#hqQuickClose').evaluate(el=>document.activeElement===el),true,
      mode+' dialog must initially focus its close button');
    if(mode==='region'){
      await page.locator('#hqQuickProvince').selectOption('서울특별시');
      await page.locator('#hqQuickClose').focus();
      assert.ok(await page.getByRole('dialog').locator('#hqQuickProvince').count()&&await page.getByRole('dialog').locator('#hqQuickDistrict').count(),
        'region dialog must expose its enabled region selects');
    }else if(mode==='initial'){
      await page.locator('[data-letter="ㄱ"]').click();
      await page.locator('#hqQuickClose').focus();
      assert.ok(await page.locator('[data-letter]').count()>0,'initial dialog must expose letter selectors');
      assert.ok(await page.locator('[data-quick-store]').count()>0,'initial dialog must expose matching store buttons');
    }else{
      assert.ok(await page.locator('[data-quick-store="9"]').count()>0,'recent dialog must expose the selected store');
    }
    const count=await controlCount();
    assert.ok(count>=2,mode+' dialog must contain multiple keyboard controls');
    assert.equal(await focusAt(0),true,mode+' close button must be the first keyboard control');
    for(let i=1;i<count;i++){
      await page.keyboard.press('Tab');
      assert.equal(await focusAt(i),true,mode+' forward Tab must visit only dialog control '+i);
    }
    await page.keyboard.press('Tab');
    assert.equal(await focusAt(0),true,mode+' forward Tab must wrap to the first dialog control');
    for(let i=count-1;i>0;i--){
      await page.keyboard.press('Shift+Tab');
      assert.equal(await focusAt(i),true,mode+' reverse Tab must visit only dialog control '+i);
    }
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focusAt(0),true,mode+' reverse Tab must wrap to the first dialog control');
    await page.locator('#hqQuickClose').click();
    assert.equal(await trigger.evaluate(el=>document.activeElement===el),true,
      mode+' close button must restore focus to its originating trigger');
  }
  await page.locator('[data-quick-mode="region"]').click();
  await page.locator('#hqQuickProvince').selectOption('서울특별시');
  await page.locator('#hqQuickDistrict').selectOption('강남구');
  await page.evaluate(()=>document.activeElement?.blur());
  assert.equal(await page.getByRole('dialog').evaluate(dialog=>dialog.contains(document.activeElement)),false,
    'Escape regression must cover the dialog temporarily having no focused descendant');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0,'Escape must close the quick-store dialog');
  assert.equal(await page.locator('[data-quick-mode="region"]').evaluate(el=>document.activeElement===el),true,
    'Escape must restore focus to the originating region trigger');
  assert.equal(await page.locator('.hq-owner-row.active').getAttribute('data-store'),'9',
    'Escape must preserve the previously selected store');
  await page.locator('[data-quick-mode="region"]').click();
  assert.equal(await page.locator('#hqQuickProvince').inputValue(),'','reopening after Escape must reset the province');
  assert.equal(await page.locator('#hqQuickDistrict').isDisabled(),true,'reopening after Escape must reset dependent region controls');
  await page.locator('#hqQuickClose').click();
  assert.equal(await page.locator('[data-quick-mode="region"]').evaluate(el=>document.activeElement===el),true,
    'normal close must restore focus to its originating trigger');
  // Escape from an unrelated field must not close an active picker.
  await page.locator('[data-quick-mode="region"]').click();
  assert.equal(await activeQuickListeners(),1);
  await page.locator('#outsideQuickInput').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),1,'Unrelated focus must not be intercepted');
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0,'Blurred Escape must still dismiss the dialog');
  assert.equal(await activeQuickListeners(),0,'Escape must unregister keyboard capture');

  // Even if the outer modal closes first, the listener must not survive.
  await page.locator('[data-quick-mode="region"]').click();
  assert.equal(await activeQuickListeners(),1);
  await page.evaluate(()=>document.querySelector('#accountVeil').classList.remove('show'));
  await page.waitForFunction(()=>window.__hqActiveDocKeys.size===0);
  await page.evaluate(()=>{
    document.querySelector('#accountVeil').classList.add('show');
    return window.mountHqOwnerConsole(document.querySelector('#adAccount'));
  });
  await page.locator('.hq-owner-row').first().waitFor();
  assert.equal(await activeQuickListeners(),0,'Remount must not leak prior keyboard listeners');
  assert.equal(await page.getByRole('dialog').count(),0,'Reopen must reset the quick picker');
  await page.locator('[data-quick-mode="recent"]').click();
  assert.equal(await activeQuickListeners(),1,'Remounted popup has exactly one listener');
  await page.evaluate(()=>document.querySelector('#adAccount').remove());
  await page.waitForFunction(()=>window.__hqActiveDocKeys.size===0);
  assert.equal(await activeQuickListeners(),0,'Unmount must unregister keyboard capture');
  assert.deepEqual(errors,[],name+' console errors');
  await page.close();
  console.log('PASS HQ owner browser acceptance '+name);
 }
} finally {await browser.close()}
