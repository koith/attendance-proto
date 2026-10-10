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

async function configure(page,calls){
  let working=false, payrollClosed=false;
  await page.addInitScript(()=>{
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
    if(name==='admin_store_payroll_period')return reply(route,{
      period:{store_id:Number(args.p_store_id),ym:args.p_ym,weeks:4,status:payrollClosed?'CLOSED':'OPEN'},overrides:[]});
    if(name==='list_employees_state'){
      return reply(route,employees.map(e=>({...e,working,working_since:working?'2026-10-10T09:00:00':null})));
    }
    if(name==='punch'){
      if(String(args.p_pin)!=='1234')return reply(route,{ok:false,error:'BAD_PIN'});
      working=!working;
      return reply(route,{ok:true,type:working?'IN':'OUT',name:'김지수'});
    }
    const fixtures={
      is_admin:true,
      admin_context:{role:'HQ',store_id:null,email:'qa@example.invalid'},
      list_stores:stores,
      list_employees_state:employees,
      list_store_employees:employees,
      admin_store_employee_contract_statuses:[{employee_id:123,contract_registered:true,contract_effective:true,document_attached:true}],
      admin_store_events_with_corrections:{events:[],corrections:[]},
      admin_store_events:[],
      admin_store_settings_get:{open_minute:420,close_minute:1500,close_grace_minutes:0},
      admin_store_pending_requests:[],
      admin_store_schedule_list:[],
      hq_store_dashboard:dashboard,
      admin_store_payroll_period:{period:{weeks:4},overrides:[]}
    };
    return reply(route,Object.hasOwn(fixtures,name)?fixtures[name]:[]);
  });
  await page.route('**/functions/v1/server-sync-sheet',route=>{
    let args={};try{args=JSON.parse(route.request().postData()||'{}')}catch{}
    calls.push({name:'server-sync-sheet',args});
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
}
async function check(condition,message){assert.ok(condition,message)}

async function smoke(browser,label,viewport){
  const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});
  const page=await context.newPage();
  const calls=[],errors=[];
  page.on('pageerror',err=>errors.push({message:String(err.message||err),stack:String(err.stack||''),url:page.url()}));
  page.on('console',msg=>{
    if(msg.type()==='error' && /SyntaxError|Invalid or unexpected token|Uncaught/.test(msg.text()))
      errors.push({message:msg.text(),source:msg.location()});
  });
  await configure(page,calls);
  await page.goto(host+'/index.html?mode=store&store=1#pos',{waitUntil:'domcontentloaded'});
  await page.locator('#empGrid .emp').first().waitFor({timeout:20000});
  assert.equal((await page.locator('#appVersion').innerText()).trim(),expectedVersion,'Deployed app version mismatch '+label);
  assert.match(await page.locator('#empGrid').innerText(),/김지수/);
  await check(await page.locator('#lockedStoreName').isVisible(),'Store identity missing '+label);
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
  assert.deepEqual(calls.filter(x=>x.name==='punch').map(x=>x.args.p_employee_id),[123,123],'IN/OUT punch employee IDs '+label);
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
  assert.ok(calls.some(x=>x.name==='admin_store_payroll_period'&&x.args.p_store_id===1),'Payroll period must be scoped to selected store '+label);
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

  await page.evaluate(()=>{location.hash='#inventory'});
  await page.waitForFunction(()=>location.hash==='#inventory');
  await page.locator('#opsInventoryAdd').waitFor({timeout:12000});
  await page.locator('#opsInventoryAdd').click();
  await page.locator('#inventoryName').waitFor({timeout:10000});
  await page.locator('.ops-modal').last().locator('.ops-modal-head button').click();
  await page.locator('#opsInventoryBulk').click();
  await page.locator('#inventoryBulkFile').waitFor({timeout:10000});
  await page.locator('.ops-modal').last().locator('.ops-modal-head button').click();
  await page.evaluate(()=>{location.hash='#attendance'});
  await page.waitForURL(/actual_attendance\.html/,{timeout:20000});
  await page.locator('#monthLabel').waitFor({timeout:20000});
  await page.locator('.calendar').waitFor({timeout:20000});
  assert.ok(calls.some(x=>x.name==='admin_store_events_with_corrections'&&x.args.p_store_id===1),'Attendance not scoped '+label+'; calls='+JSON.stringify(calls.map(x=>x.name)));
  assert.ok(!calls.some(x=>x.name==='admin_events_with_corrections'||x.name==='admin_list_all_employees'),'Legacy broad data access '+label);
  await page.goto(host+'/index.html#dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('.hq-store-panel').first().waitFor({timeout:20000});
  assert.equal(await page.locator('.hq-store-panel').count(),2,'HQ store cards '+label);
  assert.match(await page.locator('#view').innerText(),/시연용 거래는 매출 집계에서 제외했습니다/);
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
const browser=await chromium.launch({headless:true});
try{
  await smoke(browser,'mobile',{width:390,height:844});
  await smoke(browser,'desktop',{width:1440,height:900});
}finally{
  await browser.close();
}
