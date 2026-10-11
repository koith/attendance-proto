import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const app=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261010223000_server_owned_payroll_close_reopen.sql','utf8');
const guards=fs.readFileSync('supabase/migrations/20261010224000_block_closed_month_overrides.sql','utf8');
const begin=edge.indexOf('function payrollClosingRows(report){');
const end=edge.indexOf('async function closingPreview(',begin);
assert.ok(begin>=0&&end>begin,'Server-owned close calculation missing');
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const closingRows=vm.runInNewContext(edge.slice(begin,end)+'\npayrollClosingRows',{HttpError});
const fixture={rows:[
  {employee_id:123,employee_name:'Fixture employee',emp:{memo:''},payrollType:'HOURLY',hours:4.5,sec:16200,issues:0,
    sessions:[{status:'COMPLETE'}],memo:'',pay:{wage:12000,jweeks:0,base:54000,juhyu:0,adjust:0,gross:54000,rate:.033,net:52210}},
  {employee_id:456,employee_name:'TEST',emp:{memo:'테스트'},payrollType:'HOURLY',hours:8,sec:28800,issues:0,
    sessions:[{status:'COMPLETE'}],pay:{wage:12000,jweeks:0,base:96000,juhyu:0,adjust:0,gross:96000,rate:0,net:96000}}
]};
const actual=closingRows(fixture);
assert.equal(actual.length,1);
assert.equal(actual[0].employee_id,123);
assert.equal(actual[0].base_pay,54000);
assert.equal(actual[0].net_pay,52210);
assert.equal(actual[0].hours,4.5);
const failed=structuredClone(fixture);failed.rows[0].sessions=[{status:'WORKING'}];
assert.throws(()=>closingRows(failed),/UNRESOLVED_ATTENDANCE_SESSIONS/);
failed.rows[0].sessions=[{status:'COMPLETE'}];failed.rows[0].issues=1;
assert.throws(()=>closingRows(failed),/UNRESOLVED_ATTENDANCE_SESSIONS/);
failed.rows[0].issues=0;failed.rows[0].sec=0;
assert.throws(()=>closingRows(failed),/NO_COMPLETED_WORK_FOR_MONTH/);
// A fixed-salary employee without timecards earns salary by active or
// terminated employment dates. The server must allow an immutable close.
const monthlyOnly=structuredClone(fixture);
monthlyOnly.rows=[{employee_id:181,employee_name:'Salaried earned month',emp:{memo:''},
  payrollType:'MONTHLY',contractMode:'MONTHLY',hours:0,sec:0,issues:0,sessions:[],
  pay:{wage:0,base:838709,juhyu:0,adjust:0,gross:838709,net:838700,rate:0,jweeks:0}}];
assert.equal(closingRows(monthlyOnly)[0].base_pay,838709,
  'Prorated final salary without timecard must remain closable');
const weeklyOnly=structuredClone(monthlyOnly);
weeklyOnly.rows[0]={employee_id:182,employee_name:'Monday-owned weekly allowance',
  emp:{memo:''},payrollType:'HOURLY',contractMode:'CONTRACT',
  hours:0,sec:0,issues:0,sessions:[],
  pay:{wage:12000,base:0,juhyu:25000,adjust:0,gross:25000,net:25000,rate:0,jweeks:0}};
assert.equal(closingRows(weeklyOnly)[0].juhyu_pay,25000,
  'Audited prior-Monday month weekly-only allowance must be closable');
const unsupported=structuredClone(weeklyOnly);
unsupported.rows[0].pay={...unsupported.rows[0].pay,juhyu:0,adjust:12345,gross:12345,net:12345};
assert.throws(()=>closingRows(unsupported),/NO_COMPLETED_WORK_FOR_MONTH/,
  'Unverified adjustments alone cannot bypass the no-work guard');
