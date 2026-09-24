import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('const APP_VERSION="v66";'),'APP_VERSION must be v66');
assert(html.includes('id="appVersion">v66</div>'),'visible version must be v66');
assert(html.includes('.app-version-badge{position:absolute;top:44px;right:18px'),'version badge must sit below the fixed test toggle zone');
assert(html.includes('id="empCount">총 0명</div><div class="grid employee-scroll-surface" id="empGrid"'),'POS count must stay outside employee scroll surface');
assert(html.includes('document.getElementById("empCount").textContent=`총 ${emps.length}명`;'),'POS count must reflect active punchable employees');

const test=fs.readFileSync('test_mode_ui_v1.js','utf8');
assert(test.includes("#testModeCorner{position:fixed"),'test mode corner control expected');
assert(test.includes("top:calc(env(safe-area-inset-top) + 6px)"),'test toggle top zone expected');

const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,s] of scripts.entries()){try{new Function(s)}catch(e){throw new Error('inline script '+i+' syntax error: '+e.message)}}
console.log('POS count + version badge v66 QA: PASS');
