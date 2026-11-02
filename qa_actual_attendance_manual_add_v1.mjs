import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const s=fs.readFileSync('actual_attendance.js','utf8');
const a=s.indexOf('  function addAttendance(day){'),b=s.indexOf('  function openCorrection(day,s){',a);
assert(a>=0&&b>a,'manual entry handler');
const h=s.slice(a,b);
for(const id of ['manualAttendanceEmployee','manualAttendanceInDate','manualAttendanceInTime','manualAttendanceStatus','manualAttendanceOutDate','manualAttendanceOutTime','manualAttendanceReason','manualAttendanceSave'])assert(h.includes(id),id);
assert(h.includes('S.employees.map(e=>'));
assert(!h.includes('prompt('));
assert(h.includes('outFields.hidden='));
assert(h.includes('save.disabled=true'));
// Complete shifts are now one atomic server-side write; failure must not
// leave an IN-only correction. Incomplete IN still uses the legacy RPC.
assert(h.includes("rpc('admin_add_completed_attendance_shift'"),'complete shift uses atomic RPC');
assert(h.includes("rpc('admin_correct_event'"),'one-sided IN path remains');
assert(h.includes('result?.ok!==true'),'failure is surfaced');
assert(!h.includes('출근만 저장됐습니다'),'partial pair failure no longer a supported outcome');
assert(!h.includes('addedOut?.ok===false'),'two-request OUT is forbidden');
assert(h.includes('await loadMonth();renderDay(inDay)'));
console.log('PASS manual attendance form contract');

// HH:MM regression from real modal: PR #723 fixed the old prompt, but a later form
// reintroduced an escaped-backslash regex. Test the actual regex literals, not copies.
const validationExpressions=[...h.matchAll(/(\/\^[^\n]+?\$\/)\.test\((?:inTime|outTime)\)/g)].map(m=>m[1]);
assert.equal(validationExpressions.length,2,'IN/OUT guards must both use HH:MM regex');
for(const expression of validationExpressions){
  const pattern=vm.runInNewContext(expression);
  for(const value of ['00:00','09:00','22:00','23:59','01:29'])assert(pattern.test(value),`must accept ${value}: ${expression}`);
  for(const value of ['9:00','24:00','23:60','09:0',''])assert(!pattern.test(value),`must reject ${value}: ${expression}`);
}
console.log('PASS manual attendance real modal HH:MM validator regression');
