import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPayrollEngine} from './supabase/functions/server-sync-sheet/engine.mjs';

// All fixtures synthetic; no production credentials, records or API calls.
process.env.TZ='UTC';
const emp={id:771991,name:'Synthetic attendance',store_id:1,is_active:true,wage:12000,
  tax_rate:0,juhyu_hours:0};
const contract={id:761,contract_id:761,employee_id:emp.id,
  effective_from:'2026-01-01',effective_to:null,payroll_type:'HOURLY',
  hourly_wage:12000,monthly_salary:0,weekly_contracted_minutes:0,
  tax_treatment:'BUSINESS_INCOME',business_deduction_rate:0,
  break_provision_mode:'IGNORED',night_allowance_enabled:false};
const clock=(id,type,date)=>({id,employee_id:emp.id,event_type:type,event_at:date});
const autoclosed=(id,date,extra={})=>({
  id,event_id:null,employee_id:emp.id,action:'ADD',
  new_event_type:'OUT',new_event_at:date,
  reason:'SYSTEM_STORE_CLOSE',created_by:'system:auto-close',
  created_at:'2026-10-13T03:00:00Z',...extra
});
async function payroll(events,corrections){
  const BE={
    allEmployees:async()=>[emp],
    eventsWithCorrections:async()=>({events,corrections}),
    payrollPeriod:async()=>({period:{weeks:4},overrides:[]}),
    payrollContracts:async()=>[contract],
    payrollContractWorkdays:async()=>[],
    payrollSubstitutions:async()=>[],
    payrollWeeklyApprovals:async()=>[],
    payrollEmploymentPeriods:async()=>[],
    employmentBundle:async()=>({contracts:[contract],workdays:[],periods:[]})
  };
  const r=await createPayrollEngine({BE,storeId:1,now:new Date('2026-11-02T10:00:00Z')})
    .computeMonthPayroll('2026-10');
  assert.equal(r.rows.length,1);
  return r.rows[0];
}

const start=clock(1,'IN','2026-10-12T09:00:00');
const synthetic=autoclosed(2,'2026-10-13T02:00:00');

// 17 hours of artificial closing must never become 17 payable hours.
let r=await payroll([start],[synthetic]);
assert.equal(r.sessions.length,1);
assert.equal(r.sessions[0].autoCloseUnverified,true);
assert.equal(r.sessions[0].status,'COMPLETE','preserve original attendance event as a trace');
assert.equal(r.issues,1,'manager must see an unresolved warning');
assert.equal(r.hours,0);
assert.equal(r.sec,0);
assert.equal(r.pay.base,0);
assert.equal(r.pay.gross,0);
assert.equal(r.nightMinutes,0);
assert.equal(r.breakBonusMinutes,0);
console.log('PASS: unverified system close is preserved but adds no wage/allowance');

// Real employee OUT takes precedence. Later fallback is not a phantom orphan OUT.
r=await payroll([start,clock(3,'OUT','2026-10-12T17:00:00')],[synthetic]);
assert.equal(r.sessions.length,1);
assert.equal(r.sessions[0].autoCloseUnverified,false);
assert.equal(r.issues,0);
assert.equal(r.hours,8);
assert.equal(r.pay.base,96000);
assert.equal(r.pay.gross,96000);
console.log('PASS: verified clock-out remains payable and fallback is ignored');

// Manager review explicitly voids synthetic ADD then adds an accurate OUT.
// Avoid editing the employee's raw punch history.
r=await payroll([start],[
  autoclosed(2,'2026-10-13T02:00:00',{reason:'SYSTEM_STORE_CLOSE [VOID_ADD:300]'}),
  {id:300,event_id:null,employee_id:emp.id,action:'VOID_ADD',new_event_at:null,
   reason:'void synthetic correction',created_by:'manager',created_at:'2026-10-13T05:00:00Z'},
  {id:301,event_id:null,employee_id:emp.id,action:'ADD',new_event_type:'OUT',
   new_event_at:'2026-10-12T17:00:00',reason:'verified clock-out',
   created_by:'manager',created_at:'2026-10-13T05:01:00Z'}
]);
assert.equal(r.sessions.length,1);
assert.equal(r.sessions[0].autoCloseUnverified,false);
assert.equal(r.issues,0);
assert.equal(r.hours,8);
assert.equal(r.pay.gross,96000);
console.log('PASS: manager-corrected OUT earns exactly its verified hours');

// Explicit KST overnight OUT is legitimate and must remain payable.
r=await payroll([clock(10,'IN','2026-10-12T19:00:00'),
                 clock(11,'OUT','2026-10-13T01:00:00')],[]);
assert.equal(r.sessions.length,1);
assert.equal(r.sessions[0].autoCloseUnverified,false);
assert.equal(r.hours,6);
assert.equal(r.pay.base,72000);
console.log('PASS: actual overnight shift unaffected');

const browser=readFileSync('index.html','utf8');
const source=readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.match(browser,/autoCloseUnverified:!!r\.systemStoreClose/);
assert.match(browser,/s\.status==="COMPLETE"&&!s\.autoCloseUnverified/);
assert.match(source,/sessions:reviewedSessions,substitutions:weeklySubstitutions/);
assert.match(source,/autoCloseUnverified\?"자동퇴근 확인필요":_statusLabel/);
console.log('PAYROLL_AUTOCLOSE_REVIEW_PASS 4 synthetic scenarios and source parity');
