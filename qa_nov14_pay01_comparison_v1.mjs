import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
// NOV14-PAY-01 is research/design only; no real salaries, credentials, SMTP or DB writes.
const source=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const policy=fs.readFileSync('supabase/functions/server-sync-sheet/payroll_policy.mjs','utf8');
const adapter=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const report=fs.readFileSync('docs/research/NOV14_PAY01_COMPARATIVE_DESIGN_20261115.md','utf8');
for(const phrase of ['.xlsm','웹앱','2026-11-15','9.5%','7.19%','0.9448%','0.9%','간이세액표','C1','C8','실제 Excel','UNVERIFIED'])
 assert.ok(report.includes(phrase),'Missing design criterion '+phrase);
assert.match(source,/computeMonthPayroll\(ym\)/);
assert.match(source,/0\.033/);
assert.match(source,/tax_treatment==="BUSINESS_INCOME"/);
assert.match(adapter,/sheet_server_payroll_source/);
assert.match(adapter,/payroll_weekly_approvals/);
assert.match(policy,/assessWeeklyRest/);
assert.match(report,/3\.3%.*일괄/);
assert.doesNotMatch(report,/운영.*발송 완료|실급여.*확정 완료/);
// Test synthetic identity-to-file mapping, never employee name matching.
const employees=[
 {store_id:7,ym:'2026-10',employee_id:101,start:'07:50',end:'10:00',scheduled:'08:00'},
 {store_id:7,ym:'2026-10',employee_id:102,start:'08:15',end:'10:00',scheduled:'08:00'},
 {store_id:8,ym:'2026-10',employee_id:101,start:'07:50',end:'10:00',scheduled:'08:00'}
];
const minutes=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
const hours=(row)=>Math.max(0,minutes(row.end)-Math.max(minutes(row.start),minutes(row.scheduled)));
const batch=(rows,store,ym)=>{
 const chosen=rows.filter(x=>x.store_id===store&&x.ym===ym);
 const ids=new Set();
 return chosen.map(row=>{
  if(ids.has(row.employee_id))throw Error('DUPLICATE_EMPLOYEE_MONTH');
  ids.add(row.employee_id);
  return {key:[row.store_id,row.ym,row.employee_id].join('/'),won:12000*hours(row)/60};
 });
};
const parsed=batch(employees,7,'2026-10');
assert.deepEqual(parsed,[{key:'7/2026-10/101',won:24000},{key:'7/2026-10/102',won:21000}]);
assert.deepEqual(batch(employees,8,'2026-10'),[{key:'8/2026-10/101',won:24000}]);
assert.throws(()=>batch([employees[0],employees[0]],7,'2026-10'),/DUPLICATE_EMPLOYEE_MONTH/);
// Reuse verified real payroll engine source-level regression, no production network.
const executed=spawnSync(process.execPath,['qa_payroll_clock_variance_v1.mjs'],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
if(executed.status!==0)throw Error('REAL_PAYROLL_CLOCK_FIXTURE_FAILED '+(executed.stderr||'').slice(-1000));
console.log('PASS NOV14-PAY-01 research evidence: field keys, 2-hour/105-minute overlap, cross-store isolation, current server source, payroll clock QA');
