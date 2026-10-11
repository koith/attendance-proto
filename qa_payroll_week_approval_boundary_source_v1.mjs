import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
assert.match(source,/\.gte\("week_start",new Date\(Date\.UTC\(Number\(ym\.slice\(0,4\)\),Number\(ym\.slice\(5,7\)\)-1,-6\)\)/);
assert.doesNotMatch(source,/\.gte\("week_start",ym\+"-01"\)/);
const priorWeekStart=(ym)=>new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,-6)).toISOString().slice(0,10);
assert.equal(priorWeekStart('2026-10'),'2026-09-24');
assert.equal(priorWeekStart('2026-01'),'2025-12-25');

const helperMatch=source.match(/function weekBelongsToPayrollMonth\(ym,weekStart\)\{[\s\S]*?\n\}/);
assert.ok(helperMatch,'Missing server-side Monday-month guard');
const {runInNewContext}=await import('node:vm');
const owns=(ym,week)=>runInNewContext(helperMatch[0]+'\nweekBelongsToPayrollMonth(ym,week)',{ym,week,Date,Number});
assert.equal(owns('2026-09','2026-09-28'),true,'Cross-month week belongs to its Monday month');
assert.equal(owns('2026-10','2026-09-28'),false,'Next-month zero-won approval must be forbidden');
assert.equal(owns('2026-10','2026-10-05'),true,'Normal October Monday');
assert.equal(owns('2026-10','2026-10-01'),false,'Reject non-Monday');
assert.equal(owns('2026-02','2026-02-30'),false,'Reject invalid calendar date');
assert.equal(owns('2026-12','2026-12-28'),true,'December year-boundary week');
assert.equal(owns('2027-01','2026-12-28'),false,'Reject year-boundary spillover');
assert.match(source,/if\(!weekBelongsToPayrollMonth\(ym,weekStart\)\)/);
const ui=fs.readFileSync('index.html','utf8');
assert.match(ui,/id="weeklyApproveDate" type="date" min="\$\{ym\}-01" max=/);

console.log('PASS approval Monday-month guard and boundary source');
