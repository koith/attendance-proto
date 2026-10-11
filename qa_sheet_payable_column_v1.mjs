import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=fs.readFileSync('apps_script.gs','utf8');
const a=source.indexOf('function _seniorPayrollLayout('),b=source.indexOf('function _sortAttendanceByDate(');
assert(a>=0&&b>a);
const context={};vm.createContext(context);vm.runInContext(source.slice(a,b),context);
const attendance={header:['날짜','직원명','실근무','급여산정시간'],rows:[['2026-10-01','직원A','5:00','4:30'],['2026-10-02','직원A','2:00','1:45'],['2026-10-03','직원B','1:00','—']]};
const payroll={header:['직원명','시급','총근무','야간근무','기본급'],rows:[['직원A','10,000원','7:00','0:00','70,000원'],['직원B','10,000원','1:00','0:00','10,000원']]};
const result=context._seniorPayrollLayout(payroll,attendance);
assert.equal(result.header[3],'야간근무');assert.equal(result.header[4],'급여산정시간');assert.equal(result.header[5],'시급');
assert.equal(result.rows[0][4],'6:15');assert.equal(result.rows[1][4],'—');assert.equal(result.rows[0][5],'10,000원');
const att=context._seniorAttendanceLayout(attendance,result);assert.equal(att.header[5],'총근무');
assert.equal(att.rows[0][5],'5:00');

// When a shift is still open, the server payroll source is authoritative.
// Completed-only attendance detail must not silently reduce the pay estimate.
const liveSource={header:['직원명','시급','총근무','야간근무','기본급','가산 포함 급여산정시간'],
 rows:[['직원A','10,000원','26:05','0:00','260,833원','26:05']]};
const authoritative=context._seniorPayrollLayout(liveSource,attendance);
assert.equal(authoritative.rows[0][4],'26:05','use server payable hours including elapsed active shifts');
const openAttendance={header:['날짜','직원명','출근','퇴근','실근무','야간근무','휴게 제공 여부','급여산정시간','상태'],
 rows:[['2026-10-11','직원A','13:00','—','—','0:00','미제공','0:00','정상']]};
const projected=context._seniorAttendanceLayout(openAttendance,authoritative);
assert.equal(projected.rows[0][11],'근무중','open attendance cannot be labeled normal');

console.log('PASS sheet payable column and attendance gross header');
