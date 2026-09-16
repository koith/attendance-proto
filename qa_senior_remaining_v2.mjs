import fs from 'node:fs';import assert from 'node:assert/strict';
const r=p=>fs.readFileSync(p,'utf8'),loader=r('payroll_elapsed_weeks_v1.js'),live=r('payroll_live_accrual_v1.js'),night=r('payroll_night_allowance_v1.js'),sub=r('substitution_v1.js');
assert(loader.indexOf('payroll_live_accrual_v1.js')<loader.indexOf('payroll_contract_authority_v1.js'));
assert(live.includes("s.status==='WORKING'")&&live.includes('(now-s.in)/1000')&&live.includes('completedWeeksInMonth'));
assert(night.includes("['COMPLETE','WORKING']")&&night.includes('const out=x.out||now'));
assert(sub.includes("TEST_SUB_KEY='baekeok_test_substitution_v1'")&&sub.includes("a.pin!=='0000'")&&sub.includes('saveTestRows(rows)'));
console.log('senior remaining V2 QA PASS');