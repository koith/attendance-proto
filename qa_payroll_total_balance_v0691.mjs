import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.1";'),'APP_VERSION must be v0.69.1');
assert(html.includes('id="appVersion">v0.69.1</span>'),'visible version must be v0.69.1');
assert(html.includes('class="payroll-total-value" style="font-size:1.50rem!important'),'payroll total must be 1.50rem');
assert(html.includes('#payList .employee-scroll-surface .row .payroll-gross-value{font-size:1.36rem!important'),'employee gross must remain 1.36rem');
console.log('payroll total balance v0.69.1: PASS');
