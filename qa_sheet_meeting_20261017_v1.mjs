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
assert.match(source,/setWrapStrategy\(SpreadsheetApp\.WrapStrategy\.CLIP\)/,
 'memo text must be clipped visually, not deleted');
assert.match(source,/for\(var sm=1;sm<=12;sm\+\+\)/,
 'year-wide shared width normalization must still be applied');
assert.match(source,/getColumnWidth\(vc\+1\)/,'persisted width readback must remain mandatory');
console.log('PASS 2026-10-17 payroll gross totals (estimated/closed/invalid) and memo width exclusion');
