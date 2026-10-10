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
assert.match(edge,/mode==="payroll_close_preview"/);
assert.match(edge,/mode==="payroll_close"/);
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
assert.match(app,/id="payCloseSlot"/);
assert.match(app,/async payrollClosePreview\(ym\)/);
assert.match(app,/async closePayroll\(ym,fingerprint\)/);
assert.match(app,/async reopenPayroll\(ym,reason\)/);
console.log('PASS server-owned payroll close/reopen policy, prior-month scope and immutable audit');
