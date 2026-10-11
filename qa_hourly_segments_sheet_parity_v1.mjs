import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
const employee={id:990803,name:'Hourly segment fixture',store_id:1,is_active:true,
  wage:10000,tax_rate:0};
const first={id:21,contract_id:21,employee_id:employee.id,
  effective_from:'2026-10-01',effective_to:'2026-10-15',
  payroll_type:'HOURLY',hourly_wage:10000,weekly_contracted_minutes:0,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
  break_provision_mode:'IGNORED',night_allowance_enabled:false};
const next={...first,id:22,contract_id:22,effective_from:'2026-10-16',
  effective_to:null,hourly_wage:20000};
const events=['2026-10-05','2026-10-20'].flatMap((d,i)=>[
  {id:2*i+1,employee_id:employee.id,event_type:'IN',event_at:d+'T09:00:00'},
  {id:2*i+2,employee_id:employee.id,event_type:'OUT',event_at:d+'T17:00:00'}
]);
const money=v=>Number(String(v).replace(/[^0-9-]/g,''));
async function compute(mode){
  const contracts=[{...first,break_provision_mode:mode},
    {...next,break_provision_mode:mode}];
  const BE={
    allEmployees:async()=>[employee],
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contracts[1]],
    payrollContractWorkdays:async()=>[],
    payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>[],
    employmentBundle:async()=>({contracts,periods:[],workdays:[]})
  };
  const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-11-01T04:00:00Z')});
  return {row:(await engine.computeMonthPayroll('2026-10')).rows[0],
    sheet:await engine.buildSheetSyncPayload('2026-10')};
}
for(const [mode,base,bonus] of [
  ['IGNORED',240000,0],['PROVIDED',225000,0],['NOT_PROVIDED',240000,30000]]){
  const {row,sheet}=await compute(mode);
  assert.equal(row.contractMode,'CONTRACT',mode);
  assert.equal(row.pay.base,base,mode);
  assert.equal(row.pay.breakCompPay,bonus,mode);
  assert.equal(row.pay.gross,base+bonus,mode);
  assert.equal(row.pay.hourlySegments.length,2);
  const cols=sheet.payroll.header;
  const sh=sheet.payroll.rows[0];
  assert.equal(sh[cols.indexOf('시급')],'구간별');
  assert.equal(money(sh[cols.indexOf('기본급')]),base);
  assert.equal(money(sh[cols.indexOf('휴게수당')]),bonus);
  assert.equal(money(sh[cols.indexOf('예상 세전급여')]),base+bonus);
}
const server=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const browser=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
const helper=s=>s.match(/  function hourlyContractSegments\([\s\S]*?\n  \}/)?.[0];
assert.ok(helper(server));
assert.equal(helper(server),helper(browser));
console.log('PASS hourly contract effective wages and provided/unprovided/ignored break Sheet parity');
