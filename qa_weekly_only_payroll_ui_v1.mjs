import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual in-page payroll row safety logic in an isolated JS context.
// The authoritative Edge accepts a Monday-owned, weekly-only allowance even
// if all wage-bearing shifts occurred in the following payroll month.
const app=fs.readFileSync('index.html','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const start=app.indexOf('  // UI boundary invariant: no completed work');
const end=app.indexOf('  R.totalGross=R.rows.reduce',start);
assert.ok(start>=0&&end>start,'Payroll UI zero-work guard found');
const source=app.slice(start,end);
const rows=[
 {employee_id:901,sec:0,payrollType:'HOURLY',contract:{id:1},
  pay:{base:0,weekly:38400,juhyu:38400,adjust:0,gross:38400,net:37130,jweeks:1}},
 {employee_id:902,sec:0,payrollType:'HOURLY',contract:{id:1},
  pay:{base:12000,weekly:0,juhyu:0,adjust:50,gross:12050,net:12050,jweeks:0}},
 {employee_id:903,sec:0,payrollType:'HOURLY',contract:null,
  pay:{base:0,weekly:10000,juhyu:10000,adjust:0,gross:10000,net:10000,jweeks:1}},
 {employee_id:904,sec:8*3600,payrollType:'HOURLY',contract:{id:1},
  pay:{base:96000,weekly:0,juhyu:0,adjust:0,gross:96000,net:96000,jweeks:0}},
 {employee_id:905,sec:0,payrollType:'MONTHLY',contract:{id:2},
  pay:{base:838709,juhyu:0,adjust:0,gross:838709,net:838700,jweeks:0}}
];
const out=vm.runInNewContext('(function(){'+source+'\nreturn R.rows;})()',{R:{rows:structuredClone(rows)}},{timeout:1500});
assert.equal(out[0].pay.gross,38400,
 'Earned Monday-owned holiday wage must survive UI rendering with zero local shifts');
assert.equal(out[0].pay.net,37130,
 'Do not recompute or mutate authoritative net pay in the browser');
assert.equal(out[0].pay.juhyu,38400);
assert.equal(out[1].pay.gross,0,'No-work stale hourly wage is not displayable');
assert.equal(out[1].pay.juhyu,0);
assert.equal(out[2].pay.gross,0,'No-work legacy weekly pay is not allowed without a verified contract');
assert.equal(out[3].pay.gross,96000,'Completed hourly wage must be unchanged');
assert.equal(out[4].pay.gross,838709,'Earned no-punch monthly salary must be unchanged');
assert.match(app,/if\(LIVE&&pay\?\.payrollType==="HOURLY"\)/,
 'Every activated, scoped store needs the weekly manager decision control');
assert.doesNotMatch(app,/if\(LIVE&&Number\(CURRENT_STORE_ID\)===1&&pay\?\.payrollType==="HOURLY"\)/,
 'Inha-only store restriction would hide manager approval in other stores');
assert.match(app,/ctx\?\.role!=="HQ"&&ctx\?\.role!=="STORE_MANAGER"/,
 'Authenticated admin navigation must still enforce HQ or assigned manager');
assert.match(app,/mode:"weekly_decide",store_id:Number\(CURRENT_STORE_ID\)/,
 'Manager decision must preserve selected store scope');
assert.match(edge,/throw new HttpError\(403,"STORE_NOT_AUTHORIZED"\)/,
 'Server remains the final multi-store authorization guard');
console.log('PASS UI preserves settled Monday-only holiday wages and keeps store-scoped weekly approval for every READY store');
