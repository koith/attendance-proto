import fs from 'node:fs';
import assert from 'node:assert/strict';
const index=fs.readFileSync('index.html','utf8');
const contract=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
const night=fs.readFileSync('payroll_night_allowance_v1.js','utf8');
const loader=fs.readFileSync('payroll_elapsed_weeks_v1.js','utf8');
assert.match(index,/async serverPayroll\(ym\)/);
const adapterBoundary=index.indexOf('const SupaBE =');
const localBegin=index.indexOf('const LocalBE =');
const publicBoundary=index.indexOf('const publicRpc=',adapterBoundary);
assert.ok(localBegin>=0&&adapterBoundary>localBegin&&publicBoundary>adapterBoundary);
assert.doesNotMatch(index.slice(localBegin,adapterBoundary),/async serverPayroll\(ym\)/,'LocalBE must not send production payroll requests');
assert.match(index.slice(adapterBoundary,publicBoundary),/async serverPayroll\(ym\)/,'Live SupaBE must call authenticated Edge payroll');

assert.match(index,/mode:"payroll",ym,store_id:Number\(CURRENT_STORE_ID\|\|1\)/);
assert.match(index,/typeof BE\.serverPayroll==="function"/);
assert.match(index,/SERVER_PAYROLL_AUTH_REQUIRED/);
assert.match(index,/SERVER_PAYROLL_ENGINE_OUTDATED/);
assert.match(index,/PAYROLL_SERVER_UPGRADE_PENDING/);
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
assert.match(edge,/engine_revision:"20261010-verified"/);

assert.match(contract,/typeof BE\.serverPayroll==="function"\)\{lastResult=R;return R;/);
assert.match(night,/typeof BE\.serverPayroll==="function"\)\{window\.__nightPayrollResult=R;return R;/);
assert.match(loader,/payroll_contract_authority_v1\.js\?v=20261009v0185/);
assert.match(loader,/payroll_night_allowance_v1\.js\?v=20261009v0185/);
assert.match(index,/if\(LIVE && Number\(CURRENT_STORE_ID\)===1\)return;/);
assert.match(index,/const APP_VERSION="v0\.\d+"/);
console.log('PASS pilot payroll uses authenticated server result; no double premiums or browser Sheet timer race');
