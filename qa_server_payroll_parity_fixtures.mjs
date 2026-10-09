import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

const ym='2026-10';
const employee={id:42,name:'Regression Employee',is_active:true,wage:12000,tax_rate:0.033,juhyu_hours:0,memo:''};
const events=[
  {id:1,employee_id:42,event_type:'IN',event_at:'2026-10-05T09:00:00'},
  {id:2,employee_id:42,event_type:'OUT',event_at:'2026-10-05T14:00:00'},
  {id:3,employee_id:42,event_type:'IN',event_at:'2026-10-06T22:00:00'},
  {id:4,employee_id:42,event_type:'OUT',event_at:'2026-10-07T02:00:00'}
];
const contract={
  id:22,employee_id:42,effective_from:'2026-10-01',effective_to:null,
  payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,
  weekly_contracted_minutes:600,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0.033,
  night_allowance_enabled:true,night_allowance_mode:'RATE',night_allowance_value:50,
  night_allowance_start:'22:00',night_allowance_end:'06:00'
};
async function scenario(mode){
  const c={...contract,break_provision_mode:mode,break_time_provided:mode==='PROVIDED'};
  const BE={
    allEmployees:async()=>[employee],
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[c],
    payrollContractWorkdays:async()=>[{employee_id:42,weekly_contracted_minutes:600}],
    payrollSubstitutions:async()=>[],
    employmentBundle:async()=>({periods:[],contracts:[c],workdays:[]})
  };
  const e=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-09T11:00:00Z')});
  const R=await e.computeMonthPayroll(ym);
  assert.equal(R.rows.length,1);
  const row=R.rows[0];
  assert.equal(row.contractMode,'CONTRACT');
  assert.equal(row.sessions.length,2);
  assert.equal(row.sec,9*3600);
  assert.equal(row.pay.net,Math.floor(row.pay.gross*(1-row.pay.rate)/10)*10);
  assert.equal(R.totalGross,row.pay.gross);
  assert.equal(R.totalNet,row.pay.net);
  const sheet=await e.buildSheetSyncPayload(ym);
  assert.equal(sheet.payroll.rows.length,1);
  assert.equal(sheet.attendance.rows.length,2);
  return row;
}
const provided=await scenario('PROVIDED');
const unpaid=await scenario('NOT_PROVIDED');
const ignored=await scenario('NOT_CONSIDERED');
assert.equal(provided.breakDeductSeconds,1800);
assert.equal(provided.breakBonusMinutes,0);
assert.equal(unpaid.breakDeductSeconds,0);
assert.equal(unpaid.breakBonusMinutes,30);
assert.equal(ignored.breakDeductSeconds,0);
assert.equal(ignored.breakBonusMinutes,0);
assert.equal(unpaid.pay.gross-ignored.pay.gross,6000);
assert.equal(ignored.pay.gross-provided.pay.gross,6000);
assert.equal(provided.pay.night,unpaid.pay.night);
assert.equal(unpaid.pay.night,ignored.pay.night);
console.log('PASS server payroll golden fixture: completed sessions, 3-way breaks, premiums, tax, Sheet parity');
