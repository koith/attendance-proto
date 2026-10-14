import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic payroll-only scenarios: no live employee, payroll close or Google Sheet writes.
process.env.TZ='UTC';
const emp={id:991014,name:'Synthetic monthly salary',store_id:1,is_active:true,
  wage:0,juhyu_hours:0,tax_rate:0};
const monthly=salary=>({
  id:11,contract_id:11,employee_id:emp.id,effective_from:'2025-01-01',
  effective_to:null,payroll_type:'MONTHLY',monthly_salary:salary,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
  break_provision_mode:'IGNORED',night_allowance_enabled:false
});
const baseline=monthly(2600000);
const period=(start,end=null)=>[{employee_id:emp.id,started_on:start,ended_on:end}];
const defaultPeriods=period('2025-01-01');
const value=(salary,days,total=31)=>Math.trunc(salary*days/total);
async function payroll({when='2026-10-14T12:00:00Z',ym='2026-10',
   contracts=[baseline],periods=defaultPeriods,shifts=[]}={}){
  let id=1;const events=shifts.flatMap(day=>[
    {id:id++,employee_id:emp.id,event_type:'IN',event_at:day+'T09:00:00'},
    {id:id++,employee_id:emp.id,event_type:'OUT',event_at:day+'T18:00:00'}
  ]);
  const BE={
    allEmployees:async()=>[emp],
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contracts.at(-1)],
    payrollContractWorkdays:async()=>[],
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>periods,
    employmentBundle:async()=>({contracts,periods,workdays:[]})
  };
  const engine=createPayrollEngine({BE,storeId:1,now:new Date(when)});
  const report=await engine.computeMonthPayroll(ym);
  const row=report.rows[0];
  return {engine,report,row,pay:row?.pay};
}
const current=await payroll();
assert.equal(current.pay.accruedDays,14,'October 14 KST: 14 accrued calendar employment days');
assert.equal(current.pay.daysInMonth,31);
assert.equal(current.pay.monthlySalary,2600000,'Contract monthly amount must remain unchanged');
assert.equal(current.pay.base,1174193,'2,600,000 * 14 / 31, discard fractions of won');
assert.equal(current.pay.gross,1174193,'Displayed gross must be accrued, not full contracted month');
assert.equal(current.report.totalGross,1174193,'Store total must use accrued gross');
assert.equal((await payroll({shifts:['2026-10-01','2026-10-05','2026-10-10']})).pay.base,
  current.pay.base,'3 completed shifts do not reduce 14 employed calendar days');
const beforeMidnight=await payroll({when:'2026-10-13T14:59:59Z'});
const afterMidnight=await payroll({when:'2026-10-13T15:00:00Z'});
assert.equal(beforeMidnight.pay.accruedDays,13,'Seoul 23:59 remains October 13');
assert.equal(afterMidnight.pay.accruedDays,14,'Seoul 00:00 advances to October 14');
assert.equal((await payroll({periods:period('2026-10-10')})).pay.base,value(2600000,5),
  'New hire October 10 earns only October 10-14');
assert.equal((await payroll({periods:period('2025-01-01','2026-10-10')})).pay.base,value(2600000,10),
  'October 10 departure cannot accrue after termination');
assert.equal((await payroll({periods:period('2026-10-16')})).pay.base,0,
  'Future hire must not accrue salary before employment begins');
assert.equal((await payroll({ym:'2026-09'})).pay.base,2600000,
  'Prior complete months keep full earned contractual month');
assert.equal((await payroll({ym:'2026-11'})).pay.base,0,
  'Next month cannot be prepaid');
const revision=[
  {...baseline,effective_to:'2026-10-09'},
  {...baseline,id:12,contract_id:12,effective_from:'2026-10-10',
    monthly_salary:3000000}
];
const revised=await payroll({contracts:revision});
assert.equal(revised.row.contractMode,'MONTHLY');
assert.equal(revised.pay.base,value(2600000,9)+value(3000000,5),
  'October 14 accrues 9 old-contract days and 5 new-contract days');
assert.equal(revised.pay.accruedDays,14);
assert.equal(revised.pay.monthlySegments.length,2);
assert.equal((await payroll({when:'2026-11-01T00:00:00Z'})).pay.base,2600000,
  'After October ends, all 31 eligible days count');
const ui=fs.readFileSync('index.html','utf8');
assert.match(ui,/const APP_VERSION="v0\\.272"/);
assert.match(ui,/재직 인정 \\$\\{Number\\(pay\\?\\.accruedDays\\|\\|0\\)\\}/,
  'Monthly detail must show employment days rather than attendance count');
assert.doesNotMatch(ui,/인정일 \\$\\{completedDays\\}/,
  'Old attendance-count salary badge must be removed');
assert.match(ui,/SERVER_PAYROLL_ENGINE_OUTDATED/,
  'Missing or outdated canonical payroll engine must not silently present false salary');
const canonical=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const native=fs.readFileSync('edge-release/supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.equal(native,canonical,'Native Supabase deployment and canonical payroll engine must be identical');
const browser=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
const segment=src=>src.match(/  function monthlyContractSegments\\([\\s\\S]*?\\n  \\}/)?.[0];
assert.ok(segment(browser));
assert.equal(segment(browser),segment(canonical),'Browser and Edge segment accrual rules must match');
assert.match(browser,/day<=payableDays/);
console.log('PASS October 14 employment accrual, KST midnight, hire/exit, historical/future, contract revision, UI and native Edge parity');
