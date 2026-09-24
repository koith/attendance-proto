import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.13";'));
assert(html.includes('background:#f3f8f5;border-bottom:1px solid #e3eee7'),'employee-card header must use subtle green tint');
assert(html.includes('.employee-card-primary{display:flex;align-items:center;justify-content:space-between'),'shared header must remain common to POS and payroll');
assert(html.includes('@media(min-width:431px){#empGrid .employee-card-primary,.payroll-employee-card .employee-card-primary'),'desktop header bleed must align with both card types');
console.log('employee card soft header v0.69.13: PASS');
