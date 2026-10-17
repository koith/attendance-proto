/* #1000: Actual server payroll/sheet builder fed by isolated per-store
 * synthetic employee roster and completed/overnight/test attendance. No RPCs
 * or Google APIs used. Tests the connected computation, not just source text.
 */
import assert from 'node:assert/strict';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';
process.env.TZ='UTC';
const employees=[
 {id:11,name:'일반직원',store_id:701,is_active:true,wage:12000,tax_rate:0},
 {id:12,name:'야간직원',store_id:701,is_active:true,wage:15000,tax_rate:0},
 {id:13,name:'TEST',store_id:701,is_active:true,wage:10000,tax_rate:0},
 {id:14,name:'타지점직원',store_id:702,is_active:true,wage:99999,tax_rate:0}
];
const contracts=employees.map(e=>({
 id:100+e.id,employee_id:e.id,effective_from:'2026-01-01',effective_to:null,
 payroll_type:'HOURLY',hourly_wage:e.wage,monthly_salary:0,
 weekly_contracted_minutes:0,tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
 break_provision_mode:'NOT_CONSIDERED',night_allowance_enabled:false
}));
const events=[
 {id:1,store_id:701,employee_id:11,event_type:'IN',event_at:'2026-10-05T09:00:00'},
 {id:2,store_id:701,employee_id:11,event_type:'OUT',event_at:'2026-10-05T17:00:00'},
 {id:3,store_id:701,employee_id:12,event_type:'IN',event_at:'2026-10-06T22:00:00'},
 {id:4,store_id:701,employee_id:12,event_type:'OUT',event_at:'2026-10-07T02:00:00'},
 {id:5,store_id:701,employee_id:13,event_type:'IN',event_at:'2026-10-05T12:00:00'},
 {id:6,store_id:701,employee_id:13,event_type:'OUT',event_at:'2026-10-05T13:00:00'},
 {id:7,store_id:702,employee_id:14,event_type:'IN',event_at:'2026-10-05T09:00:00'},
 {id:8,store_id:702,employee_id:14,event_type:'OUT',event_at:'2026-10-05T17:00:00'}
];
const makeBE=storeId=>({
 allEmployees:async()=>structuredClone(employees.filter(e=>e.store_id===storeId)),
 eventsWithCorrections:async()=>({events:structuredClone(events.filter(e=>e.store_id===storeId)),corrections:[]}),
 payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
 payrollContracts:async()=>structuredClone(contracts.filter(c=>employees.some(e=>e.id===c.employee_id&&e.store_id===storeId))),
 payrollContractWorkdays:async()=>[],
 payrollSubstitutions:async()=>[],
 payrollWeeklyApprovals:async()=>[],
 payrollEmploymentPeriods:async()=>[],
 employmentBundle:async id=>({contracts:structuredClone(contracts.filter(c=>c.employee_id===id)),periods:[],workdays:[]})
});
const calc=async id=>{
 const engine=createPayrollEngine({BE:makeBE(id),storeId:id,
  storeName:id===701?'QA 701 지점':'QA 702 지점',
  now:new Date('2026-10-12T03:00:00Z')});
 return{pay:await engine.computeMonthPayroll('2026-10'),
  sheet:await engine.buildSheetSyncPayload('2026-10')};
};
const first=await calc(701),other=await calc(702);
assert.equal(first.pay.rows.length,3,'Real payroll engine uses three store701 employees');
const byName=name=>first.pay.rows.find(r=>r.employee_name===name);
assert.equal(byName('일반직원').sec,8*3600,'8-hour shift processed');
assert.equal(byName('야간직원').sec,4*3600,'Overnight session remains four hours');
assert.ok(byName('일반직원').pay.gross>0,'Regular staff receives earned wages');
assert.ok(byName('야간직원').pay.gross>0,'Night staff receives earned wages');
assert.equal(other.pay.rows.length,1,'Store702 payroll isolated');
assert.equal(other.pay.rows[0].employee_name,'타지점직원','Store702 has own employee');
assert.ok(!first.pay.rows.some(r=>r.employee_name==='타지점직원'),'No cross-store staff leak');
assert.ok(first.sheet.payroll.rows.length===2,'TEST excluded from Google Sheet export');
assert.ok(first.sheet.attendance.rows.some(r=>r.includes('일반직원')),'Completed regular attendance reaches sheet payload');
assert.ok(first.sheet.attendance.rows.some(r=>r.includes('야간직원')),'Overnight shift reaches sheet payload');
assert.ok(!JSON.stringify(first.sheet).includes('"TEST"'),'TEST employee must not leak to sheet');
assert.ok(!JSON.stringify(first.sheet).includes('타지점직원'),'Cross-store employee must not leak to sheet');
assert.ok(JSON.stringify(other.sheet).includes('타지점직원'),'Other store may export its own employee');
const before=JSON.stringify(first.sheet);
events[1]={...events[1],event_at:'2026-10-05T18:00:00'};
const after=await calc(701);
assert.notEqual(JSON.stringify(after.sheet),before,'Attendance edit must change actual sheet report');
assert.ok(after.pay.rows.find(r=>r.employee_name==='일반직원').pay.gross>
 byName('일반직원').pay.gross,'Corrected extra hour changes payroll');
assert.equal(other.pay.rows[0].employee_name,'타지점직원','Other store unchanged after store701 correction');
console.log('PASS #1000 real payroll engine -> attendance, wages, overnight, corrections, TEST exclusion, Google Sheet payload and tenant isolation');
