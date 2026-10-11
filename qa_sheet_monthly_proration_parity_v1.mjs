import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic payroll only; never accesses the production employee, contract or Sheet.
process.env.TZ='UTC';
const employee={id:995109,name:'Monthly salary sheet fixture',is_active:true,store_id:1,
  wage:0,tax_rate:0,juhyu_hours:0};
const standard={id:11,contract_id:11,employee_id:employee.id,
  effective_from:'2025-05-01',effective_to:null,payroll_type:'MONTHLY',
  monthly_salary:2600000,weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};
const stripWon=value=>Number(String(value).replace(/[^0-9-]/g,''));
async function check({contract=standard,periods=[{employee_id:employee.id,
  started_on:'2025-05-01',ended_on:null}]}={}){
  const BE={
    allEmployees:async()=>[employee],
    eventsWithCorrections:async()=>({events:[],corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contract],
    payrollContractWorkdays:async()=>[],
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>periods,
    employmentBundle:async()=>({contracts:[contract],workdays:[],periods})
  };
  const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-25T05:00:00Z')});
  const calculated=await engine.computeMonthPayroll('2026-10');
  const report=await engine.buildSheetSyncPayload('2026-10');
  const pay=calculated.rows[0]?.pay,row=report.payroll.rows[0];
  assert.ok(pay&&row,'Monthly payroll and sheet row must be available');
  const baseIndex=report.payroll.header.indexOf('기본급');
  const grossIndex=report.payroll.header.indexOf('예상 세전급여');
  assert.ok(baseIndex>=0&&grossIndex>=0,'Sheet has earned base and gross headings');
  assert.equal(stripWon(row[baseIndex]),pay.base,
    'Sheet base salary must be the server-calculated, actually earned base');
  assert.equal(stripWon(row[grossIndex]),pay.gross,
    'Sheet gross must match canonical server result');
  return pay;
}
const full=await check();
assert.equal(full.base,2600000,'Full-month contract retains full salary');
const joined=await check({
  contract:{...standard,effective_from:'2026-10-16'},
  periods:[{employee_id:employee.id,started_on:'2026-10-16',ended_on:null}]
});
assert.equal(joined.accruedDays,16);
assert.equal(joined.base,Math.trunc(2600000*16/31));
assert.ok(joined.base<standard.monthly_salary,'Partial month must not display full salary');
const exited=await check({periods:[{
  employee_id:employee.id,started_on:'2025-05-01',ended_on:'2026-10-10'
}]});
assert.equal(exited.accruedDays,10);
assert.equal(exited.base,Math.trunc(2600000*10/31));
console.log('PASS full-month / mid-month hire / departure Sheet base and gross match canonical salary');
