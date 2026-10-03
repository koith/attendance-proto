import fs from 'node:fs';

const src = fs.readFileSync('apps_script.gs', 'utf8');
function ok(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exitCode = 1;
  } else console.log('PASS:', name);
}

// A new calendar month must be created through the same canonical writer as an existing month.
ok('annual book ensures all 12 month tabs', /for\(var m=1;m<=12;m\+\+\)[\s\S]*insertSheet\(name\)/.test(src));
ok('doPost always routes target month through _writeMonth', /_writeMonth\(ss, month \+ '월', meta, body\.attendance, body\.sessions, body\.payroll\)/.test(src));
ok('_writeMonth creates missing target tab', /getSheetByName\(name\); if\(!sh\) sh=ss\.insertSheet\(name\)/.test(src));

// Both first-write and later refreshes must fully replace stale formatting before applying one design path.
ok('every refresh clears full grid including stale formats', /getRange\(1,1,sh\.getMaxRows\(\),sh\.getMaxColumns\(\)\)\.clear\(\{contentsOnly:false\}\)/.test(src));
ok('canonical writer applies report title style', /getRange\(1,1,1,width\)\.setBackground\(green\)\.setFontColor\(white\)/.test(src));
ok('canonical writer applies section style', /setBackground\(pale\)\.setFontColor\(headerGreen\)/.test(src));
ok('canonical writer applies dark table headers', /setBackground\(headerGreen\)\.setFontColor\('#ffffff'\)/.test(src));
ok('canonical writer applies cell borders', /setBorder\(true,true,true,true,true,true/.test(src));
ok('canonical writer restores date display', /h==='날짜'\) range\.setNumberFormat\('yyyy-mm-dd'\)/.test(src));
ok('canonical writer restores time and duration display', /\['출근','퇴근','실근무','총근무','야간근무'\][\s\S]*setNumberFormat\('\[h\]:mm'\)/.test(src));
ok('canonical writer auto-resizes from actual contents', /autoResizeColumns\(1,width\)/.test(src));
ok('no fixed column width survives canonical writer', !/setColumnWidth\s*\(\s*\d+\s*,\s*\d+\s*\)/.test(src));

if (process.exitCode) process.exit(process.exitCode);
console.log('PASS: new month and refresh share the same report-format path');
