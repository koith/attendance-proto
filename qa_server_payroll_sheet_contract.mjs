import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

const app=fs.readFileSync('index.html','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const engine=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const pages=fs.readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
const script=fs.readFileSync('.github/workflows/apps-script-deploy.yml','utf8');
const deploy=fs.readFileSync('tools/verify_sheet_deploy.mjs','utf8');
// The live browser must not be the calculation authority for the pilot store.
assert.match(app,/if\(LIVE && Number\(CURRENT_STORE_ID\)===1\)[\s\S]{0,250}BE\.serverPayroll\(ym\)/);
assert.match(app,/\/functions\/v1\/server-sync-sheet/);
assert.match(app,/mode:"sync",ym,store_id:CURRENT_STORE_ID,payload/);
assert.match(app,/mode:"payroll",ym,store_id:CURRENT_STORE_ID/);
assert.doesNotMatch(app,/functions\/v1\/sync-sheet/);
for(const [filename,skip] of [
  ['payroll_contract_authority_v1.js','lastResult=R;return R;'],
  ['payroll_night_allowance_v1.js','window.__nightPayrollResult=R;return R;']
]){
  const runtime=fs.readFileSync(filename,'utf8');
  assert.ok(runtime.includes('if(LIVE&&Number(CURRENT_STORE_ID)===1){'+skip),'server payroll must never be modified twice: '+filename);
}
// Prevent copying only part of the payroll policy into the Edge runtime.
const checkExact=(start,end)=>{
  const a=app.indexOf(start),b=engine.indexOf(start);
  assert.ok(a>=0&&b>=0,'payroll function missing: '+start);
  const ae=app.indexOf(end,a),be=engine.indexOf(end,b);
  assert.ok(ae>=0&&be>=0,'payroll end missing: '+end);
  assert.equal(engine.slice(b,be+end.length),app.slice(a,ae+end.length),'browser/server source drift: '+start);
};
checkExact('function calcPayroll(emp, monthHours, weeks, ov){','usedOverride:Object.keys(ov).length>0};');
checkExact('let emps=[], events=[];','return {active:payrollEmployees, events, weeks, overrides, rows, totalNet, totalGross};');
assert.match(edge,/mode==="payroll"/);
assert.match(edge,/mode==="parity"/);
assert.match(edge,/mode==="deployment"/);
assert.match(edge,/mode==="cron"/);
assert.match(edge,/sheet_autosync_claim/);
assert.match(edge,/sheet_autosync_finish/);
assert.match(edge,/SHEET_COLUMN_RESIZE_NOT_CONFIRMED/);
assert.match(edge,/SERVER_CLIENT_PARITY_MISMATCH/);
assert.match(pages,/node qa_server_payroll_sheet_contract.mjs/);
assert.match(pages,/node tools\/verify_sheet_deploy.mjs/);
assert.match(script,/node tools\/verify_sheet_deploy.mjs/);
assert.match(deploy,/body\.written!==true/);
assert.match(deploy,/column_resize_applied!==true/);
assert.match(deploy,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
const BE={
  allEmployees:async()=>[],
  eventsWithCorrections:async()=>({events:[],corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[],
  payrollContractWorkdays:async()=>[],
  payrollSubstitutions:async()=>[],
  employmentBundle:async()=>({periods:[],contracts:[]})
};
const payroll=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-09T11:00:00Z')});
const hourly=payroll.calcPayroll({wage:11000,juhyu_hours:0,tax_rate:0.033},12.5,4,{adjust_amount:1000});
assert.equal(hourly.base,137500);
assert.equal(hourly.gross,138500);
assert.equal(hourly.net,133920);
const month=await payroll.computeMonthPayroll('2026-10');
assert.equal(month.rows.length,0);
const sheet=await payroll.buildSheetSyncPayload('2026-10');
assert.ok(Array.isArray(sheet.payroll.rows)&&Array.isArray(sheet.attendance.rows));
console.log('PASS server payroll source parity, real engine golden calculation, and Sheet deployment contracts');
