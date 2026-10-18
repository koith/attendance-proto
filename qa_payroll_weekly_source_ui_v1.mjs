import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {verifiedWeeklySource} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';
const helper=fs.readFileSync('payroll_weekly_source_ui_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const context={window:{}};
vm.runInNewContext(helper,context,{timeout:2000});
const ui=context.window.weeklyApprovalSourceAmount;
assert.equal(typeof ui,'function');
const week='2026-10-05';
const cases=[
 [null,null],[{},null],[{weeklyCalculatedAmounts:{}},null],
 [{weeklyCalculatedAmounts:{[week]:null}},null],
 [{weeklyCalculatedAmounts:{[week]:''}},null],
 [{weeklyCalculatedAmounts:{[week]:NaN}},null],
 [{weeklyCalculatedAmounts:{[week]:Infinity}},null],
 [{weeklyCalculatedAmounts:{[week]:false}},null],
 [{weeklyCalculatedAmounts:{[week]:0}},0],
 [{weeklyCalculatedAmounts:{[week]:'0'}},0],
 [{weeklyCalculatedAmounts:{[week]:38000}},38000],
 [{weeklyCalculatedAmounts:{[week]:38000.1}},null],
 [{weeklyCalculatedAmounts:{[week]:-10}},null],
 [{weeklyReviewComments:['2026-10-05: 계약상 주간 근무시간 미달 (700/960분)']},0],
 [{weeklyReviewComments:['2026-10-12: 주간 근무 미달']},null],
 [{weeklyReviewComments:['2026-10-050: bogus']},null]
];
for(const [pay,expected] of cases){
 assert.equal(ui(pay,week),expected,'UI policy mismatch');
 assert.equal(ui(pay,week),verifiedWeeklySource(pay,week),'UI/Edge drift');
}
assert.match(html,/payroll_weekly_source_ui_v1\.js\?v=20261018v327/);
const version=html.match(/const APP_VERSION="v0\.(\d+)"/)?.[1];
assert.ok(Number(version)>=327,'weekly approval guard must remain available in all later app versions');
assert.match(html,/id="weeklyApproveSourceStatus"/);
assert.match(html,/const amount=window\.weeklyApprovalSourceAmount\(pay,key\)/);
assert.match(html,/modal\.querySelector\("#weeklyApproveSave"\)\.disabled=!valid/);
assert.match(html,/if\(verifiedWon===null\|\|modal\.querySelector\("#weeklyApproveOriginal"\)\.value!==String\(verifiedWon\)\)/);
assert.doesNotMatch(html,/Number\(pay\.weeklyCalculatedAmounts\?\.\[key\]\|\|0\)/);
assert.doesNotMatch(html,/Number\(modal\.querySelector\("#weeklyApproveOriginal"\)\.value\)\s*;\s*const decision=/);
console.log('PASS MTG-03: 16 runtime UI/Edge parity cases, no unknown=0, approval disabled, release v0.327');
