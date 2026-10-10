import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

const ym='2026-10';
const employee={id:99123,name:'QA Fixture',is_active:true,wage:12000,tax_rate:0.033,juhyu_hours:0,memo:''};
const events=[
  {id:1,employee_id:employee.id,event_type:'IN',event_at:'2026-10-05T09:00:00'},
  {id:2,employee_id:employee.id,event_type:'OUT',event_at:'2026-10-05T17:00:00'},
  {id:3,employee_id:employee.id,event_type:'IN',event_at:'2026-10-06T09:00:00'},
  {id:4,employee_id:employee.id,event_type:'OUT',event_at:'2026-10-06T17:00:00'},
];
const contract={id:11,contract_id:11,employee_id:employee.id,effective_from:'2026-10-01',effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:960,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0.033,break_provision_mode:'NOT_CONSIDERED',night_allowance_enabled:false};
const workdays=[1,2].map(weekday=>({contract_id:11,employee_id:employee.id,weekday,contracted_minutes:480,weekly_contracted_minutes:960}));
async function calculate(approvals=[]){
 const BE={
  allEmployees:async()=>[employee],eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),payrollContracts:async()=>[contract],
  payrollContractWorkdays:async()=>workdays,payrollSubstitutions:async()=>[],
  payrollWeeklyApprovals:async()=>approvals,payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({periods:[],contracts:[contract],workdays})
 };
 const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-20T03:00:00Z')});
 const report=await engine.computeMonthPayroll(ym);
 assert.equal(report.rows.length,1);
 return report.rows[0].pay;
}
const baseline=await calculate();
assert.equal(baseline.weeklyCalculatedAmounts['2026-10-05'],38400);
assert.equal(baseline.juhyu,38400);
const approval={employee_id:employee.id,week_start:'2026-10-05',calculated_won:38400,approved_won:30000,reason:'근태 정정 확인',approved_by:'qa-manager',approved_at:'2026-10-18T01:00:00Z',id:1};
const corrected=await calculate([approval]);
assert.equal(corrected.weeklyApprovalDelta,-8400);
assert.equal(corrected.juhyu,30000);
assert.equal(corrected.gross,baseline.gross-8400);
const zero=await calculate([{...approval,approved_won:0}]);
assert.equal(zero.juhyu,0);
assert.equal(zero.gross,baseline.gross-38400);
assert.ok(corrected.net<=baseline.net);
const rejection={...approval,id:2,decision:'REJECT',approved_won:0,reason:'지급 반려 기록',approved_at:'2026-10-18T02:00:00Z'};
const reapproval={...approval,id:3,decision:'REAPPROVE',approved_won:35000,reason:'수정된 급여 근거',approved_at:'2026-10-18T03:00:00Z'};
const rejected=await calculate([rejection,approval]);
assert.equal(rejected.juhyu,0,'Latest rejection removes pending weekly allowance');
const reapproved=await calculate([reapproval,rejection,approval]);
assert.equal(reapproved.juhyu,35000,'Latest appended reapproval wins without deleting history');
assert.equal(reapproved.gross,baseline.gross-(38400-35000));

console.log('PASS server payroll computed week, approved adjustment, zero approval and gross/net propagation');
