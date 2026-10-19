import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// QA-06: deterministic KST clock variance from REAL payroll/attendance engine.
// A lateness or early-out label requires a verified roster; we assert only
// source-backed worked minutes and resulting pay, not invented disciplinary status.
process.env.TZ='Asia/Seoul';
const employee={id:900061,store_id:701,name:'QA synthetic clock shift',
 is_active:true,wage:12000,tax_rate:0,juhyu_hours:0};
const contract={id:71,contract_id:71,employee_id:employee.id,
 effective_from:'2026-01-01',effective_to:null,payroll_type:'HOURLY',
 hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:0,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
 break_provision_mode:'IGNORED',night_allowance_enabled:false};
const eventPair=(start,end)=>[
 {id:1,employee_id:employee.id,event_type:'IN',event_at:'2026-09-15T'+start+':00'},
 {id:2,employee_id:employee.id,event_type:'OUT',event_at:'2026-09-15T'+end+':00'}
];
async function measure(start,end){
 const events=eventPair(start,end);
 const BE={
  allEmployees:async()=>[employee],
  eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>[],
  payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({contracts:[contract],periods:[],workdays:[]})
 };
 const report=await createPayrollEngine({BE,storeId:701,
  now:new Date('2026-10-19T10:00:00Z')}).computeMonthPayroll('2026-09');
 assert.equal(report.rows.length,1);
 const row=report.rows[0];assert.ok(row.pay,'payroll must be calculated');
 return {seconds:row.sec,base:row.pay.base,gross:row.pay.gross,weekly:row.pay.juhyu};
}
const regular=await measure('09:00','17:00');
const late=await measure('09:25','17:00');
const early=await measure('09:00','16:35');
const combined=await measure('09:25','16:35');
assert.equal(regular.seconds,480*60);
assert.equal(regular.base,96000);
assert.equal(late.seconds,455*60,'25 minutes late changes source worked time');
assert.equal(late.base,91000,'25-minute source delta changes earned hourly wage');
assert.equal(early.seconds,455*60,'25 minutes early departure changes worked time');
assert.equal(early.base,91000);
assert.equal(combined.seconds,430*60);
assert.equal(combined.base,86000,'two deltas deduct precisely 50 worked minutes');
assert.ok([regular,late,early,combined].every(x=>x.weekly===0),
 'no contracted weekly holiday payment may be invented');
assert.ok([regular,late,early,combined].every(x=>x.base===x.gross),
 'no unapproved wage adjustment or break allowance');
console.log('PASS QA-06 real payroll engine: planned comparison fixture, late/early actual minutes and earned hourly pay; no synthetic disciplinary event');
