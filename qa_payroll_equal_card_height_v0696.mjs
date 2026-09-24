import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.6";'),'version must be v0.69.6');
assert(html.includes('.payroll-employee-card{height:74px;min-height:74px;max-height:74px'),'payroll cards must use equal fixed height');
assert(html.includes('.payroll-employee-payline{min-height:1.56rem'),'pay line space must be reserved');
assert(html.includes('card.className="row payroll-employee-card"'),'payroll cards need equal-height class');
assert(html.includes(":'<span aria-hidden="true">&nbsp;</span>'"),'missing-pay rows must reserve pay line');
console.log('payroll equal card height v0.69.6: PASS');
