import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPayrollEngine} from './server_payroll_engine.mjs';
const html=fs.readFileSync('index.html','utf8'),engine=fs.readFileSync('server_payroll_engine.mjs','utf8');
for(const start of ['function fromIso(','function applyCorrections(','function pairEvents(','function idOrder(','function calcPayroll(','function isHiddenInhaTestEmployee(','async function computeMonthPayroll(','async function buildSheetSyncPayload(']){
  const i=html.indexOf(start),end=html.indexOf('\n}',i)+2;
  assert(i>=0&&end>i,'source missing '+start);
  assert(engine.includes(html.slice(i,end)),'server engine diverged from browser source: '+start);
}
const emp=[{id:1,name:'김가람',is_active:true,wage:10000,tax_rate:0.033,store_id:1},{id:2,name:'월급 직원',is_active:true,wage:0,tax_rate:0.033,store_id:1}];
const contracts=[{employee_id:1,payroll_type:'HOURLY',hourly_wage:10000,weekly_contracted_minutes:0,break_time_provided:false,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0.033,night_allowance_enabled:true,night_allowance_mode:'RATE',night_allowance_value:50,night_allowance_start:'22:00',night_allowance_end:'06:00'},
{employee_id:2,payroll_type:'MONTHLY',monthly_salary:3100000,weekly_contracted_minutes:0,break_time_provided:true,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0.033,night_allowance_enabled:false}];
const events=[{id:1,employee_id:1,event_type:'IN',event_at:'2026-10-01T18:00:00'},{id:2,employee_id:1,event_type:'OUT',event_at:'2026-10-01T23:00:00'},{id:3,employee_id:2,event_type:'IN',event_at:'2026-10-02T09:00:00'},{id:4,employee_id:2,event_type:'OUT',event_at:'2026-10-02T18:00:00'}];
const bundle=id=>({contracts:[{...contracts.find(x=>x.employee_id===id),effective_from:'2026-01-01',effective_to:null}],periods:[],workdays:[]});
const BE={allEmployees:async()=>emp,eventsWithCorrections:async()=>({events,corrections:[]}),payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),payrollContracts:async()=>contracts,payrollContractWorkdays:async()=>[],payrollSubstitutions:async()=>[],employmentBundle:async id=>bundle(id)};
const e=createPayrollEngine({BE,now:new Date('2026-10-09T11:00:00Z'),storeId:1,storeName:'인하대학교점'});
const r=await e.computeMonthPayroll('2026-10');
assert.equal(r.rows.length,2);
const hourly=r.rows.find(x=>x.employee_id===1),monthly=r.rows.find(x=>x.employee_id===2);
assert.equal(hourly.pay.base,50000);
assert.equal(hourly.pay.breakCompPay,5000);
assert.equal(hourly.pay.nightAllowance,5000);
assert.equal(hourly.pay.night,5000);
assert.equal(hourly.pay.gross,65000);
assert.equal(hourly.pay.net,62850);
assert.equal(monthly.pay.accruedDays,1);
assert.equal(monthly.pay.base,100000);
assert.equal(monthly.pay.gross,100000);
assert.equal(r.totalGross,165000);
const payload=await e.buildSheetSyncPayload('2026-10');
assert.equal(payload.store_key,'1');
assert.ok(payload.attendance.rows.length>=2);
assert.equal(payload.payroll.rows.length,2);
const corrected=e.applyCorrections(events,[{id:9,employee_id:1,event_id:2,action:'EDIT_TIME',new_event_at:'2026-10-01T23:30:00',created_at:'2026-10-02T00:00:00'}]);
assert.equal(corrected.find(x=>x.id===2).event_at,'2026-10-01T23:30:00');
console.log('PASS server payroll arithmetic, monthly accrual, break, night, correction, sheet projection and browser source parity');

/* Execute the exact browser code in its own JS context, with the same BE fixture,
   and compare the unwrapped payroll numbers and per-session state to server replay.
   This is an independent execution check, not an expected-value assertion only. */
const exactBlock=(start)=>{
  const i=html.indexOf(start),end=html.indexOf('\n}',i)+2;
  assert(i>=0&&end>i,start);
  return html.slice(i,end);
};
const exactLine=(start)=>{
  const i=html.indexOf(start),end=html.indexOf('\n',i);
  assert(i>=0&&end>i,start);
  return html.slice(i,end);
};
const browserSource=[
  exactBlock('function fromIso('),exactBlock('function applyCorrections('),
  exactBlock('function pairEvents('),exactBlock('function idOrder('),
  exactBlock('function isHiddenInhaTestEmployee('),
  exactLine('function secToHours('),exactBlock('function xround('),
  exactLine('function xrounddown('),exactBlock('function calcPayroll('),
  exactBlock('async function computeMonthPayroll('),
  'globalThis.browserPayroll=computeMonthPayroll;'
].join('\n');
const sandbox={
  BE,LIVE:true,CURRENT_STORE_ID:1,
  kstNow:()=>new Date(Date.UTC(2026,9,9,20,0,0)),
  weeksInMonth:()=>1,console,won:x=>String(x)+'원'
};
vm.createContext(sandbox);
vm.runInContext(browserSource,sandbox);
const browserResult=await sandbox.browserPayroll('2026-10');
const baseResult=await e.browserBasePayroll('2026-10');
const comparison=(R)=>({
  rows:R.rows.map(r=>({
    id:r.employee_id,hours:r.hours,sec:r.sec,nightMinutes:r.nightMinutes,
    breakBonusMinutes:r.breakBonusMinutes,breakDeductSeconds:r.breakDeductSeconds,
    pay:r.pay,sessions:r.sessions.map(s=>({status:s.status,sec:s.sec,in:s.in?.toISOString(),out:s.out?.toISOString()}))
  })),
  totalGross:R.totalGross,totalNet:R.totalNet,weeks:R.weeks
});
assert.deepEqual(JSON.parse(JSON.stringify(comparison(baseResult))),JSON.parse(JSON.stringify(comparison(browserResult))));
console.log('PASS independent VM browser-vs-server payroll replay arithmetic and sessions');
