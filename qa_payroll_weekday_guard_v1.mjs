import assert from 'node:assert/strict';
import {assessWeeklyRest} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';
const workdays=[{weekday:1,contracted_minutes:180},{weekday:1,contracted_minutes:180},{weekday:2,contracted_minutes:180}];
const sessions=[{status:'COMPLETE',in:new Date('2026-10-05T09:00:00'),sec:10800},{status:'COMPLETE',in:new Date('2026-10-06T09:00:00'),sec:10800}];
const result=assessWeeklyRest({weeklyMinutes:900,workdays,sessions,weekStart:'2026-10-05'});
assert.equal(result.automaticEligible,true);
assert.deepEqual(result.missingDays,[]);
assert.throws(()=>assessWeeklyRest({weeklyMinutes:900,workdays:[{weekday:8,contracted_minutes:60}],sessions,weekStart:'2026-10-05'}),/Invalid contracted weekday/);
console.log('PASS weekly duplicate workday and invalid weekday guards');
