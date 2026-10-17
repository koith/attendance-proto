// Meeting 2026-10-17 payroll display and narrative-width regression.
// Exercises real checked-in Apps Script helpers; no Google Sheet or user data writes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('apps_script.gs','utf8');
const context=vm.createContext({});
vm.runInContext(source,context);
assert.equal(typeof context._payrollGrossTotal,'function');
assert.equal(typeof context._attendanceMemoColumn,'function');

const estimated={header:['직원명','예상 세전급여'],rows:[
 ['직원A','1,000원'],['직원B','25,000원'],['직원C',1500],['직원D','-500원']
]};
const before=JSON.stringify(estimated);
let result=context._payrollGrossTotal(estimated);
assert.equal(result.valid,true);
assert.equal(result.amount,27000);
assert.equal(result.label,'세전 합계 27,000원');
assert.equal(JSON.stringify(estimated),before,'display-only projection must not mutate source values');

const closed={header:['직원명','예상 세전급여','확정 세전급여'],rows:[
 ['직원A','999,999원','2,500,000원'],['직원B','9원','300,000원']
]};
result=context._payrollGrossTotal(closed);
assert.equal(result.amount,2800000,'immutable confirmed gross must be preferred');
assert.equal(result.label,'세전 합계 2,800,000원');

result=context._payrollGrossTotal({header:['직원명','예상 세전급여'],rows:[['직원A','급여 산정 중']]});
assert.equal(result.valid,false);
assert.equal(result.amount,null);
assert.equal(result.label,'세전 합계 확인 필요','a missing/invalid salary must not be treated as zero');

result=context._payrollGrossTotal({header:['직원명','예상 세전급여'],rows:[['직원A','99999999999999999999999원']]});
assert.equal(result.valid,false,'unsafe integer amounts must not be displayed as precise totals');

result=context._payrollGrossTotal({header:['직원명','예상 세전급여'],rows:[]});
assert.equal(result.amount,0);

const rows=[
 ['10월 근태 · 급여 보고서'],
 ['마지막 동기화: 2026-10-17'],
 [],
 ['급여 집계','세전 합계 2,800,000원'],
 ['직원명','급여형태'],
 ['직원A','시급제'],
 [],
 ['근태 현황'],
 ['날짜','직원명',...Array.from({length:11},(_,i)=>'항목'+i),'정정사유'],
 ['2026-10-10','직원A',...Array(11).fill(''),'긴 근태 정정사유 '.repeat(200)]
];
const memo=context._attendanceMemoColumn(rows);
assert.equal(memo.row,8);
assert.equal(memo.col,13,'narrative column must be detected by actual table header, not positional guess');
assert.ok(rows[9][13].length>1000,'long memo fixture');
assert.equal(context._attendanceMemoColumn([['날짜','직원명']]).col,-1);

assert.match(source,/sectionHeading\[1\]=payrollTotal\.label/,
 'immediately visible salary total must appear alongside payroll table heading');
assert.match(source,/if\(narrative\.col===pc&&pr>narrative\.row\)continue;/,
 'narrative body must be excluded from annual shared-width measurement');
assert.match(source,/setWrapStrategy\(SpreadsheetApp\.WrapStrategy\.WRAP\)/,
 'correction reasons must wrap within column N instead of overflowing into scroll area');
assert.match(source,/for\(var sm=1;sm<=12;sm\+\+\)/,
 'year-wide shared width normalization must still be applied');
assert.match(source,/getColumnWidth\(vc\+1\)/,'persisted width readback must remain mandatory');
console.log('PASS 2026-10-17 payroll gross totals (estimated/closed/invalid) and memo width exclusion');

// The actual Apps Script right-side review-space helper is exercised with
// synthetic 12-month tabs. These checks never write to production Sheets.
const tabs=Array.from({length:12},(_,i)=>({
  title:(i+1)+'월', columns:i===0?52:14, inserts:[],clearCalls:[],
  getMaxColumns(){return this.columns;},
  insertColumnsAfter(after,count){
    assert.equal(after,this.columns);
    this.columns+=count;this.inserts.push({after,count});
  },
  getMaxRows(){return 100;},
  getLastRow(){return 80;},
  getRange(row,col,rows,cols){return {clearFormat:()=>this.clearCalls.push({row,col,rows,cols})};}
}));
const fakeBook={getSheetByName(name){return tabs.find(t=>t.title===name)||null;}};
context._ensureReportRightReviewSpace(fakeBook,14);
assert.ok(tabs.every(t=>t.columns===52));
assert.equal(tabs[0].inserts.length,0);
assert.ok(tabs.slice(1).every(t=>t.inserts.length===1&&t.inserts[0].count===38));
assert.ok(tabs.slice(1).every(t=>t.clearCalls.length===1&&t.clearCalls[0].col===15));
context._ensureReportRightReviewSpace(fakeBook,14);
assert.ok(tabs.every(t=>t.inserts.length<=1&&t.clearCalls.length<=1),
  'second refresh must not duplicate columns or clear existing user formatting');
console.log('PASS 12-tab horizontal review area, idempotent, and wrapped correction notes');


// Human-readable source projection must preserve the complete original audit
// trail for the report cell note; do not modify event/contract/payroll sources.
const audit='점주 카톡 요청: 2026-10-12 22시~익일 01:29 야간근무 복구. 원본 #5476, 후속 VOID #97 보존. GitHub #910 / 점주 카톡 요청: 2026-10-13 01:29 실제 퇴근 복구. 원본 #5478, 후속 VOID #95 보존. GitHub #910';
const expected='점주 카톡 요청: 2026-10-12 22시~익일 01:29 야간근무 복구.\n점주 카톡 요청: 2026-10-13 01:29 실제 퇴근 복구.';
assert.equal(context._readableCorrectionReason(audit),expected);
assert.equal(context._readableCorrectionReason('.'),'');
assert.equal(context._readableCorrectionReason('출근 미등록 / 출근 미등록'),'출근 미등록');
assert.equal(context._readableCorrectionReason('실제 정상 퇴근 원본시간 복원'),'실제 정상 퇴근 원본시간 복원');
assert.ok(context._correctionRowHeight(expected,135)>28);
assert.equal(context._correctionRowHeight(' ',135),28);
const attendanceFixture={
  header:['날짜','직원명','출근','퇴근','정정사유'],
  rows:[['2026-10-12','직원A','22:00','01:29',audit]]
};
const projected=context._seniorAttendanceLayout(attendanceFixture,{rows:[]});
assert.equal(projected.rows[0][13],expected);
assert.equal(projected.originalReasonNotes[0],'정정사유 원문(감사 기록):\n'+audit);
const sorted=context._sortAttendanceByDate(projected);
assert.equal(sorted.originalReasonNotes[0],projected.originalReasonNotes[0]);
assert.match(source,/reasons\.setNotes\(s\.data\.originalReasonNotes\.map/);
assert.match(source,/sh\.getRange\(1,1,sh\.getMaxRows\(\),width\)\.clear/,
 'report rewrite must not erase the empty right-side scroll area');
assert.match(source,/sh\.setRowHeight\(sheetRow,height\)/,
 'row height must expand as needed for wrapped note');
console.log('PASS original audit preservation, human-readable reason and row-height layout');
