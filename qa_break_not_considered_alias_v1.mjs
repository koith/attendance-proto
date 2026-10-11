import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic only. Confirm historical NOT_CONSIDERED behaves and reports exactly
// like IGNORED without inventing any new paid-break policy.
const emp={id:998281,name:'Break alias fixture',is_active:true,wage:12000,tax_rate:0};
const baseContract={id:51,contract_id:51,employee_id:emp.id,effective_from:'2026-10-01',
  effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,weekly_contracted_minutes:0,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,night_allowance_enabled:false};
const events=[
  {id:1,employee_id:emp.id,event_type:'IN',event_at:'2026-10-12T09:00:00'},
  {id:2,employee_id:emp.id,event_type:'OUT',event_at:'2026-10-12T14:00:00'}
];
async function run(mode){
 const contract={...baseContract,break_provision_mode:mode};
 const BE={
  allEmployees:async()=>[emp],
  eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],
  payrollContractWorkdays:async()=>[],
  payrollSubstitutions:async()=>[],
  payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({periods:[],contracts:[contract],workdays:[]})
 };
 const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-19T03:00:00Z')});
 const report=await engine.computeMonthPayroll('2026-10');
 const sheet=await engine.buildSheetSyncPayload('2026-10');
 assert.equal(report.rows.length,1);
 return {row:report.rows[0],sheet};
}
const ignored=await run('IGNORED'),alias=await run('NOT_CONSIDERED'),notProvided=await run('NOT_PROVIDED');
assert.equal(alias.row.breakMode,'IGNORED');
assert.equal(alias.row.breakDeductSeconds,0);
assert.equal(alias.row.breakBonusMinutes,0);
assert.equal(alias.row.breakNotProvidedCount,0);
assert.equal(alias.row.pay.breakCompPay,0);
assert.equal(alias.row.pay.gross,ignored.row.pay.gross,'Alias must never change earnings');
assert.equal(alias.row.pay.gross,60000,'Five completed hours at 12000 won');
assert.equal(alias.sheet.payroll.rows[0][alias.sheet.payroll.header.indexOf('휴게 제공 여부')],'미고려');
assert.equal(alias.sheet.attendance.rows[0][alias.sheet.attendance.header.indexOf('휴게 제공 여부')],'미고려');
assert.deepEqual(alias.sheet.payroll.rows,ignored.sheet.payroll.rows,'Report display and values match IGNORED');
assert.equal(notProvided.row.breakMode,'NOT_PROVIDED');
assert.equal(notProvided.row.pay.breakCompPay,6000,'Explicit NOT_PROVIDED retains separately confirmed compensation');
console.log('PASS NOT_CONSIDERED alias uses IGNORED pay semantics and consistent Sheet labels');
