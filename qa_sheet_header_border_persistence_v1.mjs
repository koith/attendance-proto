import fs from 'node:fs';
import assert from 'node:assert/strict';

// The actual 10월 sheet had no header bottom-border while blank months did.
// Adjacent cell borders are shared in Google Sheets; applying data-row borders
// last can overwrite the lower edge of the preceding header row.
const src=fs.readFileSync('apps_script.gs','utf8');
const start=src.indexOf('  sections.forEach(function(s,i){\n    var sr=sectionRows[i]');
const end=src.indexOf('  // Apply display formats',start);
assert.ok(start>=0&&end>start,'Canonical sheet section formatter exists');
const section=src.slice(start,end);
const body=section.indexOf('.setBorder(true,true,true,true,true,true,line,SpreadsheetApp.BorderStyle.SOLID)');
const head=section.lastIndexOf(".setBorder(true,true,true,true,true,true,'#9fb2a6',SpreadsheetApp.BorderStyle.SOLID)");
assert.ok(body>=0&&head>body,
 'Restore the header border AFTER the adjoining data border, never before it');
assert.ok(section.includes('if(dr.count){')&&section.includes('}else{'),
 'Both populated and empty table sections must take the canonical header outline');
assert.equal(section.split(".setBorder(true,true,true,true,true,true,'#9fb2a6',SpreadsheetApp.BorderStyle.SOLID)").length-1,1,
 'Only one final header border is authoritative');
assert.match(section,/getRange\(hr,1,1,s\.data\.header\.length\)\.setBackground\(headerGreen\)\.setFontColor\('#ffffff'\)/);
assert.match(src,/sh\.setHiddenGridlines\(true\)/);
assert.match(src,/getRange\(dr\.first,1,dr\.count,s\.data\.header\.length\)\.setBackground\(white\)/);
console.log('PASS header bottom border persists after populated and empty Sheet report section styling');
