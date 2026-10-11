import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
import {approvedWeeklyAdjustment} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';
const sql=fs.readFileSync('supabase/migrations/20261010234500_weekly_append_only_decisions.sql','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const ui=fs.readFileSync('index.html','utf8');
const engine=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.match(sql,/SECURITY DEFINER SET search_path TO 'public','pg_temp'/);
assert.match(sql,/SERVICE_ONLY/);
assert.match(sql,/EMPLOYEE_STORE_MISMATCH/);
assert.match(sql,/WEEK_NOT_CLOSED/);
assert.match(sql,/PAYROLL_ALREADY_CLOSED/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/p_decision NOT IN \('APPROVE','REJECT'\)/);
assert.match(sql,/p_decision='REJECT' AND p_approved_won<>0/);
assert.match(sql,/TO service_role/);
assert.match(edge,/client\.rpc\("approve_payroll_weekly_decision_internal"/);
assert.match(edge,/\.order\("approved_at",\{ascending:false\}\)\.order\("id",\{ascending:false\}\)/);
assert.match(edge,/select\("employee_id,week_start,calculated_won,approved_won,decision/);
assert.match(ui,/id="weeklyDecision"/);
assert.match(ui,/mode:"weekly_decide"/);
assert.match(ui,/decision==="REJECT"\?0/);
assert.match(ui,/해당 주 자동계산 금액/);
assert.match(engine,/approvedWeeks\.has\(a\.week_start\)/);
// Same week, 3 immutable rows, returned newest first: only latest decision applies.
const records=[
  {id:3,week_start:'2026-09-07',approved_won:35000,decision:'APPROVE',approved_at:'2026-10-10T20:00:00Z',reason:'수정승인',approved_by:'hq'},
  {id:2,week_start:'2026-09-07',approved_won:0,decision:'REJECT',approved_at:'2026-10-10T19:00:00Z',reason:'반려사유',approved_by:'hq'},
  {id:1,week_start:'2026-09-07',approved_won:70000,decision:'APPROVE',approved_at:'2026-10-10T18:00:00Z',reason:'최초승인',approved_by:'hq'}
];
const before=70000,first=records[0];
const after=approvedWeeklyAdjustment(before,first.approved_won,first.reason,first.approved_by,first.approved_at).amount;
assert.equal(after,35000);
assert.equal(approvedWeeklyAdjustment(before,records[1].approved_won,records[1].reason,records[1].approved_by,records[1].approved_at).amount,0);
assert.equal(records.length,3,'Audit must retain all decisions');
// Real server payroll calculation: append-only decisions are supplied in the
// same descending order as the production read. Never alter actual approval rows.
const payrollEmployee={id:998402,name:'Weekly audit fixture',is_active:true,store_id:1,wage:12000,tax_rate:0};
const contract={id:88,contract_id:88,employee_id:payrollEmployee.id,
  effective_from:'2026-01-01',effective_to:null,payroll_type:'HOURLY',
  hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:960,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
  break_provision_mode:'IGNORED',night_allowance_enabled:false};
const workdays=[4,5].map(weekday=>({employee_id:payrollEmployee.id,
  contract_id:88,weekday,contracted_minutes:480,weekly_contracted_minutes:960}));
const attendance=['2026-10-01','2026-10-02'].flatMap((day,i)=>[
  {id:i*2+1,employee_id:payrollEmployee.id,event_type:'IN',event_at:day+'T09:00:00'},
  {id:i*2+2,employee_id:payrollEmployee.id,event_type:'OUT',event_at:day+'T17:00:00'}]);
const audit=(id,decision,won)=>({id,employee_id:payrollEmployee.id,
  week_start:'2026-09-28',calculated_won:38400,approved_won:won,
  decision,reason:'fixture audit #'+id,approved_by:'fixture-manager',
  approved_at:'2026-10-10T'+String(id).padStart(2,'0')+':00:00Z'});
async function authoritative(ym,decisions=[]){
  const BE={
    allEmployees:async()=>[payrollEmployee],
    eventsWithCorrections:async()=>({events:attendance,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contract],
    payrollContractWorkdays:async()=>workdays,
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>decisions,
    payrollEmploymentPeriods:async()=>[],
    employmentBundle:async()=>({contracts:[contract],workdays,periods:[]})
  };
  const report=await createPayrollEngine({BE,storeId:1,
    now:new Date('2026-10-12T05:00:00Z')}).computeMonthPayroll(ym);
  assert.equal(report.rows.length,1);
  return report.rows[0].pay;
}
const normal=await authoritative('2026-09');
assert.equal(normal.juhyu,38400);
const initiallyApproved=await authoritative('2026-09',[audit(1,'APPROVE',35000)]);
assert.equal(initiallyApproved.juhyu,35000);
const rejected=await authoritative('2026-09',[audit(2,'REJECT',0),audit(1,'APPROVE',35000)]);
assert.equal(rejected.juhyu,0,'0-won rejection must overwrite original weekly amount');
assert.equal(rejected.gross,0,'Rejected weekly-only month is not payable');
const reapproved=await authoritative('2026-09',[
  audit(3,'REAPPROVE',25000),audit(2,'REJECT',0),audit(1,'APPROVE',35000)]);
assert.equal(reapproved.juhyu,25000,'Most recent immutable decision alone must determine allowance');
assert.equal(reapproved.gross,25000);
assert.equal(reapproved.weeklyApprovalDelta,25000-38400);
assert.equal(reapproved.weeklyReviewComments.filter(c=>c.includes('관리자 승인')).length,1,
  'Only latest decision contributes to the current calculation');
const october=await authoritative('2026-10',[
  audit(3,'REAPPROVE',25000),audit(2,'REJECT',0),audit(1,'APPROVE',35000)]);
assert.equal(october.juhyu,0,'September Monday-owned approval cannot duplicate in October');
assert.equal(october.base,192000,'October hourly wages remain in October');
console.log('PASS real engine append-only approve -> zero-won reject -> reapprove and monthly isolation');

console.log('PASS append-only weekly approval -> rejection -> reapproval latest-wins, scoped & closed-week guard');
