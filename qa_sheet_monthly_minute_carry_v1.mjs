import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
import {reconcileSheetPayableMinutes} from './supabase/functions/server-sync-sheet/sheet_minute_reconciliation.mjs';
process.env.TZ='UTC';

const parseMinutes=x=>{const m=String(x).match(/^(\d+):(\d\d)$/);assert.ok(m,'Invalid HH:MM '+x);return +m[1]*60 + +m[2];};
const input=Array.from({length:5},(_,i)=>Array.from({length:11},(_,col)=>col===10?'01:00':col===1?'Employee A':i));
const original=structuredClone(input);
const metadata=Array.from({length:5},()=>({employeeId:77,seconds:3658,isWorking:false}));
const result=reconcileSheetPayableMinutes(input,metadata);
assert.equal(result.reduce((sum,row)=>sum+parseMinutes(row[10]),0),304,
  'Five 01:00:58 shifts must display the authoritative 05:04 monthly total');
assert.deepEqual(result.map(row=>row[10]),['01:01','01:01','01:01','01:01','01:00'],
  'Largest seconds remainders allocate carry with stable chronological tie break');
assert.deepEqual(input,original,'Reconciliation must never mutate original report rows');
assert.deepEqual(metadata,Array.from({length:5},()=>({employeeId:77,seconds:3658,isWorking:false})),
  'Source seconds must remain immutable');

const mixed=reconcileSheetPayableMinutes(
 [input[0],input[1],input[2],input[3]],
 [{employeeId:1,seconds:3659,isWorking:false},{employeeId:2,seconds:7203,isWorking:false},
  {employeeId:1,seconds:3661,isWorking:false},{employeeId:2,seconds:3661,isWorking:true}]
);
assert.equal(mixed[0][10],'01:01');
assert.equal(mixed[2][10],'01:01');
assert.equal(mixed[1][10],'02:00');
assert.equal(mixed[3][10],'01:00','A working row remains untouched by completed-shift reconciliation');
assert.throws(()=>reconcileSheetPayableMinutes(input,[]),/SHAPE/);
assert.equal(reconcileSheetPayableMinutes([input[0]],[null])[0][10],'01:00',
 'Unmatched attendance must not be invented or modified');
assert.equal(reconcileSheetPayableMinutes([input[0]],[{employeeId:7,seconds:26*3600+59}])[0][10],'26:00',
 'Duration must not wrap at 24 hours');

const employee={id:990560,name:'Carry Synthetic QA',is_active:true,store_id:1,wage:12000,tax_rate:0,juhyu_hours:0};
const contract={id:560,contract_id:560,employee_id:employee.id,effective_from:'2026-01-01',
 payroll_type:'HOURLY',hourly_wage:12000,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
 break_provision_mode:'IGNORED',night_allowance_enabled:false};
const events=[];
for(let i=1;i<=5;i++){
 const date='2026-10-'+String(i).padStart(2,'0');
 events.push({id:i*2-1,employee_id:employee.id,event_type:'IN',event_at:date+'T12:00:01'});
 events.push({id:i*2,employee_id:employee.id,event_type:'OUT',event_at:date+'T13:00:59'});
}
const BE={
 allEmployees:async()=>[employee],
 eventsWithCorrections:async()=>({events,corrections:[]}),
 payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
 payrollContracts:async()=>[contract],payrollContractWorkdays:async()=>[],
 payrollSubstitutions:async()=>[],payrollWeeklyApprovals:async()=>[],
 payrollEmploymentPeriods:async()=>[],
 employmentBundle:async()=>({contracts:[contract],periods:[],workdays:[]}),
};
const engine=createPayrollEngine({BE,storeId:1,now:new Date('2026-10-12T06:00:00Z')});
const [payroll,report]=await Promise.all([
 engine.computeMonthPayroll('2026-10'),engine.buildSheetSyncPayload('2026-10')
]);
assert.equal(payroll.rows.length,1);
assert.equal(payroll.rows[0].sec,5*3658,'Payroll must retain precise seconds');
assert.equal(report.attendance.rows.length,5);
const dayMinutes=report.attendance.rows.map(row=>parseMinutes(row[10]));
assert.equal(dayMinutes.reduce((a,b)=>a+b,0),304);
const canonicalIndex=report.payroll.header.indexOf('가산 포함 급여산정시간');
assert.ok(canonicalIndex>=0,'Canonical gross payable-time heading exists');
const monthly=report.payroll.rows[0][canonicalIndex];
assert.equal(parseMinutes(monthly),304,
 'Payroll and user-visible attendance HH:MM sum exactly on real engine fixture');
const totalWage=payroll.rows[0].pay.base;
assert.equal(report.payroll.rows[0][report.payroll.header.indexOf('기본급')],
 totalWage.toLocaleString('ko-KR')+'원',
 'Minute redistribution never changes actual earned money');
const engineSrc=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.match(engineSrc,/reconcileSheetPayableMinutes\(detailedAttendance,minuteMetadata\)/);
assert.match(engineSrc,/rawSessionSeconds:items\.map\(x=>payableSeconds\(x,rec\.breakMode\)\)/);
console.log('PASS canonical payroll seconds/money unchanged; per-shift HH:MM sums match monthly display; live rows untouched');
