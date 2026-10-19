import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// QA-06: employee departure and later rehire in the same CLOSED month.
// The shipped engine must NOT pay the gap, use attendance-day proxy,
// duplicate overlapping employment rows or rewrite real source records.
process.env.TZ='Asia/Seoul';
const employee={id:900062,store_id:701,name:'QA synthetic rehire',
 is_active:true,wage:0,tax_rate:0,juhyu_hours:0};
const contract={id:72,contract_id:72,employee_id:employee.id,
 effective_from:'2026-01-01',effective_to:null,payroll_type:'MONTHLY',
 hourly_wage:0,monthly_salary:3000000,weekly_contracted_minutes:0,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
 break_provision_mode:'IGNORED',night_allowance_enabled:false};
const first={employee_id:employee.id,started_on:'2026-09-01',ended_on:'2026-09-10'};
const second={employee_id:employee.id,started_on:'2026-09-20',ended_on:null};
async function calculate(periods){
 const BE={
  allEmployees:async()=>[employee],
  eventsWithCorrections:async()=>({events:[],corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],
  payrollContractWorkdays:async()=>[],payrollSubstitutions:async()=>[],
  payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>periods,
  employmentBundle:async()=>({contracts:[contract],periods,workdays:[]})
 };
 const report=await createPayrollEngine({BE,storeId:701,
  now:new Date('2026-10-19T10:00:00Z')}).computeMonthPayroll('2026-09');
 assert.equal(report.rows.length,1);
 assert.ok(report.rows[0].pay,'rehired employee must have scoped salary');
 return report.rows[0].pay;
}
const joined=await calculate([first,second]);
assert.equal(joined.daysInMonth,30);
assert.equal(joined.accruedDays,21,'10 first-hire days + 11 rehire days, 9 unpaid gap days');
assert.equal(joined.base,2100000,'3m salary / 30 * 21; not full month');
assert.equal(joined.gross,2100000);
const onlyFirst=await calculate([first]);
assert.equal(onlyFirst.accruedDays,10,'departure excludes all later dates');
assert.equal(onlyFirst.base,1000000);
const onlySecond=await calculate([second]);
assert.equal(onlySecond.accruedDays,11,'rehire starts on effective employment date');
assert.equal(onlySecond.base,1100000);
const duplicated=await calculate([first,{...second,started_on:'2026-09-08'}]);
assert.equal(duplicated.accruedDays,30,
 'overlapping employment history cannot duplicate daily salary');
assert.equal(duplicated.base,3000000,'overlap of source periods must be single counted');
assert.equal(joined.base,onlyFirst.base+onlySecond.base,
 'both verified nonoverlapping terms are reconciled without gap wages');
assert.equal(joined.juhyu,0,'monthly payroll cannot add invented hourly weekly allowance');
console.log('PASS QA-06 real payroll engine: hire → departure → unpaid gap → rehire, monthly proration, overlap no double-pay');
