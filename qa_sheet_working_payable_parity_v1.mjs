import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
import {attendanceWithWorkingPayable} from './supabase/functions/server-sync-sheet/sheet_working_payable.mjs';
process.env.TZ='UTC';
const employee={id:99045,name:'Working Sheet QA',is_active:true,wage:12000,tax_rate:0};
const contract={id:45,contract_id:45,employee_id:99045,effective_from:'2026-01-01',
 payroll_type:'HOURLY',hourly_wage:12000,tax_treatment:'BUSINESS_INCOME',
 business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};
const BE={
 allEmployees:async()=>[employee],
 eventsWithCorrections:async()=>({events:[
  {id:1,employee_id:99045,event_type:'IN',event_at:'2026-10-11T12:30:00'},
 ],corrections:[]}),
 payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
 payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>[],
 payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
 payrollEmploymentPeriods:async()=>[],
 employmentBundle:async()=>({contracts:[contract],periods:[],workdays:[]}),
};
const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-11T08:00:00Z')});
const payload=await engine.buildSheetSyncPayload('2026-10');
const calculated=await engine.computeMonthPayroll('2026-10');
const before=structuredClone(payload.attendance);
assert.equal(before.rows.length,1);
assert.equal(before.rows[0][5],'근무중');
assert.equal(before.rows[0][10],'0:00','canonical builder retains original parity data');
assert.equal(calculated.rows[0].sec,16200,'working shift is recognized as elapsed payroll time');
const actual=attendanceWithWorkingPayable(payload.attendance,calculated);
assert.equal(actual.rows[0][10],'04:30','writer uses server-accrued working seconds');
assert.deepEqual(payload.attendance,before,'parity payload remains untouched');
assert.equal(calculated.rows[0].pay.base,54000,'same raw seconds underlie hourly payroll base');
assert.equal(actual.rows[0][5],'근무중','working status unchanged');
const extras={header:[],rows:[
 ['2026-10-11','Working Sheet QA','12:30','—','근무중','근무중','','','','','0:00'],
 ['2026-10-11','Other employee','09:00','17:00','08:00','정상','','','','','08:00']
]};
const processed=attendanceWithWorkingPayable(extras,calculated);
assert.equal(processed.rows[0][10],'04:30');
assert.equal(processed.rows[1][10],'08:00','completed rows are not altered');
const longer=attendanceWithWorkingPayable({rows:[['2026-10-11','Working Sheet QA','12:30','—','근무중','근무중','','','','','0:00']]},
 {rows:[{employee_name:'Working Sheet QA',sec:26*3600+120,sessions:[{status:'WORKING',in:new Date('2026-10-11T12:30:00')}]}]});
assert.equal(longer.rows[0][10],'26:02','ongoing display never wraps at 24 hours');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
assert.match(edge,/attendanceWithWorkingPayable\(report\.attendance,calculated\)/);
assert.match(edge,/attendance:workingAttendance\|\|payload\.attendance/);
assert.match(edge,/report,workingAttendance,closed:/,'writer output and client parity payload are separately preserved');
console.log('PASS real engine live payable seconds, completed records unchanged, 26-hour display, and safe Sheet writer overlay');
