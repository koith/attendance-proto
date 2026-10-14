import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// Two approved contracts within one payroll month; the source's latest
// contract alone must not determine the pay rate for all earlier shifts.
// Synthetic fixtures only; no real employee or payroll history is modified.
process.env.TZ='UTC';
const emp={id:992831,name:'Contract transition fixture',store_id:1,is_active:true,
  wage:10000,tax_rate:0,juhyu_hours:0};
const old={id:1,contract_id:1,employee_id:emp.id,effective_from:'2026-10-01',
  effective_to:'2026-10-15',payroll_type:'HOURLY',hourly_wage:10000,
  weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',
  business_deduction_rate:0,break_provision_mode:'IGNORED',night_allowance_enabled:false};
const revised={...old,id:2,contract_id:2,effective_from:'2026-10-16',
  effective_to:null,hourly_wage:20000};
const monthlyA={...old,payroll_type:'MONTHLY',monthly_salary:2600000,hourly_wage:null};
const monthlyB={...monthlyA,id:3,contract_id:3,effective_from:'2026-10-16',
  effective_to:null,monthly_salary:3000000};
function eventsFor(days){
  let id=1;return days.flatMap(day=>[
    {id:id++,employee_id:emp.id,event_type:'IN',event_at:day+'T09:00:00'},
    {id:id++,employee_id:emp.id,event_type:'OUT',event_at:day+'T17:00:00'}
  ]);
}
async function run({contracts,dates=[],periods=[]}){
  const events=eventsFor(dates),latest=contracts.at(-1);
  const BE={
    allEmployees:async()=>[emp],
    eventsWithCorrections:async()=>({events,corrections:[]}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[latest],
    payrollContractWorkdays:async()=>[],
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>periods,
    employmentBundle:async()=>({contracts,workdays:[],periods})
  };
  const calculated=await createPayrollEngine({BE,storeId:1,
    now:new Date('2026-11-03T03:00:00Z')}).computeMonthPayroll('2026-10');
  assert.equal(calculated.rows.length,1);
  return calculated.rows[0];
}
const unchanged=await run({contracts:[old],dates:['2026-10-05']});
assert.equal(unchanged.contractMode,'CONTRACT');
assert.equal(unchanged.pay.base,80000,'Single valid hourly contract still calculates normally');
const oldOnly=await run({contracts:[old,revised],dates:['2026-10-05']});
assert.equal(oldOnly.contractMode,'CONTRACT','Earlier shift is priced at original hourly contract');
assert.equal(oldOnly.pay.base,80000);
const newOnly=await run({contracts:[old,revised],dates:['2026-10-20']});
assert.equal(newOnly.contractMode,'CONTRACT');
assert.equal(newOnly.pay.base,160000);
const mixed=await run({contracts:[old,revised],dates:['2026-10-05','2026-10-20']});
assert.equal(mixed.contractMode,'CONTRACT');
assert.equal(mixed.pay.base,240000);
assert.equal(mixed.pay.hourlySegments.length,2);
const weekly=await run({contracts:[old,{...revised,weekly_contracted_minutes:900}],
  dates:['2026-10-05','2026-10-20']});
assert.equal(weekly.contractMode,'BLOCKED','Weekly-rest policy changes remain review-only');
assert.equal(weekly.pay,null);
const hourlyGap=await run({contracts:[old,{...revised,effective_from:'2026-10-20'}],
  dates:['2026-10-05','2026-10-21']});
assert.equal(hourlyGap.contractMode,'BLOCKED','Contract gaps remain review-only');
const hourlyNight=await run({contracts:[old,{...revised,night_allowance_enabled:true}],
  dates:['2026-10-05','2026-10-20']});
assert.equal(hourlyNight.contractMode,'BLOCKED','Night-rate changes remain review-only');
const salary=await run({contracts:[monthlyA,monthlyB]});
assert.equal(salary.contractMode,'MONTHLY','Safe non-overlapping monthly changes use effective-date segments');
assert.equal(salary.pay.base,Math.trunc(2600000*15/31)+Math.trunc(3000000*16/31));
assert.equal(salary.pay.monthlySegments.length,2);
const overlapping=await run({contracts:[monthlyA,{...monthlyB,effective_from:'2026-10-10'}]});
assert.equal(overlapping.contractMode,'BLOCKED','Overlapping monthly contracts cannot be paid twice');
assert.equal(overlapping.pay,null);
const gap=await run({contracts:[monthlyA,{...monthlyB,effective_from:'2026-10-20'}]});
assert.equal(gap.contractMode,'BLOCKED','An uncovered employed salary period must be reviewed');
assert.equal(gap.pay,null);
const incompatible=await run({contracts:[monthlyA,{...monthlyB,business_deduction_rate:0.043}]});
assert.equal(incompatible.contractMode,'BLOCKED','Different tax regimes remain outside safe auto-segment scope');
assert.equal(incompatible.pay,null);
const browser=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
assert.ok(browser.includes('const segments=monthlyContractSegments('),
  'Browser must validate effective-date salary segments');
assert.ok(browser.includes("if(segments)return {mode:'MONTHLY'"),
  'Only verified salary segments may bypass the legacy review block');
assert.ok(browser.includes("return {mode:'BLOCKED',contract:displayContract"),
  'All unsupported contract revisions remain blocked');
console.log('PASS bounded hourly and monthly contract segments, unsafe weekly/night/overlap/gap/tax changes');
