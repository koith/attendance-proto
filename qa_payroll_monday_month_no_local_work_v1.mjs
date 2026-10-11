import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Independent synthetic fixture: no real employee, attendance, approval or sheet writes.
// September 28 (Monday) owns a week whose only shifts occur October 1-2.
const emp={id:99284,name:'Monday ownership fixture',is_active:true,store_id:1,wage:12000,tax_rate:0};
const contract={id:87,contract_id:87,employee_id:emp.id,effective_from:'2026-01-01',effective_to:null,
  payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:960,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',
  night_allowance_enabled:false};
const workdays=[4,5].map(weekday=>({employee_id:emp.id,contract_id:contract.id,
  weekday,contracted_minutes:480,weekly_contracted_minutes:960}));
function eventsOn(dates){
  let id=1;
  return dates.flatMap(date=>[
    {id:id++,employee_id:emp.id,event_type:'IN',event_at:date+'T09:00:00'},
    {id:id++,employee_id:emp.id,event_type:'OUT',event_at:date+'T17:00:00'}
  ]);
}
async function compute(ym,dates,approvals=[]){
  const events=eventsOn(dates);
  const BE={
    allEmployees:async()=>[emp],
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contract],
    payrollContractWorkdays:async()=>workdays,
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>approvals,
    payrollEmploymentPeriods:async()=>[],
    employmentBundle:async()=>({contracts:[contract],periods:[],workdays})
  };
  const report=await createPayrollEngine({BE,storeId:1,now:new Date('2026-10-12T05:00:00Z')}).computeMonthPayroll(ym);
  assert.equal(report.rows.length,1,'Expected synthetic employee in '+ym);
  return report.rows[0];
}
const crossing=['2026-10-01','2026-10-02'];
const sept=await compute('2026-09',crossing);
assert.equal(sept.sec,0,'No September work sessions');
assert.equal(sept.pay.base,0,'No September base wage');
assert.equal(sept.pay.juhyu,38400,'Settled week belongs to September Monday, not October shifts');
assert.equal(sept.pay.gross,38400,'Weekly-only earnings must survive empty-month wage guard');
assert.equal(sept.pay.net,38400);
assert.equal(sept.pay.jweeks,1,'Earned week must not be erased by empty-month guard');
const october=await compute('2026-10',crossing);
assert.equal(october.pay.base,192000,'October work is paid only in October');
assert.equal(october.pay.juhyu,0,'September Monday-owned week must not be paid again in October');
const approved=await compute('2026-09',crossing,[{
  id:10,employee_id:emp.id,week_start:'2026-09-28',calculated_won:38400,
  approved_won:25000,reason:'관리자 확인 완료',approved_by:'fixture-manager',
  approved_at:'2026-10-10T09:00:00Z',decision:'APPROVE'
}]);
assert.equal(approved.pay.juhyu,25000,'Verified adjusted weekly-only amount must persist');
assert.equal(approved.pay.gross,25000);
const unrelated=await compute('2026-09',['2026-10-05','2026-10-06']);
assert.equal(unrelated.pay.juhyu,0,'Next-month Monday-owned week cannot create September pay');
assert.equal(unrelated.pay.gross,0,'No earned weekly/monthly wage => zero pay');
console.log('PASS Monday-owned weekly-only pay across months, adjustment and no duplicate October pay');
