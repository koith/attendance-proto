import assert from 'node:assert/strict';
import {truncateWon,approvedWeeklyAdjustment} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';
assert.equal(truncateWon(1234.99),1234);
assert.equal(truncateWon(1234.01),1234);
assert.deepEqual(approvedWeeklyAdjustment(1200.9,null),{amount:1200,adjusted:false});
assert.equal(approvedWeeklyAdjustment(0,40000,'대타 승인','manager-1','2026-10-09T12:00:00Z').amount,40000);
assert.equal(approvedWeeklyAdjustment(40000,0,'지급 요건 미충족','manager-1','2026-10-09T12:00:00Z').amount,0);
assert.throws(()=>approvedWeeklyAdjustment(0,40000,'',null,null),/Approval/);
console.log('PASS approved weekly adjustment helper');
