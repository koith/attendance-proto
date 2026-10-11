import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
const emp={id:990173,name:'Segmented salary fixture',is_active:true,store_id:1,wage:0,tax_rate:0};
const a={id:11,contract_id:11,employee_id:emp.id,effective_from:'2026-10-01',
 effective_to:'2026-10-15',payroll_type:'MONTHLY',monthly_salary:2600000,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',
 night_allowance_enabled:false};
const b={...a,id:12,contract_id:12,effective_from:'2026-10-16',
 effective_to:null,monthly_salary:3000000};
async function run(periods){
 const contracts=[a,b];
 const BE={
 allEmployees:async()=>[emp],
 eventsWithCorrections:async()=>({events:[],corrections:[]}),
 payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
 payrollContracts:async()=>[b],payrollContractWorkdays:async()=>[],
 payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
 payrollEmploymentPeriods:async()=>periods,
 employmentBundle:async()=>({contracts,periods,workdays:[]})};
 const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-11-10T03:00:00Z')});
 const report=await engine.computeMonthPayroll('2026-10');
 const sheet=await engine.buildSheetSyncPayload('2026-10');
 return {row:report.rows[0],sheet};
}
const period=(start,end=null)=>[{employee_id:emp.id,started_on:start,ended_on:end}];
for(const [periods,oldDays,newDays] of [
 [period('2026-10-01'),15,16],
 [period('2026-10-10'),6,16],
 [period('2026-10-01','2026-10-20'),15,5]
]){
 const {row,sheet}=await run(periods);
 const base=Math.trunc(2600000*oldDays/31)+Math.trunc(3000000*newDays/31);
 assert.equal(row.contractMode,'MONTHLY');
 assert.equal(row.pay.base,base);
 assert.equal(row.pay.accruedDays,oldDays+newDays);
 assert.equal(row.pay.monthlySegments.length,2);
 const index=sheet.payroll.header.indexOf('기본급');
 assert.equal(Number(String(sheet.payroll.rows[0][index]).replace(/[^0-9-]/g,'')),base);
}
const sv=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const ui=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
const helper=s=>s.match(/  function monthlyContractSegments\([\s\S]*?\n  \}/)?.[0];
assert.ok(helper(sv));
assert.equal(helper(sv),helper(ui),'The salary segment policy must match in server and browser');
console.log('PASS effective-date salary segment Sheet parity, partial periods and browser policy parity');
