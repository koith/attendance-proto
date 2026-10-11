import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual Edge close-row validator in a synthetic sandbox.
// No RPC is invoked and no production payroll record can be changed.
const api=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const begin=api.indexOf('function payrollClosingRows(report){');
const end=api.indexOf('\nasync function closingPreview(',begin);
assert.ok(begin>=0&&end>begin,'Find canonical server close-row validator');
const sandbox={};
vm.runInNewContext(`class HttpError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
${api.slice(begin,end)}
globalThis.closeRows=payrollClosingRows;`,sandbox,{timeout:1500});
function row({type='MONTHLY',base=0,juhyu=0,adjust=0,sec=0,sessions=[],mode=type}={}){
  const gross=base+juhyu+adjust;
  return {employee_id:998611,employee_name:'Monthly final-pay fixture',emp:{memo:''},
    contractMode:mode,payrollType:type,issues:0,sessions,sec,hours:sec/3600,memo:'',
    pay:{base,juhyu,adjust,gross,net:gross,wage:type==='MONTHLY'?0:12000,
      jweeks:juhyu>0?1:0,rate:0}};
}
const close=r=>sandbox.closeRows({rows:[r]});
function rejects(r,reason){
  assert.throws(()=>close(r),e=>e?.message===reason,reason);
}
const finalSalary=close(row({base:Math.trunc(2600000*10/31)}));
assert.equal(finalSalary.length,1,'Final prorated salary must be closeable without punches');
assert.equal(finalSalary[0].base_pay,Math.trunc(2600000*10/31));
const mondayOnly=close(row({type:'HOURLY',base:0,juhyu:25000}));
assert.equal(mondayOnly[0].juhyu_pay,25000,'Approved previous-month weekly-only wage may close');
rejects(row(),'NO_COMPLETED_WORK_FOR_MONTH');
rejects(row({type:'HOURLY',adjust:10000}),'NO_COMPLETED_WORK_FOR_MONTH');
rejects(row({base:100000,mode:'BLOCKED'}),'CONTRACT_PAYROLL_REVIEW_REQUIRED');
rejects(row({base:100000,sessions:[{status:'WORKING'}]}),'UNRESOLVED_ATTENDANCE_SESSIONS');
assert.equal(close(row({type:'HOURLY',base:80000,sec:8*3600,
  sessions:[{status:'COMPLETE'}]}))[0].base_pay,80000);
console.log('PASS server close: terminated monthly wage, Monday-only holiday, zero-work/adjustment and unpaired rejection');
