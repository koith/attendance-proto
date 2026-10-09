import assert from 'node:assert/strict';
import {assessWeeklyRest,approvedWeeklyAdjustment} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';
const weekStart='2026-09-28';
const workdays=[1,2,3,4,5].map(weekday=>({weekday,contracted_minutes:180}));
const sessions=[
  '2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'
].map(date=>({status:'COMPLETE',in:new Date(date+'T09:00:00'),sec:10800}));
const full=assessWeeklyRest({weeklyMinutes:900,workdays,sessions,weekStart});
assert.equal(full.automaticEligible,true,'week crossing September/October is one complete week');
assert.deepEqual(full.missingDays,[]);
const missing=assessWeeklyRest({weeklyMinutes:900,workdays,sessions:sessions.slice(0,3),weekStart});
assert.equal(missing.automaticEligible,false,'September-only session projection must not approve the week');
assert.deepEqual(missing.missingDays,[4,5]);
const adjusted=approvedWeeklyAdjustment(50000,47000,'approved correction','manager','2026-10-10T10:00:00Z');
assert.equal(adjusted.amount,47000);
assert.equal(adjusted.original,50000);
assert.throws(()=>approvedWeeklyAdjustment(50000,-1,'invalid','manager','2026-10-10T10:00:00Z'));
console.log('PASS functional cross-month weekly eligibility and approval adjustment');
