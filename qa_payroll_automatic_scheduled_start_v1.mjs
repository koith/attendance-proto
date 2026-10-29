import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
process.env.TZ='Asia/Seoul';
const emp={id:900061,store_id:701,name:'QA scheduled clock-in',is_active:true,wage:12000,tax_rate:0,juhyu_hours:0};
const contract={id:71,contract_id:71,employee_id:emp.id,effective_from:'2026-01-01',effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};
function reportWith({start='06:46',finish='15:04',scheduled='07:00:00',weekday=4,daily=[],payrollMonth='2026-10'}={}){
 const events=[
  {id:1,employee_id:emp.id,event_type:'IN',event_at:'2026-10-01T'+start+':00'},
  {id:2,employee_id:emp.id,event_type:'OUT',event_at:'2026-10-01T'+finish+':00'}
 ];
 const BE={
  allEmployees:async()=>[emp],eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>[],
  payrollShiftStartRules:async()=>({contractWeekdays:scheduled?[{contract_id:71,weekday,planned_start:scheduled}]:[],dailySchedules:daily}),
  payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({contracts:[contract],periods:[],workdays:[]})
 };
 const engine=createPayrollEngine({BE,storeId:701,now:new Date('2026-11-10T10:00:00Z')});
 return Promise.all([engine.computeMonthPayroll(payrollMonth),engine.buildSheetSyncPayload(payrollMonth)]);
}
const minutes=n=>n*60;
const [early,sheet]=await reportWith();
assert.equal(early.rows.length,1);
const row=early.rows[0];
assert.equal(row.sessions[0].in.getHours(),6);
assert.equal(row.sessions[0].in.getMinutes(),46);
assert.equal(row.sessions[0].sec,minutes(498),'actual worked 8h18 must stay in timecard');
assert.equal(row.sessions[0].payableSec,minutes(484),'payroll starts 07:00, only 8h04 payable');
assert.equal(row.sessions[0].earlyExcludedSec,minutes(14));
assert.equal(row.sec,minutes(484));
assert.equal(row.pay.base,96800,'12,000 won hourly, 8h04 payable');
assert.equal(sheet.attendance.rows[0][2],'06:46','Sheet preserves actual punch');
assert.equal(sheet.attendance.rows[0][4],'08:18','Sheet preserves actual elapsed duration');
assert.equal(sheet.attendance.rows[0][10],'08:04','Sheet payable hours from same engine');
const [noPlan]=await reportWith({scheduled:null});
assert.equal(noPlan.rows[0].sec,minutes(498),'no plan must not silently deduct wages');
assert.equal(noPlan.rows[0].pay.base,99600);
const [late]=await reportWith({start:'07:12'});
assert.equal(late.rows[0].sec,minutes(472),'late start is never moved backward');
assert.equal(late.rows[0].pay.base,94400);
const [daily]=await reportWith({scheduled:'08:00',daily:[{employee_id:900061,work_date:'2026-10-01',status:'WORK',planned_start:'07:00'}]});
assert.equal(daily.rows[0].sec,minutes(484),'daily schedule overrides weekday plan');
const [offDay]=await reportWith({scheduled:'07:00',weekday:5});
assert.equal(offDay.rows[0].sec,minutes(498),'unmatched weekday never deducts');
console.log('PASS scheduled start 06:46 -> 07:00 payable; raw and Sheet preserved; no approval; absent plan, late start and daily override verified');
