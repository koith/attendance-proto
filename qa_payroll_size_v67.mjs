import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v67";'),'APP_VERSION must be v67');
assert(html.includes('id="appVersion">v67</div>'),'visible version must be v67');
assert(html.includes('#payList .kpi-row .kpi-value{font-size:1.55rem!important'),'payroll total must be 1.55rem');
assert(html.includes('#payList .employee-scroll-surface .row .payroll-gross-value{font-size:1.36rem!important'),'employee gross must be 1.36rem');
assert(html.includes('class="payroll-gross-value"'),'employee gross markup class required');
assert(!html.includes('font-size:.68rem;line-height:1.15">${pay.gross.toLocaleString()}원'),'old tiny employee gross size must be gone');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,s] of scripts.entries()){try{new Function(s)}catch(e){throw new Error('inline script '+i+' syntax error: '+e.message)}}
console.log('payroll size v67 QA: PASS');
