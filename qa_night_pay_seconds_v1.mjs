import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
process.env.TZ='UTC';
const id=992024;
const employee={id,name:'Night Seconds QA',is_active:true,wage:12000,tax_rate:0,juhyu_hours:0};
const baseContract={contract_id:81,id:81,employee_id:id,effective_from:'2026-10-01',effective_to:null,
 payroll_type:'HOURLY',hourly_wage:12000,weekly_contracted_minutes:0,
 tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,break_provision_mode:'IGNORED',
 night_allowance_enabled:true,night_allowance_mode:'RATE',night_allowance_value:50,
 night_allowance_start:'22:00:00',night_allowance_end:'06:00:00'};
async function calc(start,end,contract=baseContract){
 const events=[{id:1,employee_id:id,event_type:'IN',event_at:start},
  ...(end?[{id:2,employee_id:id,event_type:'OUT',event_at:end}]:[])];
 const BE={
  allEmployees:async()=>[employee],eventsWithCorrections:async()=>({events,corrections:[]}),
  payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
  payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>[],
  payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],payrollEmploymentPeriods:async()=>[],
  employmentBundle:async()=>({contracts:[contract],periods:[],workdays:[]})
 };
 const r=await createPayrollEngine({BE,storeId:1,now:new Date('2026-10-13T03:00:00Z')}).computeMonthPayroll('2026-10');
 assert.equal(r.rows.length,1);
 return r.rows[0];
}
const crossing=await calc('2026-10-12T21:59:30','2026-10-12T22:00:30');
assert.equal(crossing.pay.nightAllowance,50,'only thirty seconds after 22:00 accrue premium');
assert.equal(crossing.nightMinutes,0.5,'reported night duration includes exact seconds');
const partial=await calc('2026-10-12T22:00:30','2026-10-12T22:01:00');
assert.equal(partial.pay.nightAllowance,50,'thirty seconds must not be charged as a full minute');
const midnight=await calc('2026-10-12T23:59:30','2026-10-13T00:00:30');
assert.equal(midnight.pay.nightAllowance,100,'real elapsed minute survives midnight');
const flat=await calc('2026-10-12T22:00:30','2026-10-12T22:01:00',{...baseContract,night_allowance_mode:'FLAT',night_allowance_value:2000});
assert.equal(flat.pay.nightAllowance,16,'flat 2000 won/hour for 30 seconds is 16 won truncated');
const disabled=await calc('2026-10-12T22:00:30','2026-10-12T22:01:00',{...baseContract,night_allowance_enabled:false});
assert.equal(disabled.pay.nightAllowance,0,'unconfigured premium must not be imposed');
const open=await calc('2026-10-12T22:00:30',null);
assert.equal(open.pay.nightAllowance,0,'unfinished shift must not preload night premium');
const boundaryContract={...baseContract,night_allowance_start:'22:00:45',night_allowance_end:'06:00:15'};
const beforeContractStart=await calc('2026-10-12T22:00:30','2026-10-12T22:00:44',boundaryContract);
assert.equal(beforeContractStart.pay.nightAllowance,0,'seconds before custom 22:00:45 cannot earn night premium');
const afterContractStart=await calc('2026-10-12T22:00:30','2026-10-12T22:01:00',boundaryContract);
assert.equal(afterContractStart.pay.nightAllowance,25,'only 15 seconds after custom 22:00:45 earn night premium');
const beforeContractEnd=await calc('2026-10-13T06:00:00','2026-10-13T06:00:30',boundaryContract);
assert.equal(beforeContractEnd.pay.nightAllowance,25,'custom 06:00:15 boundary must keep only 15 seconds');
const wrapper=fs.readFileSync('payroll_night_allowance_v1.js','utf8');
assert.match(wrapper,/Number\(m\[3\]\|\|0\)/,'browser must parse the seconds field of HH:mm:ss');
assert.match(wrapper,/const allNight=overlap/);
assert.match(wrapper,/earned=overlap/);
assert.match(wrapper,/expected-Number\(p\.nightAllowance\|\|0\)/,'browser corrects any legacy minute-sampled allowance');
// Exercise the actual browser wrapper, not merely its parser source spelling.
const browser={
 window:{},LIVE:false,CURRENT_STORE_ID:2,BE:{},
 kstNow:()=>new Date('2026-10-13T03:00:00Z'),
 xrounddown:n=>Math.trunc(n/10)*10,
 computeMonthPayroll:async()=>({rows:[{
   contract:boundaryContract,payrollType:'HOURLY',
   sessions:[{status:'COMPLETE',in:new Date('2026-10-12T22:00:30'),out:new Date('2026-10-12T22:01:00')}],
   pay:{wage:12000,nightAllowance:0,night:0,gross:100,net:100,rate:0}
 }]})
};
vm.runInNewContext(wrapper,browser,{timeout:1000});
const browserResult=await browser.computeMonthPayroll('2026-10');
assert.equal(browserResult.rows[0].pay.nightAllowance,25,'browser and canonical server use identical second-accurate contract limits');
assert.equal(browserResult.rows[0].pay.nightHours,15/3600,'browser policy interval is 15 seconds');
assert.equal(browserResult.rows[0].nightMinutes,.5,'statutory 22:00 to 06:00 overlap remains unchanged');
console.log('PASS exact night seconds including custom HH:mm:ss contract boundaries, server/browser parity and open shifts');
