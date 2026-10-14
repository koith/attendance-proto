import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
process.env.TZ='UTC';

const monthly={id:98701,name:'Monthly QA',is_active:true,wage:0,tax_rate:0};
const hourly={id:98702,name:'Hourly QA',is_active:true,wage:12000,tax_rate:0};
const contracts=[
 {id:11,contract_id:11,employee_id:monthly.id,effective_from:'2026-01-01',
  payroll_type:'MONTHLY',monthly_salary:2600000,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false},
 {id:12,contract_id:12,employee_id:hourly.id,effective_from:'2026-01-01',
  payroll_type:'HOURLY',hourly_wage:12000,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false},
];
const futureEvents=[
 {id:1,employee_id:hourly.id,event_type:'IN',event_at:'2026-11-05T09:00:00'},
 {id:2,employee_id:hourly.id,event_type:'OUT',event_at:'2026-11-05T17:00:00'},
];
async function report(ym,now=new Date('2026-10-11T08:00:00Z')){
 const BE={
  allEmployees:async()=>[monthly,hourly],
  eventsWithCorrections:async()=>({events:futureEvents,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[{employee_id:monthly.id,adjust_amount:5000}]}),
  payrollContracts:async()=>contracts,
  payrollContractWorkdays:async()=>[],payrollSubstitutions:async()=>[],
  payrollWeeklyApprovals:async()=>[],payrollEmploymentPeriods:async()=>[],
  employmentBundle:async id=>({contracts:contracts.filter(c=>c.employee_id===id),workdays:[],periods:[]}),
 };
 return createPayrollEngine({BE,storeId:1,now}).computeMonthPayroll(ym);
}
const current=await report('2026-10');
const currentMonthly=current.rows.find(r=>r.employee_id===monthly.id).pay;
assert.equal(currentMonthly.base,Math.trunc(2600000*11/31),'current month accrues through October 11 KST, not October 31');
assert.equal(currentMonthly.gross,Math.trunc(2600000*11/31)+5000,'current earned salary includes approved adjustments only');
// Regression: current-month fixed salary is based on KST calendar days,
// regardless of how few time punches are recorded, at both ends of the day.
for(const iso of ['2026-10-13T15:10:00Z','2026-10-14T14:50:00Z']){
 const snapshot=await report('2026-10',new Date(iso));
 const monthlyPay=snapshot.rows.find(r=>r.employee_id===monthly.id).pay;
 assert.equal(monthlyPay.accruedDays,14,'KST October 14 counts exactly 14 contract days');
 assert.equal(monthlyPay.base,1174193,'2,600,000 won accrued for 14/31 calendar days');
 assert.equal(monthlyPay.gross,1179193,'approved 5,000 won adjustment remains separate from fixed salary');
}
const oct15=await report('2026-10',new Date('2026-10-14T15:00:00Z'));
assert.equal(oct15.rows.find(r=>r.employee_id===monthly.id).pay.accruedDays,15,
 'KST October 15 midnight starts the next fixed-salary accrual day');
const future=await report('2026-11');
assert.equal(future.totalGross,0,'future payroll cannot be pre-accrued');
assert.equal(future.totalNet,0,'future payroll cannot be paid out');
for(const row of future.rows){
 const p=row.pay;
 assert.ok(p,'future contract remains visible for payroll configuration');
 for(const field of ['base','gross','net','juhyu','weekly','adjust','nightAllowance','substitutePay','breakCompPay']){
  assert.equal(Number(p[field]||0),0,field+' cannot be recognized before the month starts');
 }
}
assert.equal(future.rows.find(r=>r.employee_id===monthly.id).pay.accruedDays,0);
assert.equal(future.rows.find(r=>r.employee_id===hourly.id).sec,8*3600,'future attendance rows are preserved, only their pay is gated');
const nextMonth=await report('2026-11',new Date('2026-11-11T08:00:00Z'));
assert.equal(nextMonth.rows.find(r=>r.employee_id===monthly.id).pay.base,Math.trunc(2600000*11/30),
 'November monthly salary accrues through November 11 KST, not the month end');
assert.equal(nextMonth.rows.find(r=>r.employee_id===hourly.id).pay.base,96000,
 'completed hourly shifts become payable in the selected current month');
const browser=fs.readFileSync('payroll_night_allowance_v1.js','utf8');
assert.match(browser,/if\(p&&ym>currentPayrollMonth\)/,
 'the final browser wrapper also blocks future pay');
console.log('PASS zero future-month payroll, current-month elapsed salary, hourly events, adjustments and browser parity');
