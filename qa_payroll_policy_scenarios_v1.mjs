import assert from 'node:assert/strict';
import {assessWeeklyRest,approvedWeeklyAdjustment,truncateWon} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';

// Pure-policy fixtures; never modify real employees, contracts, attendance or approvals.
const shift=(date,hours)=>({status:'COMPLETE',in:new Date(date+'T09:00:00'),sec:hours*3600});
const monday='2026-09-28'; // Monday-Sunday crosses September/October.
const workdays=[{weekday:1,contracted_minutes:480},{weekday:4,contracted_minutes:480}];
const sessions=[shift('2026-09-28',8),shift('2026-10-01',8)];
const baseline={weeklyMinutes:960,workdays,sessions,weekStart:monday};
assert.equal(assessWeeklyRest(baseline).automaticEligible,true,'cross-month complete week');
assert.equal(assessWeeklyRest({...baseline,sessions:[sessions[0]]}).automaticEligible,false,'missing contracted day');
assert.deepEqual(assessWeeklyRest({...baseline,sessions:[sessions[0]]}).missingDays,[4]);
assert.equal(assessWeeklyRest({...baseline,sessions:[shift('2026-09-28',16)]}).automaticEligible,false,'extra hours cannot replace scheduled day');
assert.equal(assessWeeklyRest({...baseline,sessions:[sessions[0],{...sessions[1],status:'WORKING'}]}).automaticEligible,false,'ongoing shift is not earned');
assert.equal(assessWeeklyRest({...baseline,weeklyMinutes:899}).automaticEligible,false,'under 15 contracted hours');
assert.equal(assessWeeklyRest({...baseline,substitutions:[{id:1}]}).requiresReview,true,'substitution needs approval');
assert.equal(assessWeeklyRest({...baseline,departureDate:'2026-10-01'}).automaticEligible,false,'departure needs review');
assert.equal(assessWeeklyRest({...baseline,workdays:[]}).automaticEligible,false,'missing contracted days');
assert.equal(assessWeeklyRest({...baseline,sessions:[shift('2026-10-05',8),shift('2026-10-08',8)]}).automaticEligible,false,'next week excluded');
assert.equal(truncateWon(10000.99),10000,'integer won truncation');
assert.equal(approvedWeeklyAdjustment(50000,null).amount,50000,'no approval preserves calculated amount');
assert.equal(approvedWeeklyAdjustment(50000,40000,'근무기록 정정','manager','2026-10-10T00:00:00Z').amount,40000);
assert.equal(approvedWeeklyAdjustment(50000,0,'주휴 미충족','manager','2026-10-10T00:00:00Z').amount,0);
for(const amount of [-1,Infinity,NaN])assert.throws(()=>approvedWeeklyAdjustment(50000,amount,'승인 사유','manager','2026-10-10T00:00:00Z'));
assert.throws(()=>approvedWeeklyAdjustment(50000,40000,'', 'manager','2026-10-10T00:00:00Z'));
assert.throws(()=>approvedWeeklyAdjustment(50000,40000,'승인 사유',null,'2026-10-10T00:00:00Z'));
// A completed 16-hour week is still unsafe when another timecard in the
// same week is unpaired, invalid or open. A separate week must not block it.
for(const status of ['WORKING','INCOMPLETE','ORPHAN_OUT','INVALID_TIME']){
  const broken={status,in:status==='ORPHAN_OUT'?null:new Date('2026-10-02T09:00:00'),
    out:status==='ORPHAN_OUT'?new Date('2026-10-02T10:00:00'):null,sec:null};
  const review=assessWeeklyRest({...baseline,sessions:[...sessions,broken]});
  assert.equal(review.automaticEligible,false,status+' in week blocks auto-approval');
  assert.equal(review.completed,false,status+' week cannot be marked completed');
  assert.match(review.reasons.join(' '),/미완료 또는 출퇴근 누락/);
}
const unrelated={status:'WORKING',in:new Date('2026-10-05T09:00:00'),out:null,sec:null};
assert.equal(assessWeeklyRest({...baseline,sessions:[...sessions,unrelated]}).automaticEligible,true,
  'Unresolved next-week session cannot block prior settled week');
console.log('PASS payroll policy scenarios including unfinished-shift review and week isolation');
