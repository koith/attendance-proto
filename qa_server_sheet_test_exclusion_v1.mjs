import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=fs.readFileSync('index.html','utf8');
const server=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
const script=fs.readFileSync('apps_script.gs','utf8');
function extract(s){
 const start=s.indexOf('async function buildSheetSyncPayload(ym)');
 assert.ok(start>=0);
 const end=s.indexOf('\n}\n',start);
 assert.ok(end>start);
 return s.slice(start,end+2);
}
assert.equal(extract(browser),extract(server),'TEST exclusion must match browser and server in full');
assert.match(extract(server),/calculated\.rows\.filter\(rec=>String\(rec\.employee_name\|\|''\)\.trim\(\)\.toUpperCase\(\)!=='TEST'\)/);
assert.match(script,/payroll=withoutTestEmployee\(payroll\)/);
assert.match(script,/attendance=withoutTestEmployee\(attendance\)/);
assert.match(script,/sessions=withoutTestEmployee\(sessions\)/);
console.log('PASS TEST employee excluded identically from server/client reports and Google Sheet writer');
