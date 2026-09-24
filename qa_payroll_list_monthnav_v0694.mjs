import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.4";'),'version must be v0.69.4');
assert(html.includes('.pay-month-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px'),'pay month nav must be true 3-column grid');
assert(html.includes('.pay-month-nav input[type=month]{width:100%;min-width:0;text-align:center;text-align-last:center'),'month value must be centered');
assert(html.includes('payTitle.textContent="직원별 급여";'),'employee payroll list title required');
assert(html.indexOf('payTitle.textContent="직원별 급여";') < html.indexOf('payEmployees.className="employee-scroll-surface compact"'),'title must stay outside/above scroll list');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,s] of scripts.entries()){try{new Function(s)}catch(e){throw new Error('inline script '+i+' syntax error: '+e.message)}}
console.log('payroll list/month nav v0.69.4: PASS');
