import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('edge-release/supabase/functions/server-sync-sheet/index.ts','utf8');
const slice=(start,end)=>{const i=source.indexOf(start),j=source.indexOf(end,i);assert.ok(i>=0&&j>i,start+' extraction anchors');return source.slice(i,j)};
const routeCode=slice('function approvedQaSheetRoute(', '\nasync function sourceFor(');
const writeCode=slice('async function googleWrite(', '\nasync function claim(');
const prodUrl='https://script.google.com/macros/s/PRODUCTION_WEBAPP/exec';
const qaUrl='https://script.google.com/macros/s/QA1243_SEPARATE_WEBAPP/exec';
const prodSecret='prod-canary-protect-source-not-actual-prod-secret';
const qaSecret='qa1243-test-only-secret-that-is-intentionally-more-than-64-characters-in-length-123456789';
const configs=new Map([['SHEET_WEBAPP_URL',prodUrl],['SHEET_SHARED_SECRET',prodSecret]]);
let lastFetch=null;
const context={Deno:{env:{get:key=>configs.get(key)}},
 seoulStamp:()=> '2026-10-20 14:00',
 fetch:async(url,opts)=>{lastFetch={url,body:JSON.parse(opts.body)};
  return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,spreadsheet_id:'QA_ONLY',
    spreadsheet_url:'https://docs.google.com/spreadsheets/d/QA_ONLY/edit',
    sheet_format:{column_resize_applied:true,resize_scope:'all_used_columns_after_write',
      width_source:'measured_display_text',column_width_readback_verified:true,verified_month_tabs:12,
      resized_columns:1,verified_column_widths:12}})};},
 console,Error};
vm.runInNewContext('class HttpError extends Error{constructor(status,message){super(message);this.status=status}}\n'+routeCode+'\n'+writeCode+
 ';globalThis.checkedRoute=approvedQaSheetRoute;globalThis.checkedStore01Route=approvedStore01SheetRoute;globalThis.checkedReadyRoute=approvedReadyStoreSheetRoute;globalThis.checkedWrite=googleWrite;',context);
const route=(id,store)=>context.checkedRoute(id,store);
const store={code:'QA1243_705',name:'[QA #1243] TEST A'};
const sections={header:['value'],rows:[['only-synthetic-data']]};
const payload={store_key:'705',store_name:'[QA #1243] TEST A',attendance:sections,
  sessions:sections,payroll:sections};
assert.equal(route(705,store),null,'Must reject absent approval flag');
configs.set('QA1243_APPROVED_STORE_ID','705');
assert.equal(route(705,store),null,'Must reject absent dedicated script');
configs.set('QA1243_SHEET_WEBAPP_URL',prodUrl);
configs.set('QA1243_SHEET_SHARED_SECRET',qaSecret);
assert.equal(route(705,store),null,'Must reject production Apps Script URL');
configs.set('QA1243_SHEET_WEBAPP_URL',qaUrl);
configs.set('QA1243_SHEET_SHARED_SECRET',prodSecret);
assert.equal(route(705,store),null,'Must reject production shared secret');
configs.set('QA1243_SHEET_SHARED_SECRET','too-short');
assert.equal(route(705,store),null,'Must reject weak secret');
configs.set('QA1243_SHEET_SHARED_SECRET',qaSecret);
assert.equal(route(705,{...store,code:'NOT_QA'}),null,'No marked store code');
assert.equal(route(705,{...store,name:'Live customer store'}),null,'No marked QA store name');
assert.equal(route(706,store),null,'No other store despite settings');
assert.equal(route(1,{code:'QA1243_1',name:'[QA #1243] protected'}),null,'Never route the operating store');
const allowed=route(705,store);assert.ok(allowed,'Exact opted-in dedicated QA store');
assert.equal(allowed.url,qaUrl);assert.equal(allowed.secret,qaSecret);assert.equal(allowed.storeKey,'QA1243_705');
let blocked=false;
try{await context.checkedWrite('2026-10',payload,false,null,null,705,null)}catch(e){blocked=e.status===403&&e.message==='QA_SHEET_ROUTE_NOT_APPROVED'}
assert.ok(blocked&&lastFetch===null,'Nonapproved QA write must fail before any network request');
await context.checkedWrite('2026-10',payload,false,null,null,705,allowed);
assert.equal(lastFetch.url,qaUrl,'QA must use isolated webapp');
assert.equal(lastFetch.body.secret,qaSecret,'QA secret must be independent');
assert.equal(lastFetch.body.store_key,'QA1243_705','Use synthetic store identity');
lastFetch=null;
await context.checkedWrite('2026-10',payload,false,null,null,1,null);
assert.equal(lastFetch.url,prodUrl,'Existing operating store remains routed to existing web app');
assert.equal(lastFetch.body.secret,prodSecret);
assert.equal(lastFetch.body.store_key,'705','Legacy behavior unchanged for operating store');
assert.match(source,/if\(\["sync","parity"\]\.includes\(mode\)&&storeId!==1&&!sheetRoute\)/,
  'Both write and parity must reject unapproved QA stores');
