import fs from 'node:fs';
import assert from 'node:assert/strict';

const gas=fs.readFileSync('apps_script.gs','utf8');
const edge=fs.readFileSync('edge_sync_sheet.ts','utf8');

assert.match(gas,/setValues\(out\)[\s\S]*SpreadsheetApp\.flush\(\)[\s\S]*autoResizeColumns\(1,\s*width\)[\s\S]*SpreadsheetApp\.flush\(\)/,'Apps Script must flush then auto-resize all used columns after write');
assert.match(gas,/column_resize_applied:\s*true/,'Apps Script must report resize proof');
assert.match(gas,/width_source:'actual_cell_contents'/,'Apps Script must report actual-content sizing');
assert.doesNotMatch(gas,/setColumnWidth\s*\(\s*\d+\s*,\s*\d+\s*\)/,'No fixed per-column widths');
assert.doesNotMatch(gas,/Math\.min\(/,'Long text must not be capped');
const {runInNewContext}=await import('node:vm');
let rows=[], widths=[], created=0;
const range=new Proxy({}, {get:(_,key)=>{
  if(key==='setValues')return value=>{rows=value.map(r=>r.slice());return range;};
  if(key==='getDisplayValues')return ()=>rows.map(r=>r.map(String));
  return ()=>range;
}});
const sheet=new Proxy({}, {get:(_,key)=>{
  if(key==='getMaxRows')return ()=>8000;
  if(key==='getMaxColumns')return ()=>26;
  if(key==='getRange')return ()=>range;
  if(key==='autoResizeColumns')return (_,n)=>{widths=Array(n).fill(20);};
  if(key==='getColumnWidth')return n=>widths[n-1];
  if(key==='setColumnWidth')return (n,w)=>{widths[n-1]=w;};
  return ()=>sheet;
}});
let existing=true;
const book={getSheetByName:()=>existing?sheet:null,insertSheet:()=>{created++;return sheet;},getName:()=>'2026 근태'};
const sandbox={SpreadsheetApp:{flush(){},BorderStyle:{SOLID:'SOLID'}}};
runInNewContext(gas,sandbox);
function render(value){
  sandbox._writeMonth(book,'10월','마지막 동기화: 기존값',
    {header:['날짜','직원명'],rows:[['2026-10-01',value]]},
    {header:[],rows:[]},
    {header:['직원명','예상 세전급여'],rows:[['홍길동','105,500원']]});
  assert.equal(rows[0][0],'2026년 10월 근태 · 급여 보고서');
  assert.equal(rows[5][1],value);
  assert.ok(widths[1]>=100,'Korean payroll header must remain legible even if native autofit undermeasures');
  return widths[1];
}
const short=render('홍길동');
const long=render('긴 이름을 가진 직원의 실제 표시 내용 테스트');
assert.ok(long>short,'Column must expand with real text');
assert.equal(render('홍길동'),short,'Column must shrink when real contents shrink');
existing=false;render('홍길동');assert.equal(created,1,'New month uses identical writer');
assert.doesNotMatch(gas,/autoResizeColumns[\s\S]{0,120}catch\s*\([^)]*\)\s*\{\s*\/\*[^*]*무시/,'auto-resize failure must not be silently ignored');
assert.match(edge,/SHEET_COLUMN_RESIZE_NOT_CONFIRMED/,'Edge sync must fail closed without resize proof');
assert.match(edge,/resize_scope !== "all_used_columns_after_write"/,'Edge sync must require all used columns');
assert.match(edge,/width_source !== "actual_cell_contents"/,'Edge sync must require actual-cell-content sizing');
console.log('sheet auto-resize contract: PASS');
