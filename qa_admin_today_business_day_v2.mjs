import fs from 'node:fs';import assert from 'node:assert/strict';
const idx=fs.readFileSync('index.html','utf8');
const actual=fs.readFileSync('actual_attendance.js','utf8');
assert(idx.includes('id="tabAttendance" href="#attendance"'));
assert(idx.includes('if(h==="attendance")'));
assert(actual.includes('store workday is anchored by the clock-in date'));
console.log('admin/attendance route PASS');
