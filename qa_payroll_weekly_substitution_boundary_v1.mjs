import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// September-owned Monday-Sunday week ends in October. These are synthetic
// sessions and substitutions; real payroll source rows are never modified.
const source=fs.readFileSync('supabase/migrations/20261011220000_weekly_substitution_boundary_source.sql','utf8');
const engineSrc=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.match(source,/r\.work_start>=v_begin/);
assert.match(source,/r\.work_start<v_end/);
assert.doesNotMatch(source,/r\.work_start>=v_first::timestamp/);
assert.match(engineSrc,/String\(x\.work_start\|\|''\)\.slice\(0,7\)===ym/);
const emp=[
  {id:901,name:'Schedule fixture',is_active:true,store_id:1,wage:10000,tax_rate:0},
  {id:902,name:'Salaried fixture',is_active:true,store_id:1,wage:0,tax_rate:0}
];
const hourly={contract_id:31,id:31,employee_id:901,payroll_type:'HOURLY',hourly_wage:10000,
  weekly_contracted_minutes:960,effective_from:'2026-01-01',effective_to:null,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED'};
const monthly={contract_id:32,id:32,employee_id:902,payroll_type:'MONTHLY',monthly_salary:150001,
  effective_from:'2026-01-01',effective_to:null,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED'};
const events=[
  {id:1,employee_id:901,event_type:'IN',event_at:'2026-09-28T09:00:00'},
  {id:2,employee_id:901,event_type:'OUT',event_at:'2026-09-28T17:00:00'},
  {id:3,employee_id:901,event_type:'IN',event_at:'2026-10-02T09:00:00'},
  {id:4,employee_id:901,event_type:'OUT',event_at:'2026-10-02T17:00:00'}
];
const octoberSub={id:501,requester_employee_id:901,substitute_employee_id:902,
  actual_minutes:1,work_start:'2026-10-02T09:00:00',work_end:'2026-10-02T09:01:00',status:'COMPLETED'};
async function calc(substitutions){
  const contracts=[hourly,monthly];
  const BE={
    allEmployees:async()=>emp,
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>contracts,
    payrollContractWorkdays:async()=>[
      {employee_id:901,contract_id:31,weekday:1,contracted_minutes:480,weekly_contracted_minutes:960},
      {employee_id:901,contract_id:31,weekday:5,contracted_minutes:480,weekly_contracted_minutes:960}
    ],
    payrollSubstitutions:async()=>substitutions,
    payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>[],
    employmentBundle:async id=>({periods:[],contracts:contracts.filter(c=>c.employee_id===id),workdays:[]})
  };
  return createPayrollEngine({BE,storeId:1,now:new Date('2026-10-12T05:00:00Z')}).computeMonthPayroll('2026-09');
}
const normal=await calc([]);
const flagged=await calc([octoberSub]);
const find=(report,id)=>report.rows.find(row=>row.employee_id===id);
assert.equal(find(normal,901).pay.juhyu,32000,'September-owned cross-month week earns its own allowance');
assert.equal(find(flagged,901).pay.juhyu,0,'October substitute requires review before September weekly allowance');
assert.match(find(flagged,901).pay.weeklyReviewComments.join(' '),/대타·교대/);
assert.equal(find(flagged,902).pay.substitutePay,0,'October substitute work must not add wages to September');
assert.equal(find(flagged,902).pay.gross,150001,'September fixed salary must not receive October work pay');
console.log('PASS cross-month substitution weekly review without previous-month payroll duplication');
