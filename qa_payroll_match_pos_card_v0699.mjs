import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.9";'));
assert(html.includes('.emp{\n    position:relative; height:88px; min-height:88px;'),'POS card must remain 88px');
assert(html.includes('.payroll-employee-card{height:88px;min-height:88px;max-height:88px'),'payroll card must match POS height');
assert(html.includes('border-radius:var(--r);padding:14px 16px!important;justify-content:center'),'payroll desktop card geometry must match POS');
assert(html.includes('card.style.cssText="flex-direction:column;align-items:stretch;gap:4px"'),'payroll internal vertical gap must align to POS');
console.log('payroll matches POS card geometry v0.69.9: PASS');
