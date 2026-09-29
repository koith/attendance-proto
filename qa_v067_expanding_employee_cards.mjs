import fs from 'node:fs';import assert from 'node:assert/strict';
const i=fs.readFileSync('index.html','utf8');
assert(i.includes('const APP_VERSION="v0.67"'));
assert(i.includes('#view:has(#adEmps) .employee-list-mask{')&&i.includes('overflow-y:visible!important'));
assert(i.includes('#view:has(#payList) #payList>.payroll-employee-grid{')&&i.includes('height:auto!important'));
assert(i.includes('the page owns vertical scrolling'));
console.log('v0.67 expanding employee-card lists QA PASS');
