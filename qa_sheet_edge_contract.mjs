import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('edge_sync_sheet.ts','utf8');

assert.match(edge,/function formatSeoulMinute\(date: Date\)/,'sync-sheet must centralize human timestamp formatting');
assert.match(edge,/timeZone:\s*"Asia\/Seoul"/,'Sheet-visible timestamps must use Asia/Seoul');
assert.match(edge,/const syncedAt = formatSeoulMinute\(new Date\(\)\)/,'last-sync timestamp must use Seoul formatter');
assert.match(edge,/s\.closed_at \? formatSeoulMinute\(new Date\(s\.closed_at\)\) : ""/,'payroll closed timestamp must use Seoul formatter');
assert.doesNotMatch(edge,/const syncedAt = .*toISOString\(\)\.slice/,'displayed last-sync time must not be raw UTC ISO slicing');

const fmt=(d)=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',
}).formatToParts(d);
const parts=Object.fromEntries(fmt(new Date('2026-10-04T06:04:00Z')).map(p=>[p.type,p.value]));
assert.deepEqual(
  [parts.year,parts.month,parts.day,parts.hour,parts.minute],
  ['2026','10','04','15','04'],
  '06:04 UTC must display as 15:04 in Seoul'
);

console.log('sheet edge timezone contract: PASS');