assert.match(source,/\.select\("id,name,code,is_active,onboarding_status"\)/,
  'QA store code is fetched from server');
assert.match(source,/if\(!actor.internal && actor.adminRole!=="HQ"/,'Existing manager authorization must survive');
// Explicitly authorized real store 80: isolated workbook key on the existing
// production Apps Script. No QA store or unrelated registered store may borrow it.
const real=(id,store)=>context.checkedStore01Route(id,store);
const realStore={code:'REAL_1',name:'1호점',onboarding_status:'READY',is_active:true};
assert.equal(real(79,realStore),null,'Different store ID denied');
assert.equal(real(81,realStore),null,'Other store denied');
assert.equal(real(80,{...realStore,code:'QA1243_80'}),null,'QA store denied');
assert.equal(real(80,{...realStore,name:'[QA #1243] fake'}),null,'Wrong store name denied');
assert.equal(real(80,{...realStore,onboarding_status:'STAGED'}),null,'STAGED denied');
assert.equal(real(80,{...realStore,is_active:false}),null,'Inactive denied');
const approvedReal=real(80,realStore);
assert.ok(approvedReal,'Exact READY and active store approved');
assert.equal(approvedReal.storeKey,'STORE_80','Stable isolated ID, not shared source_store_key');
assert.equal(approvedReal.url,prodUrl);
lastFetch=null;
await context.checkedWrite('2026-10',{...payload,store_key:'official_demo',store_name:'1호점'},false,null,null,80,approvedReal);
assert.equal(lastFetch.url,prodUrl,'Approved real store uses operating Google account');
assert.equal(lastFetch.body.store_key,'STORE_80','Never use reused official_demo key');
assert.ok(source.includes('const sheetRoute=qaRoute||approvedStore01SheetRoute(storeId,store)||approvedReadyStoreSheetRoute(storeId,store)'),
 'QA precedence, 1ho legacy and normal READY operational route');
// Verify isolation, account state, QA denial and immutable IDs for every real route.
const ready=(id,store)=>context.checkedReadyRoute(id,store);
for(const [id,code,name] of [[94,'REAL_15','구로고척점'],[290,'REAL_211','구미비산점'],
 [325,'BC_1014','수원시청역점'],[326,'BC_1015','광교상현점'],[327,'BC_1016','동해효가점'],
 [328,'BC_1017','용인역북점'],[329,'BC_1018','용인양지점'],[330,'BC_1019','봉천현대점']]){
  const normalStore={code,name,is_active:true,onboarding_status:'READY'};
  const approved=ready(id,normalStore);
  assert.ok(approved,'READY normal branch must route: '+name);
  assert.equal(approved.storeKey,'STORE_'+id);
  assert.equal(approved.url,prodUrl);
  assert.equal(ready(id,{...normalStore,onboarding_status:'STAGED'}),null);
  assert.equal(ready(id,{...normalStore,is_active:false}),null);
  assert.equal(ready(id,{...normalStore,code:'QA1243_'+id}),null);
  assert.equal(ready(id,{...normalStore,name:'[QA #1243] fake'}),null);
  await context.checkedWrite('2026-11',{...payload,store_key:'official_demo',store_name:name},
    false,null,null,id,approved);
  assert.equal(lastFetch.body.store_key,'STORE_'+id,'Never reuse a shared source key');
}
assert.equal(ready(80,realStore),null,'1ho testing must stay on its existing manual route');
assert.equal(ready(1,{code:'INHA',name:'인하대학교점',is_active:true,onboarding_status:'READY'}),null,
 'INHA must stay on its existing writer');
assert.ok(source.includes('if(body.store_id==="next")'),'Cron must have a ready-store entrypoint');
assert.ok(source.includes('const r=await writeClaimed(ym,storeId,prepared,release,false,sheetRoute)'),
 'Auto writer must pass approved isolated store route');
assert.ok(source.includes('if(!count)return {ok:true,store_id:storeId,skipped:true,reason:"NO_STAFF"}'),
 'Unopened stores must not generate fake payroll workbooks');
const sql=fs.readFileSync('supabase/migrations/20261119_ready_store_sheet_autosync_v1.sql','utf8');
assert.match(sql,/baekeok-sheet-ready-stores-writer/);
assert.match(sql,/store_id":"next"/);
assert.match(sql,/p.store_id=st.id/);
assert.match(sql,/onboarding_status='READY'/);
assert.match(sql,/id<>80/);
console.log('PASS #1243 QA opt-in store route: absent flags, wrong store/secret/URL, no fallback, isolated write, legacy unchanged (read/write network stubs only; NOT live Edge→Apps Script)');
