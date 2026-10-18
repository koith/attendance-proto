import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifiedWeeklySource} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';

// Actual Edge helper execution: missing or malformed source cannot become 0 won.
const week='2026-10-05';
assert.equal(verifiedWeeklySource(null,week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{}},week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:null}},week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:''}},week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:false}},week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:-1}},week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:NaN}},week),null);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:0}},week),0,
 'Actual computed zero can be approved, not confused with missing data');
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:38400}},week),38400);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{[week]:'38400'}},week),38400);
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{},weeklyReviewComments:[
 '2026-10-05: 계약상 주간 근무시간 미달 (700/960분)'
]},week),0,'Completed but ineligible week with actual review reason retains manager decision path');
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{},weeklyReviewComments:[
 '2026-10-12: 계약상 주간 근무시간 미달'
]},week),null,'Another week reason cannot authorize wrong week');
assert.equal(verifiedWeeklySource({weeklyCalculatedAmounts:{},weeklyReviewComments:[
 '2026-10-050: bogus'
]},week),null,'Prefix collision must not leak review evidence');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
assert.match(edge,/verifiedWeeklySource\(employeeRow\.pay,weekStart\)/);
assert.match(edge,/if\(actualCalculated===null\)throw new HttpError\(409,"WEEKLY_SOURCE_UNVERIFIED"\)/);
assert.doesNotMatch(edge,/weeklyCalculatedAmounts\?\.\[weekStart\]\|\|0/);
assert.match(edge,/typeof body\.calculated_won==="boolean"/);
console.log('PASS MTG-03 actual Edge source: absent/invalid review blocked, explicit zero and ineligible review retained');
