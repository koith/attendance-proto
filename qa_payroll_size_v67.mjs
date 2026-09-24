import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(/const APP_VERSION="v\d+";/.test(html),'APP_VERSION required');
assert(html.includes('#payList .kpi-row .kpi-value{font-size:.775rem!important'),'payroll total must be half-sized at .775rem');
assert(html.includes('#payList .employee-scroll-surface .row .payroll-gross-value{font-size:1.36rem!important'),'employee gross must remain 1.36rem');
assert(html.includes('class="payroll-gross-value"'),'employee gross markup class required');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,s] of scripts.entries()){try{new Function(s)}catch(e){throw new Error('inline script '+i+' syntax error: '+e.message)}}
console.log('payroll size QA: PASS');
