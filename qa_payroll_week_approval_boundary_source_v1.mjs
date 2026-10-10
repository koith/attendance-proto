import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
assert.match(source,/\.gte\("week_start",new Date\(Date\.UTC\(Number\(ym\.slice\(0,4\)\),Number\(ym\.slice\(5,7\)\)-1,-6\)\)/);
assert.doesNotMatch(source,/\.gte\("week_start",ym\+"-01"\)/);
const priorWeekStart=(ym)=>new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,-6)).toISOString().slice(0,10);
assert.equal(priorWeekStart('2026-10'),'2026-09-24');
assert.equal(priorWeekStart('2026-01'),'2025-12-25');
console.log('PASS weekly approval query includes previous-month boundary week');
