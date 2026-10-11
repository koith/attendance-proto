import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic-only salaried termination fixture: no production employee,
// timecard, payroll close, approval or Sheet values are read or written.
process.env.TZ='UTC';
const employee={id:990731,name:'Former salaried fixture',store_id:1,is_active:false,
  wage:0,tax_rate:0,juhyu_hours:0};
const contract={id:91,contract_id:91,employee_id:employee.id,
  effective_from:'2026-01-01',effective_to:null,payroll_type:'MONTHLY',
  monthly_salary:2600000,weekly_contracted_minutes:0,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
  break_provision_mode:'IGNORED',night_allowance_enabled:false};
const parseWon=v=>Number(String(v).replace(/[^0-9-]/g,''));
async function compute({ym='2026-10',periods=[{
  employee_id:employee.id,started_on:'2026-01-01',ended_on:'2026-10-10'
}],active=false,payrollType='MONTHLY'}={}){
 const emp={...employee,is_active:active};
 const c={...contract,payroll_type:payrollType};
 const BE={
  allEmployees:async()=>[emp],
  eventsWithCorrections:async()=>({events:[],corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[c],
  payrollContractWorkdays:async()=>[],
  payrollSubstitutions:async()=>[],
  payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>periods,
  employmentBundle:async()=>({contracts:[c],periods,workdays:[]})
 };
 const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-11-20T03:00:00Z')});
 const payroll=await engine.computeMonthPayroll(ym);
 return {payroll,engine};
}
const lastMonth=await compute();
assert.equal(lastMonth.payroll.rows.length,1,'Former monthly employee must not vanish with no October punches');
const p=lastMonth.payroll.rows[0].pay;
assert.equal(lastMonth.payroll.rows[0].payrollType,'MONTHLY');
assert.equal(p.accruedDays,10,'Employment ended October 10 inclusive');
assert.equal(p.base,Math.trunc(2600000*10/31));
assert.equal(lastMonth.payroll.totalGross,p.base);
const sheet=await lastMonth.engine.buildSheetSyncPayload('2026-10');
assert.equal(sheet.payroll.rows.length,1,'Sheet includes earned prorated salary after termination');
assert.equal(parseWon(sheet.payroll.rows[0][sheet.payroll.header.indexOf('기본급')]),p.base);
assert.equal((await compute({ym:'2026-11'})).payroll.rows.length,0,'No November salary after October termination');
const unbounded=await compute({periods:[{
 employee_id:employee.id,started_on:'2026-01-01',ended_on:null
}]});
assert.equal(unbounded.payroll.rows.length,0,'Inactive employee with unterminated employment cannot be auto-paid indefinitely');
const unrelatedHourly=await compute({payrollType:'HOURLY'});
assert.equal(unrelatedHourly.payroll.rows.length,0,'Inactive hourly no-work staff stay excluded');
const active=await compute({active:true,periods:[{employee_id:employee.id,
 started_on:'2026-01-01',ended_on:null}]});
assert.equal(active.payroll.rows[0].pay.base,2600000,'Active monthly salary still does not require clock punches');
console.log('PASS terminated salaried employee payout, Sheet parity, and future/unbounded exclusion');
