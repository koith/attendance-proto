import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic fixture only. A deactivated employee's last worked week is owned
// by September Monday 28, though both shifts occur October 1 and 2.
process.env.TZ='UTC';
const employee={id:998264,name:'Inactive cross-month fixture',store_id:1,is_active:false,
  wage:12000,juhyu_hours:0,tax_rate:0};
const contract={id:79,contract_id:79,employee_id:employee.id,
  effective_from:'2026-01-01',effective_to:'2026-10-02',
  payroll_type:'HOURLY',hourly_wage:12000,weekly_contracted_minutes:960,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
  break_provision_mode:'IGNORED',night_allowance_enabled:false};
const workdays=[4,5].map(weekday=>({contract_id:79,employee_id:employee.id,
  weekday,contracted_minutes:480,weekly_contracted_minutes:960}));
const periods=[{employee_id:employee.id,started_on:'2026-01-01',ended_on:'2026-10-02'}];
function eventsFor(dates){
  let i=0;
  return dates.flatMap(day=>[
    {id:++i,employee_id:employee.id,event_type:'IN',event_at:day+'T09:00:00'},
    {id:++i,employee_id:employee.id,event_type:'OUT',event_at:day+'T17:00:00'}]);
}
function approved(amount){
  return {id:100,store_id:1,employee_id:employee.id,week_start:'2026-09-28',
    calculated_won:0,approved_won:amount,decision:'APPROVE',
    reason:'퇴사 주 추가 지급 승인',approved_by:'fixture-admin',
    approved_at:'2026-10-10T10:00:00Z'};
}
async function calculate({dates=[],approvals=[],active=false,ym='2026-09'}={}){
  const emp={...employee,is_active:active},events=eventsFor(dates);
  const BE={
    allEmployees:async()=>[emp],
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contract],
    payrollContractWorkdays:async()=>workdays,
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>approvals,
    payrollEmploymentPeriods:async()=>periods,
    employmentBundle:async()=>({contracts:[contract],workdays,periods})
  };
  return createPayrollEngine({BE,storeId:1,now:new Date('2026-10-12T05:00:00Z')})
    .computeMonthPayroll(ym);
}
const days=['2026-10-01','2026-10-02'];
const reviewed=await calculate({dates:days});
assert.equal(reviewed.rows.length,1,'Inactive worker must survive when an owned week crosses month-end');
assert.equal(reviewed.rows[0].sec,0,'All completed shifts occurred in October');
assert.equal(reviewed.rows[0].pay.juhyu,0,'Departure week cannot auto-award without review');
assert.match(reviewed.rows[0].pay.weeklyReviewComments.join(' '),/퇴사/);
const confirmed=await calculate({dates:days,approvals:[approved(25000)]});
assert.equal(confirmed.rows.length,1);
assert.equal(confirmed.rows[0].pay.base,0,'Do not move October hourly wages into September');
assert.equal(confirmed.rows[0].pay.juhyu,25000,'Prior-month manager approval must survive deactivation');
assert.equal(confirmed.rows[0].pay.gross,25000,'Approved weekly-only earnings must be in gross');
assert.equal(confirmed.totalGross,25000);
const approvalOnly=await calculate({approvals:[approved(25000)]});
assert.equal(approvalOnly.rows.length,1,'Explicitly approved history survives absent current attendance');
assert.equal(approvalOnly.rows[0].pay.juhyu,25000);
const unrelated=await calculate({dates:['2026-10-05','2026-10-06']});
assert.equal(unrelated.rows.length,0,'Unrelated October-owned timecards cannot reopen September payroll');
const empty=await calculate();
assert.equal(empty.rows.length,0,'Inactive employees without related weeks or approvals remain excluded');
console.log('PASS inactive former employee cross-month weekly review, approved-only pay and unrelated-week isolation');
