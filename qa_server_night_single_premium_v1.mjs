import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
const ym='2026-10',id=987650;
const employee={id,name:'Night fixture',is_active:true,wage:12000,tax_rate:0,juhyu_hours:0,memo:''};
const contract={id:55,contract_id:55,employee_id:id,effective_from:'2026-10-01',effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,
 weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
 break_provision_mode:'NOT_CONSIDERED',night_allowance_enabled:true,night_allowance_mode:'RATE',night_allowance_value:50,
 night_allowance_start:'22:00:00',night_allowance_end:'06:00:00'};
const events=[
 {id:1,employee_id:id,event_type:'IN',event_at:'2026-10-05T22:00:00'},
 {id:2,employee_id:id,event_type:'OUT',event_at:'2026-10-06T02:00:00'}];
const BE={
 allEmployees:async()=>[employee],eventsWithCorrections:async()=>({events,corrections:[]}),
 payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),payrollContracts:async()=>[contract],
 payrollContractWorkdays:async()=>[{employee_id:id,contract_id:55,weekly_contracted_minutes:0}],
 payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],payrollEmploymentPeriods:async()=>[],
 employmentBundle:async()=>({periods:[],contracts:[contract],workdays:[]})
};
const report=await createPayrollEngine({BE,storeId:1,now:new Date('2026-10-20T03:00:00Z')}).computeMonthPayroll(ym);
assert.equal(report.rows.length,1);
const pay=report.rows[0].pay;
assert.ok(pay,'Night pay row must not be contract-blocked');
assert.equal(pay.nightAllowance,24000,'four hours at 50% of 12000');
assert.equal(pay.gross,72000,'base 48000 + one night premium 24000, not double');
assert.equal(report.totalGross,pay.gross);
console.log('PASS: completed overnight shift gets exactly one night allowance');
