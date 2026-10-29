import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Synthetic employee only. No real attendance/payroll writes.
process.env.TZ='Asia/Seoul';
const id=990429,storeId=778;
const employee={id,name:'Scheduled window QA',store_id:storeId,is_active:true,wage:12000,tax_rate:0,juhyu_hours:0};
const baseContract={
  id:151,contract_id:151,employee_id:id,effective_from:'2026-01-01',
  effective_to:null,payroll_type:'HOURLY',hourly_wage:12000,
  monthly_salary:0,weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',
  night_allowance_enabled:false
};
const secs=n=>n*60;
const shift=(start,end,date='2026-10-01')=>[
  {employee_id:id,event_type:'IN',event_at:date+'T'+start+':00'},
  {employee_id:id,event_type:'OUT',event_at:(end.startsWith('+')?'2026-10-02T'+end.slice(1):date+'T'+end)+':00'}
];
async function run({start='06:46',end='15:20',startPlan='07:00',endPlan='15:00',
  weekday=4,type='HOURLY',daily=[],events=null,contracts=null,night=false}={}){
  const allEvents=events||shift(start,end);
  const stamped=allEvents.map((e,i)=>({...e,id:i+1}));
  const contract=contracts?.[0]||{...baseContract,payroll_type:type,
    monthly_salary:type==='MONTHLY'?2600000:0,night_allowance_enabled:night,
    night_allowance_mode:'RATE',night_allowance_value:50,
    night_allowance_start:'22:00',night_allowance_end:'06:00'};
  const activeContracts=contracts||[contract];
  const workdays=startPlan===null?[]:[{contract_id:contract.id,weekday,planned_start:startPlan,planned_end:endPlan}];
  const BE={
    allEmployees:async()=>[employee],
    eventsWithCorrections:async()=>({events:stamped,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>activeContracts,
    payrollContractWorkdays:async()=>[],
    payrollShiftStartRules:async()=>({contractWeekdays:workdays,dailySchedules:daily}),
    payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>[],
    employmentBundle:async()=>({contracts:activeContracts,periods:[],workdays:[]})
  };
  const engine=createPayrollEngine({BE,storeId,now:new Date('2026-11-10T09:00:00Z')});
  return {row:(await engine.computeMonthPayroll('2026-10')).rows[0],
    sheet:await engine.buildSheetSyncPayload('2026-10')};
}
function payable(x){return x.row.sessions.reduce((n,s)=>n+Number(s.payableSec??0),0)}
const both=await run();
assert.equal(both.row.sessions[0].sec,secs(514));
assert.equal(payable(both),secs(480));
assert.equal(both.row.sec,secs(480));
assert.equal(both.row.pay.base,96000,'base = agreed 8-hour overlap, no after-the-fact monetary deduction');
assert.equal(both.row.sessions[0].in.getHours(),6,'actual punch preserved');
assert.equal(both.row.sessions[0].out.getHours(),15,'actual punch preserved');
assert.equal(both.row.sessions[0].earlyExcludedSec,secs(14));
assert.equal(both.row.sessions[0].lateExcludedSec,secs(20));
assert.equal(both.sheet.attendance.rows[0][2],'06:46');
assert.equal(both.sheet.attendance.rows[0][3],'15:20');
assert.equal(both.sheet.attendance.rows[0][4],'08:34');
assert.equal(both.sheet.attendance.rows[0][10],'08:00');
const early=await run({end:'15:00'});
assert.equal(early.row.sec,secs(480));assert.equal(early.row.pay.base,96000);
const late=await run({start:'07:10'});
assert.equal(late.row.sec,secs(470));assert.equal(late.row.pay.base,94000);
const normal=await run({start:'07:00',end:'15:00'});
assert.equal(normal.row.pay.base,96000);
const before=await run({start:'06:00',end:'06:45'});
assert.equal(before.row.sec,0,'entirely before shift pays zero');
const after=await run({start:'15:05',end:'16:00'});
assert.equal(after.row.sec,0,'entirely after shift pays zero');
const noWindow=await run({startPlan:null});
assert.equal(noWindow.row.sec,secs(514),'missing plan never silently removes wages');
const missingEnd=await run({endPlan:null});
assert.equal(missingEnd.row.sec,secs(514),'start-only record cannot cap payroll');
const missingStart=await run({startPlan:null,daily:[{
  employee_id:id,work_date:'2026-10-01',status:'WORK',planned_start:null,planned_end:'15:00'
}]});
assert.equal(missingStart.row.sec,secs(514),'end-only record cannot cap payroll');
const badWeekday=await run({weekday:5});
assert.equal(badWeekday.row.sec,secs(514),'non-contracted weekday remains untouched');
const plannedDaily=await run({startPlan:'09:00',endPlan:'12:00',daily:[{
  employee_id:id,work_date:'2026-10-01',status:'WORK',
  planned_start:'07:00',planned_end:'15:00'
}]});
assert.equal(plannedDaily.row.sec,secs(480),'daily shift overrides recurring weekday plan');
const monthly=await run({type:'MONTHLY'});
assert.equal(monthly.row.pay.base,2600000,'monthly salary never clipped');
assert.equal(monthly.row.sessions[0].sec,secs(514));
assert.equal(monthly.row.sessions[0].payableSec,secs(514),'monthly shift keeps full actual elapsed time');
assert.equal(monthly.row.sec,secs(514),'monthly displayed worked time unchanged');
assert.equal(monthly.sheet.attendance.rows[0][10],'08:34','monthly sheet does not clip attendance');
const split=await run({events:[
  ...shift('06:46','10:00'),
  ...shift('10:20','15:20'),
]});
assert.equal(split.row.sessions.length,2);
assert.equal(split.row.sec,secs(460),'two completed punches intersect one window without double counting');
assert.equal(split.row.pay.base,92000);
const overnight=await run({start:'21:50',end:'+06:20',startPlan:'22:00',endPlan:'06:00'});
assert.equal(overnight.row.sessions[0].sec,secs(510));
assert.equal(overnight.row.sec,secs(480),'22:00-06:00 crosses midnight');
assert.equal(overnight.row.pay.base,96000);
const nightly=await run({start:'21:50',end:'+06:20',startPlan:'22:00',endPlan:'06:00',night:true});
assert.equal(nightly.row.pay.nightAllowance,48000,'night premium derives from capped overlap only');
const dated=await run({contracts:[{
  ...baseContract,id:151,contract_id:151,effective_from:'2026-10-02',effective_to:null
}]});
assert.equal(dated.row.sec,secs(514),'future-dated contract must not retroactively cap prior shift');
console.log('PASS hourly scheduled-window overlap: start/end, night, split, monthly unaffected, no-plan, dated contract and sheet parity');
