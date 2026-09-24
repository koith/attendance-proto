import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.10";'));
assert(html.includes('.payroll-employee-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:start;overflow-x:hidden;overscroll-behavior-x:none;touch-action:pan-y;max-width:100%}'),'payroll employee list must lock horizontal dragging');
assert(html.includes('payEmployees.className="employee-scroll-surface compact payroll-employee-grid"'),'payroll list must retain vertical scroll container');
console.log('payroll vertical-scroll lock v0.69.10: PASS');
