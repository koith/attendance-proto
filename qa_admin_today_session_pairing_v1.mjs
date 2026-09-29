import fs from 'node:fs';import assert from 'node:assert/strict';
const i=fs.readFileSync('index.html','utf8');
assert(i.includes('id="tabAttendance" href="#attendance"'));
assert(i.includes('location.href="actual_attendance.html"'));
console.log('canonical attendance entry PASS');
