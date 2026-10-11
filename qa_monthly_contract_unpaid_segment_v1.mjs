import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic leap-year test of actual server payroll and Google Sheet projection.
// No operational employee, timecard, salary or sheet is accessed or changed.
const employee={id:994217,name:'Prorated salary scenario',store_id:1,is_active:true,
  wage:0,tax_rate:0,juhyu_hours:0};
const first={id:11,contract_id:11,employee_id:employee.id,
  payroll_type:'MONTHLY',effective_from:'2028-02-01',effective_to:'2028-02-14',
  monthly_salary:2600000,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',
  night_allowance_enabled:false};
const next={...first,id:12,contract_id:12,effective_from:'2028-02-15',
  effective_to:null,monthly_salary:3000000};
const num=v=>Number(String(v??'').replace(/[^0-9-]/g,''));
async function run({periods,contracts=[first,next],active=true}){
  const emp={...employee,is_active:active};
  const BE={
    allEmployees:async()=>[emp],
    eventsWithCorrections:async()=>({events:[],corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contracts.at(-1)],payrollContractWorkdays:async()=>[],
    payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>periods,
    employmentBundle:async()=>({contracts,periods,workdays:[]})
  };
  const engine=createPayrollEngine({BE,storeId:1,now:new Date('2028-03-10T03:00:00Z')});
  const report=await engine.computeMonthPayroll('2028-02');
  const sheet=await engine.buildSheetSyncPayload('2028-02');
  return {row:report.rows[0],sheet};
}
const period=(started_on,ended_on=null)=>[
  {employee_id:employee.id,started_on,ended_on}
];
const cases=[
  {label:'full leap February',periods:period('2028-02-01'),days:[14,15]},
  {label:'join exactly on contract revision',periods:period('2028-02-15'),days:[0,15]},
  {label:'depart exactly before revision',periods:period('2028-02-01','2028-02-14'),days:[14,0],active:false},
  {label:'partial span around revision',periods:period('2028-02-10','2028-02-20'),days:[5,6]}
];
for(const c of cases){
  const {row,sheet}=await run(c);
  const expected=Math.trunc(2600000*c.days[0]/29)+Math.trunc(3000000*c.days[1]/29);
  assert.ok(row,c.label+' must not disappear from payroll');
  assert.equal(row.contractMode,'MONTHLY',c.label);
  assert.equal(row.pay.base,expected,c.label+' prorated salary in leap February');
  assert.equal(row.pay.accruedDays,c.days[0]+c.days[1],c.label+' accrued days');
  assert.equal(row.pay.monthlySegments.length,c.days.filter(Boolean).length,c.label+' only paid segments');
  const wageIdx=sheet.payroll.header.indexOf('기본급');
  assert.equal(num(sheet.payroll.rows[0][wageIdx]),expected,c.label+' Google Sheet amount');
}
// Never relax the guard for overlapping contracts or a gap on employed days.
const overlap=await run({periods:period('2028-02-01'),
  contracts:[first,{...next,effective_from:'2028-02-10'}]});
assert.equal(overlap.row.contractMode,'BLOCKED','Overlapping employed dates require manual review');
assert.equal(overlap.row.pay,null);
const gap=await run({periods:period('2028-02-01'),
  contracts:[first,{...next,effective_from:'2028-02-20'}]});
assert.equal(gap.row.contractMode,'BLOCKED','Uncovered employed dates must block close');
assert.equal(gap.row.pay,null);
const zero=await run({periods:period('2028-03-01')});
assert.equal(zero.row.contractMode,'BLOCKED','No earned employment days cannot create an accidental salary');
assert.equal(zero.row.pay,null);
const browser=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
const server=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const helper=src=>src.match(/  function monthlyContractSegments\([\s\S]*?\n  \}/)?.[0];
assert.ok(helper(server));
assert.equal(helper(server),helper(browser),'Browser and server salaries must use identical policies');
console.log('PASS leap February 29-day monthly salary across join/exit, partial periods, unsafe gap/overlap');
