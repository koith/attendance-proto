import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// All data here are synthetic. No production attendance or payroll mutation.
process.env.TZ='Asia/Seoul';
const employee={id:990430,name:'Synthetic manager-adjusted shift',store_id:778,is_active:true,wage:12000,tax_rate:0,juhyu_hours:0};
const contract={
  id:152,contract_id:152,employee_id:employee.id,effective_from:'2026-01-01',
  effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,
  monthly_salary:0,weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false
};
const stamp=t=>'2026-10-01T'+t+':00';
const record=(id,type,time)=>({id,employee_id:employee.id,event_type:type,event_at:stamp(time)});
const added=(id,type,time,createdBy='manager:qa')=>({
  id,employee_id:employee.id,event_id:null,action:'ADD',
  new_event_type:type,new_event_at:stamp(time),reason:'관리자 확인 후 누락 근무 추가',
  created_by:createdBy,created_at:'2026-10-03T11:00:00Z'
});
const edited=(id,eventId,time,createdBy='manager:qa')=>({
  id,employee_id:employee.id,event_id:eventId,action:'EDIT_TIME',
  new_event_type:null,new_event_at:stamp(time),reason:'관리자 확인 후 근무시간 정정',
  created_by:createdBy,created_at:'2026-10-03T11:00:00Z'
});
async function scenario(events,corrections=[],payrollType='HOURLY'){
 const current={...contract,payroll_type:payrollType,monthly_salary:payrollType==='MONTHLY'?2600000:0};
 const BE={
  allEmployees:async()=>[employee],
  eventsWithCorrections:async()=>({events,corrections}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[current],payrollContractWorkdays:async()=>[],
  payrollShiftStartRules:async()=>({contractWeekdays:[{
    contract_id:152,weekday:4,planned_start:'07:00',planned_end:'15:00'
  }],dailySchedules:[]}),
  payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
  payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({contracts:[current],periods:[],workdays:[]})
 };
 const engine=createPayrollEngine({BE,storeId:778,now:new Date('2026-11-10T09:00:00Z')});
 const row=(await engine.computeMonthPayroll('2026-10')).rows[0];
 const payload=await engine.buildSheetSyncPayload('2026-10');
 return {row,payload};
}
const raw=[record(1,'IN','06:46'),record(2,'OUT','15:20')];
const ordinary=await scenario(raw);
assert.equal(ordinary.row.sessions[0].sec,514*60);
assert.equal(ordinary.row.sec,500*60);
assert.equal(ordinary.row.pay.base,100000);
assert.equal(ordinary.row.sessions[0].inManuallyAccepted,false);
assert.equal(ordinary.payload.attendance.rows[0][2],'06:46');
assert.equal(ordinary.payload.attendance.rows[0][3],'15:20');
assert.equal(ordinary.payload.attendance.rows[0][4],'08:34');
assert.equal(ordinary.payload.attendance.rows[0][10],'08:20');
// Only an explicitly manager-entered IN opts out of automatic pre-start omission.
const managerEditedIn=await scenario(
 [record(1,'IN','06:50'),record(2,'OUT','15:20')],[edited(101,1,'06:46')]
);
assert.equal(managerEditedIn.row.sessions[0].inManuallyAccepted,true);
assert.equal(managerEditedIn.row.sec,514*60);
assert.equal(managerEditedIn.row.pay.base,102800);
assert.equal(managerEditedIn.payload.attendance.rows[0][10],'08:34');
// An edited OUT is paid all the way to the manually acknowledged time,
// even if its paired early IN is not specially acknowledged.
const managerEditedOut=await scenario(
 [record(1,'IN','06:46'),record(2,'OUT','15:00')],[edited(102,2,'15:20')]
);
assert.equal(managerEditedOut.row.sessions[0].inManuallyAccepted,false);
assert.equal(managerEditedOut.row.sec,500*60);
assert.equal(managerEditedOut.row.pay.base,100000);
// Admin manual ADD of a missing IN counts in full.
const managerAddedIn=await scenario([record(2,'OUT','15:20')],[added(103,'IN','06:46')]);
assert.equal(managerAddedIn.row.sessions[0].inManuallyAccepted,true);
assert.equal(managerAddedIn.row.sec,514*60);
assert.equal(managerAddedIn.row.pay.base,102800);
// Admin manual ADD of a late OUT counts the OUT but not an unmodified early IN.
const managerAddedOut=await scenario([record(1,'IN','06:46')],[added(104,'OUT','15:20')]);
assert.equal(managerAddedOut.row.sessions[0].inManuallyAccepted,false);
assert.equal(managerAddedOut.row.sec,500*60);
assert.equal(managerAddedOut.row.pay.base,100000);
// Both endpoints manually entered (missing full shift) are recognized as actual.
const managerAddedBoth=await scenario([],[added(105,'IN','06:46'),added(106,'OUT','15:20')]);
assert.equal(managerAddedBoth.row.sessions[0].inId,'add_105');
assert.equal(managerAddedBoth.row.sec,514*60);
assert.equal(managerAddedBoth.row.pay.base,102800);
// Synthetic/system auto events must not bypass start policy.
const systemAdded=await scenario([record(2,'OUT','15:20')],[added(107,'IN','06:46','system:auto-close')]);
assert.equal(systemAdded.row.sessions[0].inManuallyAccepted,false);
assert.equal(systemAdded.row.sec,500*60);
// Monthly contract must never use hourly early arrival omission.
const monthly=await scenario(raw,[],'MONTHLY');
assert.equal(monthly.row.sec,514*60);
assert.equal(monthly.row.pay.base,2600000);
console.log('PASS hourly early-only cap, late-out inclusion, manager ADD/EDIT_TIME full payable, system exclusions, MONTHLY intact, Sheets parity');