const zeroSalary=structuredClone(monthlyOnly);
zeroSalary.rows[0].pay={...zeroSalary.rows[0].pay,base:0,gross:0,net:0};
assert.throws(()=>closingRows(zeroSalary),/NO_COMPLETED_WORK_FOR_MONTH/,
  'Zero-value monthly salary is not a legitimate close exception');
const unresolvedMonthly=structuredClone(monthlyOnly);
unresolvedMonthly.rows[0].sessions=[{status:'WORKING'}];
assert.throws(()=>closingRows(unresolvedMonthly),/UNRESOLVED_ATTENDANCE_SESSIONS/,
  'Salary without complete timecards cannot bypass unfinished-shift gate');
const missingPay=structuredClone(fixture);
missingPay.rows.push({employee_id:789,employee_name:'Unclassified worker',emp:{memo:''},payrollType:null,pay:null,
  sec:3600,sessions:[{status:'COMPLETE'}],issues:0});
assert.throws(()=>closingRows(missingPay),/EMPLOYEE_PAY_RULE_MISSING/);
missingPay.rows[2].sec=0;missingPay.rows[2].issues=1;
assert.throws(()=>closingRows(missingPay),/UNRESOLVED_ATTENDANCE_SESSIONS/);
// An otherwise valid close must not omit a fixed-salary employee merely
// because contract terms require review and no timecards were submitted.
const blockedSalary=structuredClone(fixture);
blockedSalary.rows.push({employee_id:795,employee_name:'Salaried contract review',emp:{memo:''},
  payrollType:'MONTHLY',contractMode:'BLOCKED',pay:null,sec:0,issues:0,sessions:[]});
assert.throws(()=>closingRows(blockedSalary),/CONTRACT_PAYROLL_REVIEW_REQUIRED/,
  'Contract review must block month close even with zero recorded work');
const blockedHourly=structuredClone(fixture);
blockedHourly.rows[0].contractMode='BLOCKED';
assert.throws(()=>closingRows(blockedHourly),/CONTRACT_PAYROLL_REVIEW_REQUIRED/,
  'A blocked hourly contract must not be closed either');
const noWorkUnknown=structuredClone(fixture);
noWorkUnknown.rows.push({employee_id:796,employee_name:'No work and no contract',
  emp:{memo:''},payrollType:null,contractMode:'MISSING_CONTRACT',pay:null,
  sec:0,issues:0,sessions:[]});
assert.equal(closingRows(noWorkUnknown).length,1,
  'Zero-work unclassified employee alone must not lock unrelated payroll');
assert.match(edge,/mode==="payroll_close_preview"/);
assert.ok(edge.includes('"payroll_close_preview","payroll_close","payroll_reopen"'));
assert.match(edge,/mode==="payroll_reopen"/);
assert.match(edge,/actor\.adminRole!=="HQ"/);
assert.match(edge,/body\.confirm_ym!==ym/);
assert.match(edge,/PAYROLL_SOURCE_CHANGED_OR_NOT_CONFIRMED/);
assert.match(edge,/client\.rpc\("server_payroll_close_verified"/);
assert.match(edge,/client\.rpc\("server_payroll_reopen_verified"/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.ok(sql.includes("auth.jwt()->>'role'"));
assert.match(sql,/TO service_role/);
assert.match(sql,/payroll_snapshot_reopen_audit/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.admin_close_payroll/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.admin_reopen_payroll/);
assert.equal((guards.match(/PAYROLL_ALREADY_CLOSED/g)||[]).length,2);
assert.match(app,/CONTRACT_PAYROLL_REVIEW_REQUIRED/,
  'Client must render a useful review message instead of a raw code');
assert.match(app,/계약 조건 검토가 필요한 직원/);
assert.match(app,/id="payCloseSlot"/);
assert.match(app,/async payrollClosePreview\(ym\)/);
assert.match(app,/async closePayroll\(ym,fingerprint\)/);
assert.match(app,/async reopenPayroll\(ym,reason\)/);
console.log('PASS server-owned payroll close/reopen policy, prior-month scope and immutable audit');
