import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the checked-in Apps Script doPost() against a fake workbook.
// This must never access production Apps Script, Sheets, people or payroll.
const src=fs.readFileSync('apps_script.gs','utf8');
const context=vm.createContext({});
vm.runInContext(src,context);
context.SHARED_SECRET='fixture-only-secret';
context._json=x=>x;
// Local fake lock: production uses Apps Script LockService for serialized report writes.
context.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
let bookCalls=0,writeCalls=0;
const book={getId:()=> 'test-only',getUrl:()=> 'https://example.invalid/test-only',
 getName:()=> '2026 근태'};
context._annualBook=()=>{bookCalls++;return book;};
context._writeMonth=()=>{writeCalls++;return {column_width_readback_verified:true};};
const sections=()=>({attendance:{header:['날짜','직원명'],rows:[['2026-10-01','테스트']]},
 sessions:{header:['직원명'],rows:[['테스트']]},
 payroll:{header:['직원명','예상 세전급여'],rows:[['테스트','12,000원']]}});
const input=()=>({secret:'fixture-only-secret',ym:'2026-10',store_key:'QA_STORE_999',
 synced_at:'fixture timestamp',status_label:'테스트',...sections()});
const post=p=>context.doPost({postData:{contents:JSON.stringify(p)}});
function rejects(mutator,reason){
 const body=input();mutator(body);
 const oldBooks=bookCalls,oldWrites=writeCalls;
 const result=post(body);
 assert.equal(result.ok,false,JSON.stringify(result));
 assert.equal(result.error,reason,JSON.stringify(result));
 assert.equal(bookCalls,oldBooks,'bad source must not open/create/rename any Sheet');
 assert.equal(writeCalls,oldWrites,'bad source must not clear previous monthly values');
}
assert.equal(post(input()).ok,true,'valid source still syncs');
assert.equal(bookCalls,1);assert.equal(writeCalls,1);
rejects(x=>{x.attendance.rows=[['2026-10-01']];},'BAD_ROW_SHAPE');
rejects(x=>{x.attendance.rows=[['2026-10-01','테스트','초과값']];},'BAD_ROW_SHAPE');
rejects(x=>{x.attendance.rows=[{날짜:'2026-10-01'}];},'BAD_ROW_SHAPE');
rejects(x=>{x.payroll.rows=[['테스트',{gross:12000}]];},'BAD_CELL_VALUE');
rejects(x=>{x.payroll.rows=[['테스트',['12,000원']]];},'BAD_CELL_VALUE');
rejects(x=>{x.sessions.header=null;},'BAD_SECTION_SHAPE');
rejects(x=>{x.attendance.header=['날짜',42];},'BAD_HEADER_VALUE');
rejects(x=>{x.sessions.rows=[['테스트','초과열']];},'BAD_ROW_SHAPE');
rejects(x=>{x.payroll.rows=[['테스트','x'.repeat(50001)]];},'BAD_CELL_VALUE');
rejects(x=>{x.attendance.header=[];},'BAD_SECTION_SIZE');
rejects(x=>{x.payroll.rows=Array.from({length:20001},()=>['테스트','1원']);},'BAD_SECTION_SIZE');
rejects(x=>{x.attendance=null;},'MISSING_SECTIONS');
rejects(x=>{x.ym='2026-13';},'BAD_YM');
rejects(x=>{x.secret='wrong';},'UNAUTHORIZED');
const empty=input();for(const key of ['attendance','sessions','payroll'])empty[key]={header:[],rows:[]};
assert.equal(post(empty).ok,true,'legitimate no-employee month must still sync');
const safe=input();safe.payroll.rows=[['테스트',null]];
assert.equal(post(safe).ok,true,'explicit null fields may be projected to a review marker');
assert.equal(bookCalls,3);assert.equal(writeCalls,3);
assert.ok(src.indexOf('_validateSheetPayload(body)') < src.indexOf('_annualBook(storeKey, year)'),
 'source guard must run before sheet access');
assert.match(src,/getRange\(1,1,sh\.getMaxRows\(\),width\)\.clear/,
 'existing formatting and layout writer remains unchanged');
console.log('PASS QA-05 validated grids rejected before workbook access or any clear; valid/empty sheet compatible');
