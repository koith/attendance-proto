import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

const employee={id:998801,name:'Contract Monthly Fixture',store_id:1,is_active:true,wage:0,juhyu_hours:0,tax_rate:0,memo:''};
const defaultContract={id:123,contract_id:123,employee_id:employee.id,effective_from:'2025-04-17',effective_to:null,
 payroll_type:'MONTHLY',hourly_wage:null,monthly_salary:2600000,weekly_contracted_minutes:0,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};

async function payroll({contract=defaultContract,periods=[{employee_id:employee.id,started_on:'2025-04-17',ended_on:null}],dates=[]}={}){
 let n=1;const events=dates.flatMap(d=>[
  {id:n++,employee_id:employee.id,event_type:'IN',event_at:d+'T09:00:00'},
  {id:n++,employee_id:employee.id,event_type:'OUT',event_at:d+'T18:00:00'}
 ]);
 const BE={
  allEmployees:async()=>[employee],eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),payrollContracts:async()=>[contract],
  payrollContractWorkdays:async()=>[],payrollSubstitutions:async()=>[],
  payrollWeeklyApprovals:async()=>[],payrollEmploymentPeriods:async()=>periods,
  employmentBundle:async()=>({contracts:[contract],periods,workdays:[]}),
 };
 const R=await createPayrollEngine({BE,storeId:1,now:new Date('2026-10-11T08:00:00Z')}).computeMonthPayroll('2026-10');
 assert.equal(R.rows.length,1);assert.equal(R.rows[0].contractMode,'MONTHLY');
 return R.rows[0].pay;
}
const full=await payroll();
assert.equal(full.base,2600000,'fixed salary is owed by contract, even without attendance records');
assert.equal(full.gross,2600000,'monthly contract must not turn into hourly or daily attendance wages');
assert.equal(full.rate,0,'an explicitly zero withholding rate must remain zero');
assert.equal(full.accruedDays,31);
const fewShifts=await payroll({dates:['2026-10-01','2026-10-04','2026-10-06']});
assert.equal(fewShifts.base,full.base,'number of completed shifts must not change fixed salary');
const partialStart=await payroll({contract:{...defaultContract,effective_from:'2026-10-16'},
 periods:[{employee_id:employee.id,started_on:'2026-10-16',ended_on:null}]});
assert.equal(partialStart.accruedDays,16,'contract begins October 16 inclusive');
assert.equal(partialStart.base,Math.trunc(2600000*16/31),'partial month prorated by contract/employment dates');
const partialEnd=await payroll({periods:[{employee_id:employee.id,started_on:'2025-04-17',ended_on:'2026-10-10'}]});
assert.equal(partialEnd.accruedDays,10,'employee departure October 10 inclusive');
assert.equal(partialEnd.base,Math.trunc(2600000*10/31),'departure prorated without requiring clocked shifts');
console.log('PASS contractual monthly salary, partial hire/exit, zero deduction, and attendance independence');
