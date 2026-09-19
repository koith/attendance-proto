import fs from 'node:fs';import assert from 'node:assert/strict';
const h=fs.readFileSync('actual_attendance.html','utf8'),j=fs.readFileSync('actual_attendance.js','utf8');
const legacy=['actual_attendance_day_slices_v1.js','actual_attendance_correction.js','actual_attendance_anomaly_v1.js','actual_attendance_anomaly_correction_v1.js','actual_attendance_identity_v2.js','actual_attendance_entry_mode_v1.js'];
for(const p of legacy)assert(!h.includes('src="'+p),'legacy patch script must not load separately: '+p);
assert.equal((h.match(/src="actual_attendance\.js/g)||[]).length,1,'one canonical actual attendance runtime');
for(const marker of ['actualAttendanceSourceSession','admin_correct_event','actualAttendanceIssueReason','employee-no-sub',"mode==='day'"])assert(j.includes(marker),'canonical runtime lost feature '+marker);
assert(!/delete\s+from\s+attendance_events/i.test(j));assert(!/update\s+attendance_events/i.test(j));
console.log('actual attendance canonical runtime: PASS');
