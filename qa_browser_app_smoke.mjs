import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs';

const host=(process.env.APP_SMOKE_HOST||'http://127.0.0.1:4173').replace(/\/$/,'');
const expectedVersion=fs.readFileSync('index.html','utf8').match(/const APP_VERSION="(v[0-9.]+)"/)?.[1];
assert.ok(expectedVersion,'Expected app version absent');
const employees=[{id:123,name:'김지수',employee_no:1,is_active:true,working:false,today_work_seconds:0,wage:12000,store_id:1}];
const stores=[{id:1,name:'인하대학교점',is_active:true,source_store_key:'official_demo'},{id:2,name:'송도점',is_active:true,source_store_key:'demo_songdo'}];
const dashboard=stores.map(s=>({
  store_id:s.id,store_name:s.name,store_code:'STORE-'+s.id,source_store_key:s.source_store_key,
  region_group:'인천',sales_total:0,sales_7d:0,tx_count:0,trend:[],menu_trend:[]
}));

function reply(route,value,status=200){
  return route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(value)});
}

async function configure(page,calls,role='HQ',managerStoreId=null){
  let working=false, payrollClosed=false,ownerInvited=false,ownerConfirmed=false,storeVerified=false,stageActivated=false;
  if(role!=='GUEST') await page.addInitScript(()=>{
    localStorage.setItem('baekeok_auth',JSON.stringify({
      access_token:'qa-local-token',refresh_token:'qa-refresh-token'
    }));
  });
  await page.route('**/cdnjs.cloudflare.com/**',route=>route.abort());
  await page.route('**/auth/v1/user',route=>reply(route,{id:'qa-admin-id',email:'qa@example.invalid'}));
  await page.route('**/rest/v1/rpc/**',route=>{
    const url=new URL(route.request().url());
    const name=url.pathname.split('/').pop();
    let args={};try{args=JSON.parse(route.request().postData()||'{}')}catch{}
    calls.push({name,args});
    if(name==='list_stores')return reply(route,role==='STORE_MANAGER'?stores:
      stores.filter(x=>x.id===1||stageActivated));
    if(name==='hq_stores_onboarding_list')return reply(route,[
      ...stores.map(x=>({
        ...x,code:'QA_'+x.id,region_group:'인천',
        onboarding_status:x.id===1?'READY':stageActivated?'READY':'STAGED',
        is_active:x.id===1||stageActivated,manager_count:x.id===1?0:ownerConfirmed?1:0
      })),
      ...Array.from({length:281},(_,i)=>({
        id:1000+i,name:'준비 지점 '+(1000+i),code:'QA_'+(1000+i),
        region_group:i%2?'서울':'부산',onboarding_status:'STAGED',
        is_active:false,manager_count:0
      }))
    ]);
    if(name==='hq_store_manager_list')return reply(route,ownerInvited?[
      {user_id:'qa-invited-id',email:'owner@example.invalid',store_id:2,store_name:'송도점'}
    ]:[]);
    if(name==='hq_store_provenance_list')return reply(route,storeVerified?[
      {store_id:2,decision:'VERIFIED',evidence_reference:'QA verified official shop record',reviewed_at:'2026-10-11T00:00:00Z'}
    ]:[]);
    if(name==='hq_store_provenance_review'){
      if(Number(args.p_store_id)!==2 || args.p_decision!=='VERIFIED' ||
         String(args.p_evidence_reference||'').trim().length<15)
        return reply(route,{message:'BAD_VERIFICATION_EVIDENCE'},409);
      storeVerified=true;
      return reply(route,{ok:true,store_id:2,decision:'VERIFIED'});
    }
    if(name==='hq_store_onboarding_set'){
      if(!storeVerified)return reply(route,{message:'PROVENANCE_VERIFICATION_REQUIRED'},409);
      if(!ownerInvited)return reply(route,{message:'CONFIRMED_STORE_MANAGER_REQUIRED'},409);
      stageActivated=true;return reply(route,{ok:true,store_id:2,status:'READY'});
    }
    if(name==='admin_store_payroll_period')return reply(route,{
      store_ready:true,period:{store_id:Number(args.p_store_id),ym:args.p_ym,weeks:4,status:payrollClosed?'CLOSED':'OPEN'},overrides:[]});
    if(name==='list_store_employees'&&role==='STORE_MANAGER')
      return reply(route,employees.map(e=>({...e,store_id:managerStoreId,name:'점주 지점 직원'})));
    if(name==='pos_public_staff_cards'){
      if(![1,2].includes(Number(args.p_store_id)))return reply(route,[]);
      return reply(route,employees.map(e=>({
        id:e.id,employee_no:e.employee_no,name:role==='STORE_MANAGER'?'점주 지점 직원':e.name,
        working,working_since:working?'2026-10-10T09:00:00':null,
        today_work_seconds:0,today_first_in:null,today_last_out:null
      })));
    }
    if(name==='pos_public_staff_picker'){
      if(![1,2].includes(Number(args.p_store_id)))return reply(route,[]);
      return reply(route,employees.map(e=>({id:e.id,employee_no:e.employee_no,
        name:role==='STORE_MANAGER'?'점주 지점 직원':e.name})));
    }
    if(name==='pos_unlock_store'){
      if(String(args.p_pin)!=='1234'||Number(args.p_employee_no)!==1||![1,2].includes(Number(args.p_store_id)))
        return reply(route,{ok:false,error:'INVALID_CREDENTIALS'});
      return reply(route,{ok:true,token:'a'.repeat(64),valid_for_seconds:28800});
    }
    if(name==='pos_employees_state'){
      if(args.p_token!=='a'.repeat(64)||![1,2].includes(Number(args.p_store_id)))
        return reply(route,{message:'POS_AUTH_REQUIRED'},401);
      return reply(route,employees.map(e=>({...e,store_id:Number(args.p_store_id),
        name:role==='STORE_MANAGER'?'점주 지점 직원':e.name,
        working,working_since:working?'2026-10-10T09:00:00':null})));
    }
    if(name==='punch'){
      if(String(args.p_pin)!=='1234')return reply(route,{ok:false,error:'BAD_PIN'});
      working=!working;
      return reply(route,{ok:true,type:working?'IN':'OUT',name:'김지수'});
    }
    const fixtures={
      is_admin:true,
      admin_context:{role,store_id:managerStoreId,email:'qa@example.invalid'},
      list_stores:stores,
      list_employees_state:employees,
      list_store_employees:employees,
      admin_store_employee_contract_statuses:[{employee_id:123,contract_registered:true,contract_effective:true,document_attached:true}],
      admin_store_events_with_corrections:{events:[],corrections:[]},
      admin_store_events:[],
      admin_store_settings_get:{open_minute:420,close_minute:1500,close_grace_minutes:0},
      // A real store-scoped record matching the approved 2026-10-09 stock card.
      admin_store_inventory_overview_v3:[{id:1234,name:"정수",sku:"QA-WATER",category:"기타",unit:"ml",on_hand:4400,reorder_level:20000,reorder_point:15000,unit_configured:false,is_demo:false}],
      admin_store_pending_requests:[],
      admin_store_schedule_list:[],
      hq_store_dashboard:dashboard,
      hq_field_readiness_v1:{
        schema_version:2,captured_at:'2026-10-15T08:18:00Z',
        payroll:{closed_periods:0,closed_periods_with_snapshots:0,qualified_closed_periods:0,approved_weeks:0},
        stores:{qualified_owner_links:0,staged_count:243},
        operations:{completed_imports:0,confirmed_linked_real_transactions:0,unresolved_reconciliations:0,real_stock_movements:0}
      },
      admin_store_payroll_period:{period:{weeks:4},overrides:[]}
    };
    return reply(route,Object.hasOwn(fixtures,name)?fixtures[name]:[]);
  });
  await page.route('**/functions/v1/server-sync-sheet',route=>{
    let args={};try{args=JSON.parse(route.request().postData()||'{}')}catch{}
    calls.push({name:'server-sync-sheet',args});
    if(args.mode==='invite_store_manager'){
      if(args.store_id!==2||args.email!=='owner@example.invalid')return reply(route,{ok:false,error:'BAD_INVITE_ARGS'},403);
      ownerInvited=true;return reply(route,{ok:true,invited:true,store_id:2,role:'STORE_MANAGER'});
    }
    if(args.mode==='payroll_close_preview')return reply(route,{ok:true,ym:args.ym,employee_count:1,gross:54000,net:52210,fingerprint:'a'.repeat(64)});
    if(args.mode==='payroll_close'){
      if(args.fingerprint!=='a'.repeat(64)||args.confirm_ym!==args.ym)return reply(route,{ok:false,error:'BAD_QA_FINGERPRINT'},409);
      payrollClosed=true;return reply(route,{ok:true,result:{status:'CLOSED',count:1}});
    }
    if(args.mode==='payroll_reopen'){
      if(args.confirm_ym!==args.ym||String(args.reason||'').length<5)return reply(route,{ok:false,error:'BAD_QA_REOPEN'},409);
      payrollClosed=false;return reply(route,{ok:true,result:{status:'OPEN',archived:1}});
    }
    if(args.mode!=='payroll')return reply(route,{ok:false,error:'UNSUPPORTED_QA_MODE'},403);
    return reply(route,{ok:true,ym:args.ym,engine_revision:'20261010-verified',result:{
      active:[],rows:[],weeks:4,overrides:{},totalGross:0,totalNet:0
    }});
  });
  // Server fixtures can confirm an invitation only after the simulated owner
  // completes email verification. No email or production auth state is touched.
  return {confirmOwner:()=>{if(!ownerInvited)throw Error('INVITE_NOT_SENT');ownerConfirmed=true;}};
}
async function check(condition,message){assert.ok(condition,message)}
async function unlockPos(page,label){
  // First page must offer staff cards. Nobody should enter employee number
  // in a new kiosk gate before their ordinary 4-digit punch PIN.
  await page.locator('#empGrid .emp').first().waitFor({timeout:20000});
  assert.equal(await page.locator('#posUnlockForm').count(),0,
    'Extra kiosk unlock form reappeared '+label);
  assert.equal(await page.locator('#empGrid .emp').first().getAttribute('role'),'button',
    'Accessible original staff picker missing '+label);
  await page.locator('#empGrid .emp').first().click();
  await page.locator('#padVeil.show').waitFor({timeout:10000});
  assert.match(await page.locator('#padWho').innerText(),/PIN 입력 후 출퇴근 처리/);
  for(const d of ['1','2','3','4'])await page.locator('#padKeys').getByRole('button',{name:d,exact:true}).click();
  await page.locator('#padKeys .ok-action').click();
  await page.waitForFunction(()=>document.querySelector('#empGrid .emp')?.classList.contains('working'),null,{timeout:15000});
  await page.locator('#success').click({force:true});
  // Undo the first synthetic IN, so the rest of the long-standing smoke
  // still tests its normal IN then OUT assertions from a clean state.
  await page.locator('#empGrid .emp').first().click();
  await page.locator('#padVeil.show').waitFor({timeout:10000});
  for(const d of ['1','2','3','4'])await page.locator('#padKeys').getByRole('button',{name:d,exact:true}).click();
  await page.locator('#padKeys .ok-action').click();
  await page.waitForFunction(()=>!!document.querySelector('#empGrid .emp') &&
    !document.querySelector('#empGrid .emp').classList.contains('working'),null,{timeout:15000});
  await page.locator('#success').click({force:true});
}


