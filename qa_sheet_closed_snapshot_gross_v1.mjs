import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real Apps Script projection with an actual Edge snapshot layout,
// using synthetic payroll data only. No production employee, DB, or Sheet writes.
const gas=fs.readFileSync('apps_script.gs','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const slice=(source,start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Cannot locate '+start);
 return source.slice(a,b);
};
const gasProjection=slice(gas,'function _seniorPayrollLayout(section,attendance){','\nfunction _seniorAttendanceLayout');
const edgeSnapshot=slice(edge,'function snapshotRows(snap,ym){','\nasync function buildReport(');
const gasContext=vm.createContext({});
vm.runInContext(gasProjection,gasContext);
const edgeContext=vm.createContext({});
vm.runInContext(edgeSnapshot,edgeContext);
const project=gasContext._seniorPayrollLayout;
const snapshot=edgeContext.snapshotRows;
assert.equal(typeof project,'function');
assert.equal(typeof snapshot,'function');

const source=[
 {store_id:1,employee_name:'Synthetic Hourly',hours:12.5,wage:13000,
  base_pay:162500,juhyu_pay:50000,adjust:1000,gross_pay:249500},
 {store_id:1,employee_name:'Synthetic Monthly',hours:0,wage:0,
  base_pay:2600000,juhyu_pay:0,adjust:0,gross_pay:2600000}
];
const expected=source.map(s=>s.gross_pay.toLocaleString('ko-KR')+'원');
const closedSource=snapshot(source,'2026-09');
assert.deepEqual([...closedSource.header],
 ['직원명','총 실근무시간','시급','기본급','주휴','조정','확정 세전급여'],
 'Canonical closed snapshot must retain confirmed gross');
const syntheticAttendance={header:['직원명','급여산정시간'],rows:[
 ['Synthetic Hourly','05:15'],['Synthetic Hourly','07:15']
]};
const closed=project(closedSource,syntheticAttendance);
assert.equal(closed.header.length,14);
assert.equal(closed.header[13],'확정 세전급여');
assert.equal(closed.rows[0][13],expected[0],
 'Confirmed hourly gross must survive Apps Script projection');
assert.equal(closed.rows[1][13],expected[1],
 'Confirmed monthly salary must survive Apps Script projection');
assert.equal(closed.rows[0][1],'시급제');
assert.equal(closed.rows[1][1],'월급제');
assert.equal(closed.rows[0][2],'12시간 30분','Snapshot total hours must be visible');
assert.equal(closed.rows[0][4],'12:30','Per-row payable time keeps attendance sum');
assert.equal(closed.rows[0][8],'—',
 'Unavailable historical night allowance must not be falsely displayed as 0원');
assert.equal(closed.rows[0][7],'—',
 'Historical night allowance enabled status must not be fabricated');
assert.equal(closed.rows[0][11],'—',
 'Unavailable historical break compensation must not be falsely reported');
assert.equal(closed.rows[0][9],'50,000원');
assert.equal(closed.rows[0][12],'1,000원');

const openSource={header:['직원명','시급','총근무','야간근무',
 '가산 포함 급여산정시간','기본급','야근수당적용여부','야근수당',
 '주휴','휴게 제공 여부','휴게수당','조정','예상 세전급여'],
 rows:[['Synthetic Hourly','13,000원','12:30','03:00','12:30','162,500원',
 '미적용','0원','50,000원','미제공','20,000원','1,000원','233,500원']]};
const open=project(openSource,syntheticAttendance);
assert.equal(open.header[13],'예상 세전급여');
assert.equal(open.rows[0][13],'233,500원');
assert.equal(open.rows[0][7],'미적용');
assert.equal(open.rows[0][8],'0원');
assert.equal(open.rows[0][11],'20,000원');
assert.equal(open.rows[0][2],'12:30');
assert.equal(open.rows[0][4],'12:30');
assert.ok(gas.includes("if(gross<=0) gross=payroll.header.indexOf('확정 세전급여')+1"),
 'Confirmed salary column must retain gross emphasis');
console.log('PASS real closed-snapshot and estimated payroll projection; confirmed gross visible, no invented allowance zeros');
