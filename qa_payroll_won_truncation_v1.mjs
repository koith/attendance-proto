import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Deterministic synthetic wages only: no production attendance, contracts or payroll are changed.
const ym='2026-10';
const employees=[
  {id:991,name:'Monthly test',store_id:1,is_active:true,wage:0,tax_rate:0},
  {id:992,name:'Requesting test',store_id:1,is_active:true,wage:10001,tax_rate:0},
  {id:993,name:'Hourly test',store_id:1,is_active:true,wage:10001,tax_rate:0}
];
const monthly={id:11,contract_id:11,employee_id:991,effective_from:'2026-10-16',effective_to:null,
  payroll_type:'MONTHLY',monthly_salary:1000001,weekly_contracted_minutes:0,break_provision_mode:'IGNORED',
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,night_allowance_enabled:false};
const hourly={id:12,contract_id:12,employee_id:993,effective_from:'2026-10-01',effective_to:null,
  payroll_type:'HOURLY',hourly_wage:10001,weekly_contracted_minutes:902,break_provision_mode:'IGNORED',
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,night_allowance_enabled:false};
const events=[
  {id:1,employee_id:993,event_type:'IN',event_at:'2026-10-05T09:00:00'},
  {id:2,employee_id:993,event_type:'OUT',event_at:'2026-10-05T17:00:00'},
  {id:3,employee_id:993,event_type:'IN',event_at:'2026-10-06T09:00:00'},
  {id:4,employee_id:993,event_type:'OUT',event_at:'2026-10-06T16:02:00'}
];
const BE={
  allEmployees:async()=>employees,
  eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[monthly,hourly],
  payrollContractWorkdays:async()=>[
    {contract_id:12,employee_id:993,weekday:1,contracted_minutes:480,weekly_contracted_minutes:902},
    {contract_id:12,employee_id:993,weekday:2,contracted_minutes:422,weekly_contracted_minutes:902}
  ],
  payrollSubstitutions:async()=>[{id:8,requester_employee_id:992,substitute_employee_id:991,actual_minutes:1,
    work_start:'2026-10-05T09:00:00'}],
  payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({contracts:[monthly,hourly],periods:[],workdays:[]})
};
const report=await createPayrollEngine({BE,storeId:1,now:new Date('2026-10-20T05:00:00Z')}).computeMonthPayroll(ym);
const month=report.rows.find(row=>row.employee_id===991)?.pay;
const week=report.rows.find(row=>row.employee_id===993)?.pay;
assert.ok(month&&week,'Expected both synthetic employee pays: '+JSON.stringify(report.rows.map(r=>({id:r.employee_id,name:r.employee_name,type:r.payrollType,hasPay:!!r.pay,sec:r.sec}))));
assert.equal(month.accruedDays,16);
assert.equal(month.base,Math.trunc(1000001*16/31),'Monthly salary partial-day pay truncates fractional won');
assert.equal(month.substitutePay,166,'One minute at 10,001 won/hour truncates to 166 won, not nearest ten');
assert.equal(month.gross,month.base+166,'Monthly gross includes exact truncated substitution amount');
const holiday=Math.trunc(10001*902/300);
assert.equal(holiday,30069);
assert.equal(week.weeklyCalculatedAmounts['2026-10-05'],holiday);
assert.equal(week.weekly,holiday,'Displayed weekly amount matches won-truncated approved calculation');
assert.equal(week.juhyu,holiday,'Weekly holiday earned exactly once');
assert.equal(report.totalGross,report.rows.reduce((sum,row)=>sum+Number(row.pay?.gross||0),0));
console.log('PASS won-truncation for substitution, partial monthly salary, weekly holiday and gross totals');