async function smoke(browser,label,viewport){
  const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage();
  const calls=[],errors=[];
  page.on('pageerror',err=>errors.push({message:String(err.message||err),stack:String(err.stack||''),url:page.url()}));
  page.on('console',msg=>{
    if(msg.type()==='error' && /SyntaxError|Invalid or unexpected token|Uncaught/.test(msg.text()))
      errors.push({message:msg.text(),source:msg.location()});
  });
  const ownerFixture=await configure(page,calls);
  await page.goto(host+'/index.html?mode=store&store=1#pos',{waitUntil:'domcontentloaded'});
  await page.locator('#empGrid .emp').first().waitFor({timeout:20000});
  // The actual production HTML asynchronously injects test_mode_ui_v1.js.
  // Validate the version button against those REAL controls, not a synthetic fixture.
  await page.locator('#testModeControls').waitFor({timeout:20000});
  assert.equal(await page.locator('#testModeControls').isVisible(),true,'LIVE test controls must start visible');
  await page.locator('#appVersion').click();
  assert.equal(await page.locator('#testModeControls').isVisible(),false,'Version button must hide real LIVE/clock controls');
  await page.locator('#appVersion').click();
  assert.equal(await page.locator('#testModeControls').isVisible(),true,'Version button must restore real LIVE/clock controls');
  assert.match(await page.locator('#empGrid .emp').first().innerText(),/출근 전/);
  assert.match(await page.locator('#empGrid .emp').first().innerText(),/출근 기록 없음/);
  assert.equal(await page.locator('#empGrid .emp').first().locator('.pos-att-edit').count(),1,
    'HQ authenticated administrator should see original pencil');
  const pencilCalls=calls.length;
  await page.locator('#empGrid .emp .pos-att-edit').first().click();
  await page.getByText('김지수 · 근태 수정').waitFor({timeout:10000});
  assert.ok(calls.slice(pencilCalls).some(x=>x.name==='admin_store_events_with_corrections'),
    'Original edit button must request the scoped real correction API');
  await page.locator('#addVeil').evaluate(el=>el.classList.remove('show'));
  await unlockPos(page,label);
  assert.equal((await page.locator('#appVersion').innerText()).trim(),expectedVersion,'Deployed app version mismatch '+label);
  assert.match(await page.locator('#empGrid').innerText(),/김지수/);
  await check(await page.locator('#lockedStoreName').isVisible(),'Store identity missing '+label);
  assert.equal(await page.locator('header.long-store-context').count(),0,'Inha header regression '+label);
  // Exercise IN/OUT with local fixtures only; never submit real attendance.
  for(const expectedWorking of [true,false]){
    await page.locator('#empGrid .emp').first().click();
    await page.locator('#padVeil.show').waitFor({timeout:10000});
    for(const digit of ['1','2','3','4']){
      await page.locator('#padKeys').getByRole('button',{name:digit,exact:true}).click();
    }
    await page.locator('#padKeys .ok-action').click();
    await page.waitForFunction(working=>{
      const card=document.querySelector('#empGrid .emp');
      return !!card && card.classList.contains('working')===working;
    },expectedWorking,{timeout:12000});
    await page.locator('#success').click({force:true});
  }
  assert.deepEqual(calls.filter(x=>x.name==='punch').map(x=>x.args.p_employee_id),[123,123,123,123],'PIN-first and followup IN/OUT employee IDs '+label);
  await page.locator('#hqHome').click();
  assert.ok((new URL(page.url())).hash==='#pos','Brand logo must not open headquarters '+label);
  await page.evaluate(()=>{location.hash='#dashboard'});
  await page.waitForFunction(()=>location.hash==='#pos');
  // Employee management must render active employees without mutating production records.
  await page.evaluate(()=>{location.hash='#admin'});
  await page.locator('#adEmps .employee-manage-card').first().waitFor({timeout:15000});
  assert.match(await page.locator('#adEmps').innerText(),/김지수/,'Employee roster missing '+label);
  assert.equal(await page.locator('#adEmps .contract-alert').count(),0,'Contract flags must come from scoped RPC '+label);
  assert.ok(calls.some(x=>x.name==='admin_store_employee_contract_statuses'&&x.args.p_store_id===1),'Scoped contract-status query missing '+label);
  assert.ok(!calls.some(x=>x.name==='admin_employee_contract_statuses'),'Legacy global contract-status read must not run '+label);
  await page.locator('#empTabRetired').click();
  await page.locator('#adEmps .employee-empty').waitFor({timeout:10000});
  await page.locator('#empTabActive').click();
  await page.locator('#adEmps .employee-manage-card').first().waitFor({timeout:10000});
  await page.evaluate(()=>{location.hash='#pay'});
  await page.waitForFunction(()=>document.querySelector('#payList')?.innerText.match(/등록된 급여 대상 직원|불러오기 실패/),null,{timeout:18000});
  assert.match(await page.locator('#payList').innerText(),/등록된 급여 대상 직원/,'Server payroll rendering failed '+label+'; calls='+JSON.stringify(calls.filter(x=>x.name==='server-sync-sheet')));
  assert.ok(calls.some(x=>x.name==='server-sync-sheet'&&x.args.mode==='payroll'&&x.args.store_id===1),'Live payroll adapter did not call Edge '+label);
  await page.waitForFunction(()=>document.querySelector('#payMonth')!==null);
  // Exercise preview -> confirmed close -> reasoned reopen only against mock APIs.
  await page.locator('#payMonth').fill('2026-09');
  await page.locator('#payMonth').dispatchEvent('change');
  await page.getByRole('button',{name:'급여 마감 검토'}).waitFor({timeout:15000});
  assert.ok(!calls.some(x=>x.name==='admin_payroll_period'),'Legacy global payroll period must not be requested '+label);
  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'모의 마감 재오픈 QA':''));
  await page.getByRole('button',{name:'급여 마감 검토'}).click();
  await page.waitForTimeout(300);
  const actions=calls.filter(x=>x.name==='server-sync-sheet').map(x=>x.args.mode);
  assert.ok(actions.includes('payroll_close_preview'),'Preview did not invoke Edge '+label+' '+JSON.stringify(actions));
  assert.ok(actions.includes('payroll_close'),'Close did not invoke Edge '+label+' '+JSON.stringify(actions)+'; UI='+await page.locator('#payCloseSlot').innerText()+' toast='+await page.locator('#toast').innerText());
  await page.waitForTimeout(800);
  const closingSlot=await page.locator('#payCloseSlot').innerText();
  assert.ok(closingSlot.includes('급여 마감 재오픈'),'Close did not switch to CLOSED '+label+
    '; slot='+JSON.stringify(closingSlot)+'; toast='+JSON.stringify(await page.locator('#toast').innerText())+
    '; calls='+JSON.stringify(calls.filter(x=>x.name==='server-sync-sheet'||x.name==='admin_store_payroll_period')));
  await page.getByRole('button',{name:'급여 마감 재오픈'}).click();
  await page.getByRole('button',{name:'급여 마감 검토'}).waitFor({timeout:15000});
  const closeModes=calls.filter(x=>x.name==='server-sync-sheet'&&
     ['payroll_close_preview','payroll_close','payroll_reopen'].includes(x.args.mode)).map(x=>x.args.mode);
  assert.deepEqual(closeModes,['payroll_close_preview','payroll_close','payroll_reopen'],'Safe close/reopen flow '+label);

  // Inha exposes the complete operations navigation; other stores retain three tabs.
  await page.evaluate(()=>{location.hash='#admin'});
  // Waiting for the prior payroll subnav is racy: require the new admin view first.
  await page.locator('#adEmps .employee-manage-card').first().waitFor({timeout:18000});
  await page.waitForFunction(()=>document.querySelectorAll('.admin-subnav-shell .admin-subtabs a').length===6,null,{timeout:12000});
  assert.deepEqual(await page.locator('.admin-subnav-shell .admin-subtabs a').allTextContents(),
    ['리포트','직원 관리','급여','운영시간','매출·매입','재고'],'Inha management tab visibility '+label);
  // Exercise the internal inventory renderer BEFORE testing the blocked public route.
  // A redirect to #admin starts an async admin render which can erase the internal
  // test screen (especially in slower desktop CI) while stock data is loading.
  await page.evaluate(()=>window.renderOperations('inventory'));
  await page.locator('#opsInventoryAdd').waitFor({timeout:12000});
  const water=page.locator('.ops-stock-bar[data-inventory-name="정수"]');
  await water.waitFor({timeout:12000});
  assert.match(await water.innerText(),/긴급 부족/,'Approved stock state card missing '+label);
  assert.match(await water.innerText(),/발주 필요: 15,600 ml/,'Approved stock quantity card missing '+label);
  assert.match(await water.innerText(),/단위 확인 필요/,'Unit conversion notice missing '+label);
  assert.equal(await water.locator('.ops-stock-level').count(),1,'Stock level indicator missing '+label);
  await water.locator('.ops-unit-config-btn').click();
  await page.locator('#unitStock').waitFor({timeout:12000});
  assert.match(await page.locator('.ops-modal').last().innerText(),/단위 환산/);
  await page.locator('.ops-modal').last().locator('.ops-modal-head button').click();
  await page.locator('#opsInventoryAdd').click();
  await page.locator('#inventoryName').waitFor({timeout:10000});
  await page.locator('.ops-modal').last().locator('.ops-modal-head button').click();
  await page.locator('#opsInventoryBulk').click();
  await page.locator('#inventoryBulkFile').waitFor({timeout:10000});
  await page.locator('.ops-modal').last().locator('.ops-modal-head button').click();
  assert.ok(calls.some(x=>x.name==='admin_store_inventory_overview_v3'&&x.args.p_store_id===1),
    'Approved inventory bypassed scoped RPC '+label);
  await page.evaluate(()=>{location.hash='#inventory'});
  await page.locator('#opsInventoryAdd').waitFor({timeout:12000});
  assert.equal(await page.locator('.admin-subnav-shell a[href="#inventory"]').count(),1,
    'Inha inventory tab should be visible '+label);
  await page.evaluate(()=>{location.hash='#attendance'});
  await page.waitForURL(/actual_attendance\.html/,{timeout:20000});
  await page.locator('#monthLabel').waitFor({timeout:20000});
  await page.locator('.calendar').waitFor({timeout:20000});
  assert.ok(calls.some(x=>x.name==='admin_store_events_with_corrections'&&x.args.p_store_id===1),'Attendance not scoped '+label+'; calls='+JSON.stringify(calls.map(x=>x.name)));
  assert.ok(!calls.some(x=>x.name==='admin_events_with_corrections'||x.name==='admin_list_all_employees'),'Legacy broad data access '+label);
  await page.goto(host+'/index.html#dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('.hq-store-panel').first().waitFor({timeout:20000});
  assert.equal(await page.locator('.hq-store-panel').count(),2,'HQ store cards '+label);
  assert.equal(await page.locator('#hqReadinessOpen').count(),0,'Internal QA control hidden from HQ dashboard '+label);
  assert.match(await page.locator('#view').innerText(),/시연용 거래는 매출 집계에서 제외했습니다/);
  // HQ provisioning must not send a real email: mock Edge and SQL RPCs only.
  await page.evaluate(()=>openAccountMgmt());
  await page.locator('#hqOnboardingStore').waitFor({timeout:12000});
  assert.match(await page.locator('#hqStoreCounts').innerText(),/등록 283곳 · 운영 1 · 준비 282/);
  await page.locator('#hqOnboardingSearchInput').fill('송도');
  await page.waitForFunction(()=>[...document.querySelectorAll('#hqOnboardingStore option')].filter(o=>!o.disabled).length===1);
  assert.match(await page.locator('#hqOnboardingStore').innerText(),/송도점/);
  await page.locator('#hqStoreStatusFilter').selectOption('READY');
  assert.equal(await page.locator('#hqOnboardingStore').isDisabled(),true,
    'READY filter must not match unactivated Songdo '+label);
  await page.locator('#hqStoreStatusFilter').selectOption('STAGED');
  await page.locator('#hqOnboardingStore').selectOption('2');
  assert.match(await page.locator('#hqOnboardingBody').innerText(),/STAGED/);
  assert.equal(await page.locator('#hqManagerCard').isVisible(),true,'Compact owner card must be prominent '+label);
  assert.equal(await page.locator('#hqStoreOperations').evaluate(el=>el.open),false,'Operational controls should start collapsed '+label);
  assert.equal(await page.locator('#hqStoreReady').isDisabled(),true,'Unverified store must not activate '+label);
  await page.locator('#hqManagerEmail').fill('owner@example.invalid');
  await page.locator('#hqManagerInvite').click();
  await page.waitForFunction(()=>document.querySelector('#hqOnboardingBody')?.innerText.includes('owner@example.invalid'),null,{timeout:12000});
  assert.ok(calls.some(x=>x.name==='server-sync-sheet'&&x.args.mode==='invite_store_manager'&&x.args.store_id===2),
    'HQ invite service not called '+label);
  assert.equal(await page.locator('#hqStoreReady').isDisabled(),true,'Invitation without verification must not activate '+label);
  await page.locator('#hqStoreOperations summary').click();
  assert.equal(await page.locator('#hqStoreOperations').evaluate(el=>el.open),true,'Operations details must expand '+label);
  await page.locator('#hqStoreEvidence').fill('QA verified official shop record');
  await page.locator('#hqStoreVerify').click();
  await page.waitForFunction(()=>document.querySelector('#hqOnboardingBody')?.innerText.includes('VERIFIED'),
    null,{timeout:12000});
  assert.equal(await page.locator('#hqStoreReady').isDisabled(),true,
    'Verified branch with an unconfirmed invite must remain inactive '+label);
  assert.equal(await page.locator('#hqStoreOperations').evaluate(el=>el.open),true,'Operations details remain expanded after verified refresh '+label);
  assert.equal(calls.filter(x=>x.name==='hq_store_onboarding_set').length,0,
    'Unconfirmed owner must never activate a store '+label);
  ownerFixture.confirmOwner();
  // Owner status is refreshed when HQ reopens the panel, not by a dedicated button.
  await page.evaluate(async()=>{
    const current=document.getElementById('hqStoreOnboarding');
    const parent=current.parentElement;
    current.remove();
    await window.mountHqStoreOnboarding(parent);
  });
  await page.locator('#hqOnboardingStore').selectOption('2');
  await page.locator('#hqStoreOperations summary').click();
  await page.waitForFunction(()=>document.querySelector('#hqStoreReady')?.disabled===false,
    null,{timeout:12000});
  assert.ok(calls.some(x=>x.name==='hq_store_provenance_review'&&x.args.p_store_id===2&&
     x.args.p_decision==='VERIFIED'&&x.args.p_evidence_reference==='QA verified official shop record'),
     'HQ verification audit was not recorded '+label);
  await page.locator('#hqStoreReady').click();
  await page.locator('#hqStoreLink').waitFor({timeout:12000});
  assert.match(await page.locator('#hqStoreLink').getAttribute('href'),/mode=store&store=2#pos/);
  assert.match(await page.locator('#hqStoreShareUrl').inputValue(),/mode=store&store=2#pos/);
  await page.locator('#hqStoreShareUrl').click();
  assert.equal(await page.locator('#hqStoreShareUrl').evaluate(el=>el.selectionStart),0,
    'READY store URL should be easy to copy '+label);
  await page.locator('#accountClose').click();

  await page.locator('.hq-store-panel button').first().click();
  await page.waitForURL(/mode=store&store=/,{timeout:15000});
  await check(!(await page.locator('#storeSelect').isVisible().catch(()=>false)),'Store should not show HQ switcher '+label);
  if(viewport.width<500){
    const widths=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    assert.ok(widths.doc<=widths.view+30,'Mobile horizontal overflow: '+JSON.stringify(widths));
  }
  assert.deepEqual(errors,[],'Browser runtime exceptions '+label);
  await context.close();
  console.log('PASS browser smoke '+label+': POS IN/OUT / store lock / employees / server payroll / inventory / attendance / HQ navigation');
}
async function guestPosCards(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),calls=[];
  await configure(page,calls,'GUEST');
  await page.goto(host+'/index.html?mode=store&store=1#pos',{waitUntil:'domcontentloaded'});
  await page.locator('#empGrid .emp').first().waitFor({timeout:20000});
  assert.match(await page.locator('#empGrid .emp').first().innerText(),/출근 전/);
  assert.match(await page.locator('#empGrid .emp').first().innerText(),/출근 기록 없음/);
  assert.equal(await page.locator('.pos-att-edit').count(),0,'Non-authenticated staff must never see the edit pencil');
  assert.equal(calls.filter(x=>x.name==='is_admin').length,0,'Public kiosk must not query admin permission');
  assert.ok(calls.some(x=>x.name==='pos_public_staff_cards'),'Guest should receive limited status cards only');
  assert.equal(calls.filter(x=>x.name==='list_employees_state').length,0,'Guest must never invoke direct staff private function');
  await context.close();
  console.log('PASS unauthenticated original POS card state and admin pencil denied');
}
// Field regression #1028: employee self-service entry must work on a store
// shared terminal with NO manager login and NO kiosk-unlock token. The public
// roster is for selecting an employee, not a substitute for PIN authentication.
async function guestAttendance(browser){
  const context=await browser.newContext({viewport:{width:1366,height:768},locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage(),calls=[],errors=[];
  page.on('pageerror',e=>errors.push(String(e?.message||e)));
  await configure(page,calls,'GUEST');
  await page.goto(host+'/index.html?mode=store&store=1#attendance',{waitUntil:'domcontentloaded'});
  await page.locator('#mrEmp').waitFor({timeout:20000});
  assert.ok((await page.locator('#mrEmp').innerText()).includes('김지수'),
    'Public staff picker must populate the unauthenticated attendance modal');
  assert.equal(await page.locator('#mrPin').count(),1,
    'The employee PIN prompt must remain mandatory');
  assert.ok(calls.some(x=>x.name==='pos_public_staff_cards'&&Number(x.args.p_store_id)===1),
    'Guest attendance must call READY-only public staff cards');
  assert.equal(calls.filter(x=>x.name==='pos_employees_state').length,0,
    'No protected POS session RPC before employee PIN');
  assert.equal(calls.filter(x=>x.name==='my_events').length,0,
    'Private attendance events must not be read before employee PIN');
  await page.locator('#mrView').click();
  assert.match(await page.locator('#mrHint').innerText(),/비밀번호 4자리/);
  assert.equal(calls.filter(x=>x.name==='my_events').length,0,
    'An empty PIN must not cause an attendance RPC');
  assert.deepEqual(errors,[],'Guest attendance JS errors '+JSON.stringify(errors));
  await context.close();
  console.log('PASS live deployed shared POS: unauthenticated staff picker, PIN required, private roster/events never leaked');
}
async function ownerScopedRoute(browser,label,viewport){
  const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage();
  const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(String(e?.message||e)));
  await configure(page,calls,'STORE_MANAGER',2);
  await page.goto(host+'/index.html?mode=store&store=1#admin',{waitUntil:'domcontentloaded'});
  await page.waitForURL(/mode=store&store=2#pos/,{timeout:20000});
  await page.locator('#empGrid .emp').first().waitFor({timeout:20000});
  await unlockPos(page,label);
  assert.ok((await page.locator('#empGrid').innerText()).includes('점주 지점 직원'),'Store owner POS scope '+label);
  assert.equal(await page.locator('#storeSelect').count(),0,'Store owner must not have HQ store switcher '+label);
  await page.evaluate(()=>{location.hash='#admin'});
  await page.locator('#adEmps .employee-manage-card').first().waitFor({timeout:18000});
  assert.deepEqual(await page.locator('.admin-subnav-shell .admin-subtabs a').allTextContents(),
    ['직원 관리','급여','운영시간'],'Owner management tabs '+label);
  assert.ok(calls.some(x=>x.name==='list_store_employees'&&x.args.p_store_id===2),'Owner employees not scoped '+label);
  assert.ok(!calls.some(x=>x.name==='list_store_employees'&&x.args.p_store_id===1),'Owner accessed Inha employees '+label+'; calls='+JSON.stringify(calls.filter(x=>x.name==='list_store_employees'||x.name==='admin_context')));
  await page.evaluate(()=>{location.hash='#dashboard'});
  await page.waitForFunction(()=>location.hash==='#pos',null,{timeout:10000});
  assert.equal(errors.length,0,'Owner route browser runtime exceptions '+label+': '+JSON.stringify(errors));
  await context.close();
  console.log('PASS scoped store manager '+label+': wrong-store redirect, employee isolation, HQ lock');
}
async function blockedStoreRoute(browser,label,viewport){
  const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage();const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(String(e?.message||e)));
  await configure(page,calls,'HQ');
  for(const id of ['2','999999','invalid','0',null]){
    const url=id===null?'/index.html?mode=store#pos':'/index.html?mode=store&store='+id+'#pos';
    await page.goto(host+url,{waitUntil:'domcontentloaded'});
    await page.getByText('지점 운영 준비 중').waitFor({timeout:15000});
    assert.equal(await page.locator('#empGrid .emp').count(),0,
      'Blocked store must not display Inha employee cards '+label+'/'+id);
    assert.equal(await page.locator('#storeSelect').count(),0,
      'Blocked store must not expose HQ selector '+label+'/'+id);
    assert.equal(await page.locator('.tabwrap').isVisible(),false,
      'Blocked store must not expose POS or management tabs '+label+'/'+id);
    assert.equal((await page.locator('#lockedStoreName').innerText()).trim(),'지점 확인 필요');
    await page.evaluate(()=>{location.hash='#admin'});
    await page.getByText('지점 운영 준비 중').waitFor({timeout:10000});
    assert.equal(await page.locator('#adEmps .employee-manage-card').count(),0,
      'Direct hash entry must not bypass pending store gate '+label+'/'+id);
    assert.equal(await page.locator('.admin-subnav-shell').count(),0,
      'Blocked store must not render Inha admin controls '+label+'/'+id);
  }
  assert.deepEqual(errors,[],'Blocked store caused browser errors '+label);
  await context.close();
  console.log('PASS blocked store routes '+label+': STAGED, unknown, malformed, no Inha fallback');
}
// Field incident 2026-10-13: test a real mobile dedicated link when LTE
// request for list_stores fails. This uses intercepted fake RPCs ONLY.
async function posNetworkRecovery(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage();
  const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await configure(page,calls,'HQ');
  let disconnected=true;
  await page.route('**/rest/v1/rpc/list_stores',async route=>{
    if(disconnected){
      await new Promise(resolve=>setTimeout(resolve,750));
      return route.abort('failed').catch(()=>{});
    }
    return reply(route,[{id:1,name:'인하대학교점',is_active:true,source_store_key:'official_demo'}]);
  });
  await page.goto(host+'/index.html?mode=store&store=1#pos',{waitUntil:'domcontentloaded'});
  await page.getByText('지점 연결 확인 중…').waitFor({timeout:4500});
  assert.equal(await page.locator('#empGrid .emp').count(),0,'Unverified dedicated store leaked POS cards');
  await page.getByRole('button',{name:'다시 연결'}).waitFor({timeout:5000});
  assert.equal(await page.locator('.tabwrap').isVisible(),false,
   'Failed live verification must keep unverified store tabs hidden');
  assert.match(await page.locator('#view').innerText(),/지점 서버 연결이 지연/);
  disconnected=false;
  await page.getByRole('button',{name:'다시 연결'}).click();
  await unlockPos(page,'offline-recovery');
  assert.match(await page.locator('#empGrid').innerText(),/김지수/,
    'Retry must restore authorized store employee roster');
  assert.equal(errors.length,0,'POS error recovery must not throw in browser '+JSON.stringify(errors));

  // A direct URL without an explicit hash is common when staff share links.
  await page.goto(host+'/index.html?mode=store&store=1',{waitUntil:'domcontentloaded'});
  await page.locator('#empGrid .emp').first().waitFor({timeout:12000});
  assert.equal(errors.length,0,'No-hash POS entry crashed '+JSON.stringify(errors));
  await context.close();
  console.log('PASS field LTE outage: visible pending and error, scoped retry, no-hash POS recovery');
}
const browser=await chromium.launch({headless:true});
try{
  await smoke(browser,'mobile',{width:390,height:844});
  await smoke(browser,'desktop',{width:1440,height:900});
  await guestPosCards(browser);
  await guestAttendance(browser);
  await ownerScopedRoute(browser,'mobile',{width:390,height:844});
  await ownerScopedRoute(browser,'desktop',{width:1440,height:900});
  await blockedStoreRoute(browser,'mobile',{width:390,height:844});
  await blockedStoreRoute(browser,'desktop',{width:1440,height:900});
  await posNetworkRecovery(browser);
}catch(error){
  fs.mkdirSync('qa-results',{recursive:true});
  fs.writeFileSync('qa-results/store-opening-app-smoke-failure.txt',String(error&&error.stack||error));
  for(const [ci,ctx] of browser.contexts().entries()){
    for(const [pi,page] of ctx.pages().entries()){
      try{await page.screenshot({path:'qa-results/store-opening-app-smoke-'+ci+'-'+pi+'.png',fullPage:true,timeout:3000});}
      catch(_){} // Never replace the original failing assertion.
    }
  }
  throw error;
}finally{
  await browser.close();
}
