import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261011191500_weekly_cross_month_close_guard.sql','utf8');
const belongs=(ym,monday)=>{
 const ts=Date.parse(monday+'T00:00:00Z'),year=+ym.slice(0,4),month=+ym.slice(5,7);
 return Number.isFinite(ts)&&new Date(ts).getUTCDay()===1&&ts>=Date.UTC(year,month-1,1)-6*86400000&&ts<Date.UTC(year,month,1);
};
for(const [ym,date,expected] of [
 ['2026-10','2026-09-28',true],['2026-10','2026-10-26',true],
 ['2026-10','2026-09-21',false],['2026-10','2026-11-02',false],
 ['2026-01','2025-12-29',true],['2026-10','2026-09-29',false]
])assert.equal(belongs(ym,date),expected,ym+' '+date);
assert.match(source,/weekMonday\.getTime\(\)<monthStart-6\*86400000/);
assert.match(source,/weekMonday\.getTime\(\)>=nextMonth/);
assert.doesNotMatch(source,/weekStart\.startsWith\(ym\)/);
assert.match(sql,/v_next_ym:=TO_CHAR\(p_week_start\+6,'YYYY-MM'\)/);
assert.match(sql,/v_next_ym<>v_ym/);
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('payroll-close:'\|\|v_next_ym,0\)\)/);
assert.match(sql,/ym IN \(v_ym,v_next_ym\) AND status='CLOSED'/);
assert.match(sql,/s\.ym IN \(v_ym,v_next_ym\)/);
assert.match(sql,/p_decision NOT IN \('APPROVE','REJECT'\)/);
assert.match(sql,/INSERT INTO public\.payroll_weekly_approvals/);
assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|TRUNCATE)\s+(?:FROM\s+)?public\.payroll_weekly_approvals\b/i);
console.log('PASS cross-month Monday inclusion and both-month closed-payroll lock without audit mutation');
