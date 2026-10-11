import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261011191500_weekly_cross_month_close_guard.sql','utf8');
// Execute the deployed Edge date classifier, not a separate permissive copy.
const {runInNewContext}=await import('node:vm');
const helperMatch=source.match(/function weekBelongsToPayrollMonth\(ym,weekStart\)\{[\s\S]*?\n\}/);
assert.ok(helperMatch,'The Edge must validate the Monday-owned payroll month');
const belongs=(ym,date)=>runInNewContext(helperMatch[0]+'\nweekBelongsToPayrollMonth(ym,date)',{ym,weekStart:date,date,Date,Number});
for(const [ym,date,expected] of [
 ['2026-09','2026-09-28',true],['2026-10','2026-09-28',false],
 ['2026-10','2026-10-26',true],['2026-10','2026-09-21',false],
 ['2026-10','2026-11-02',false],['2025-12','2025-12-29',true],
 ['2026-01','2025-12-29',false],['2026-10','2026-09-29',false]
])assert.equal(belongs(ym,date),expected,ym+' '+date);
assert.match(source,/if\(!weekBelongsToPayrollMonth\(ym,weekStart\)\)/);
assert.match(sql,/v_next_ym:=TO_CHAR\(p_week_start\+6,'YYYY-MM'\)/);
assert.match(sql,/v_next_ym<>v_ym/);
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('payroll-close:'\|\|v_next_ym,0\)\)/);
assert.match(sql,/ym IN \(v_ym,v_next_ym\) AND status='CLOSED'/);
assert.match(sql,/s\.ym IN \(v_ym,v_next_ym\)/);
assert.match(sql,/p_decision NOT IN \('APPROVE','REJECT'\)/);
assert.match(sql,/INSERT INTO public\.payroll_weekly_approvals/);
assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:FROM\s+)?public\.payroll_weekly_approvals\b/i);
console.log('PASS cross-month Monday inclusion and both-month closed-payroll lock without audit mutation');
