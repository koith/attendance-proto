import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69";'),'APP_VERSION must be v0.69');
assert(html.includes('id="appVersion">v0.69</span>'),'visible version must be v0.69');
assert(html.includes('class="payroll-total-value" style="font-size:.775rem!important'),'payroll total must use isolated inline-important size');
assert(!html.includes('class="kpi-value" style="color:var(--ink)"'),'payroll total must not use legacy kpi-value class');
assert(html.includes('#payList .employee-scroll-surface .row .payroll-gross-value{font-size:1.36rem!important'),'employee gross must stay 1.36rem');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,s] of scripts.entries()){try{new Function(s)}catch(e){throw new Error('inline script '+i+' syntax error: '+e.message)}}
console.log('payroll total hardfix v0.69: PASS');
