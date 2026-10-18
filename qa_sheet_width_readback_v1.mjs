import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('apps_script.gs','utf8');
const start=source.indexOf('  var widthVerifiedMonths=0, widthVerifiedColumns=0;');
// Isolate only the width readback excerpt. Unrelated post-verification
// maintenance hooks run in _writeMonth but are exercised by their own fixtures.
const maintenanceStart=source.indexOf('\n  var legacyFormatCleanup=',start);
const end=maintenanceStart>=0?maintenanceStart:source.indexOf('\n  return {column_resize_applied:',start);
assert.ok(start>=0 && end>start,'Extract actual Apps Script column width verification');
const realFunctionBody=source.slice(start,end);
assert.match(realFunctionBody,/for\(var vm=1;vm<=12;vm\+\+\)/);
assert.match(realFunctionBody,/vsh\.getColumnWidth\(vc\+1\)/);
assert.match(realFunctionBody,/persistedWidth<requiredWidth/);
assert.match(source,/column_width_readback_verified:true,verified_month_tabs:widthVerifiedMonths/);
const validate=new Function('ss','width','sharedWidths',
  realFunctionBody+'\nreturn {months:widthVerifiedMonths,columns:widthVerifiedColumns};');
function workbook(overrides={}){
 return {getSheetByName(name){
   if(overrides[name]===null)return null;
   const size=overrides[name]||[100,120,140];
   return {getName:()=>name,getColumnWidth:col=>size[col-1]};
 }};
}
assert.deepEqual(validate(workbook(),3,[100,120,140]),{months:12,columns:36});
assert.deepEqual(validate(workbook({'2월':[110,140,180]}),3,[100,120,140]),{months:12,columns:36},
  'Wider columns must stay accepted');
assert.throws(()=>validate(workbook({'9월':[100,119,140]}),3,[100,120,140]),
  /COLUMN_WIDTH_READBACK_MISMATCH/, 'A clipped historic month must fail sync verification');
assert.throws(()=>validate(workbook({'11월':null}),3,[100,120,140]),
  /COLUMN_WIDTH_MONTH_MISSING/, 'Missing month must fail readback');
console.log('PASS persisted text-based column widths in all 12 months, clipped/missing fail closed');
