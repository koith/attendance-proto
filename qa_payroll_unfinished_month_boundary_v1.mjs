import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
process.env.TZ='UTC'; // Engine treats timezone-free source timestamps as KST wall time.

const emp={id:99271,name:'Boundary QA',is_active:true,wage:12000,tax_rate:0,juhyu_hours:0,memo:''};
const contract={id:71,contract_id:71,employee_id:emp.id,effective_from:'2026-01-01',effective_to:null,
 payroll_type:'HOURLY',hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:900,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};
function eventsFor(dates){
 let id=1;return dates.flatMap(date=>[
  {id:id++,employee_id:emp.id,event_type:'IN',event_at:date+'T09:00:00'},
  {id:id++,employee_id:emp.id,event_type:'OUT',event_at:date+'T14:00:00'}
 ]);
}
async function calculate({dates,days,now,ym='2026-09'}){
 const ev=eventsFor(dates);
 const wd=days.map(weekday=>({employee_id:emp.id,contract_id:71,weekday,contracted_minutes:300,weekly_contracted_minutes:900}));
 let fetchedBounds;
 const BE={
  allEmployees:async()=>[emp],
  eventsWithCorrections:async(from,to)=>{
   fetchedBounds={from,to};
   return {events:ev.filter(e=>e.event_at>=from&&e.event_at<to),corrections:[]};
  },
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>wd,
  payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({contracts:[contract],workdays:wd,periods:[]})
 };
 const R=await createPayrollEngine({BE,storeId:1,now:new Date(now)}).computeMonthPayroll(ym);
 assert.equal(R.rows.length,1);
 return {pay:R.rows[0].pay,range:fetchedBounds};
}
// All 15 contracted hours were worked in September but the week is not closed yet on October 1.
const finishedEarly={dates:['2026-09-28','2026-09-29','2026-09-30'],days:[1,2,3]};
const pending=await calculate({...finishedEarly,now:'2026-09-30T16:00:00Z'});
assert.equal(pending.pay.juhyu,0,'Cross-month week must not be prepaid on October 1');
assert.deepEqual(pending.pay.weeklyCalculatedAmounts,{},'No weekly allowance before Sunday business close');
const nearly=await calculate({...finishedEarly,now:'2026-10-04T16:59:00Z'});
assert.equal(nearly.pay.juhyu,0,'Monday 01:59 KST is still before the configured Sunday 26:00 cutoff');
const earned=await calculate({...finishedEarly,now:'2026-10-04T17:01:00Z'});
assert.equal(earned.pay.juhyu,36000,'Settled cross-month week must be credited once after Monday 02:00 KST');
// Sunday October 4 is part of the September 28 week, even when the payroll month is September.
const spansSunday={dates:['2026-09-28','2026-09-29','2026-10-04'],days:[1,2,0]};
const bridged=await calculate({...spansSunday,now:'2026-10-04T17:01:00Z'});
assert.equal(bridged.pay.juhyu,36000,'Last Sunday session from following month must count in previous month');
assert.ok(bridged.range.to>'2026-10-04T14:00:00','Event fetch must cover entire closing Sunday');
const october=await calculate({...spansSunday,now:'2026-10-04T17:01:00Z',ym:'2026-10'});
assert.equal(october.pay.juhyu,0,'Same cross-month week must not be paid again in October');
const engineSource=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.match(engineSource,/const weekClosed=settleAt<=nowLimit/,'Server must require actual Sunday business close');
console.log('PASS real payroll engine: unfinished previous-month week unpaid, Sunday 26:00 cutoff, full boundary data, no duplicate in next month');
