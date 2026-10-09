import fs from 'node:fs';import assert from 'node:assert/strict';
const s=fs.readFileSync('index.html','utf8');
assert.match(s,/const payrollCandidates=emps\.filter\(e=>isActive\(e\)\|\|eventEmployeeIds\.has\(Number\(e\.id\)\)\)/);
assert.doesNotMatch(s,/const payrollCandidates=emps\.filter\(e=>!isHiddenInhaTestEmployee/);
assert.match(s,/for\(const rec of R\.rows\)\{[\s\S]*?payRows\.push/);
assert.match(s,/rec\.breakMode==="IGNORED"\?"미고려"/);
assert.match(s,/const APP_VERSION="v0\.183"/);
console.log('PASS active TEST employee included in payroll and sheet payload');
