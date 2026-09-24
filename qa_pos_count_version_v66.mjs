import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const v=html.match(/const APP_VERSION="(v\d+)";/)?.[1];
assert(v,'APP_VERSION required');
assert(html.includes(`id="appVersion">${v}</span>`),'visible version must match APP_VERSION');
assert(html.includes('.app-version-badge{display:inline-block;margin-left:10px'),'version badge must sit beside store location with spacing');
assert(html.includes('id="empCount">총 0명</div><div class="grid employee-scroll-surface" id="empGrid"'),'POS count must stay outside employee scroll surface');
assert(html.includes('document.getElementById("empCount").textContent=`총 ${emps.length}명`;'),'POS count must reflect active punchable employees');
const test=fs.readFileSync('test_mode_ui_v1.js','utf8');
assert(test.includes("#testModeCorner{position:fixed"),'test mode corner control expected');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const [i,s] of scripts.entries()){try{new Function(s)}catch(e){throw new Error('inline script '+i+' syntax error: '+e.message)}}
console.log('POS count + version badge QA: PASS',v);
