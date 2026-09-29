import fs from 'node:fs';import assert from 'node:assert/strict';
const i=fs.readFileSync('index.html','utf8'),a=fs.readFileSync('actual_attendance.js','utf8');
assert(i.includes('id="tabAttendance" href="#attendance"'));
assert(i.includes('location.href="actual_attendance.html"'));
assert(a.includes("rpc('admin_events_with_corrections'"));
assert(a.includes('axisStart=')&&a.includes('axisEnd='));
console.log('admin attendance canonical route PASS');
