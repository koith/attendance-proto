import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(!html.includes('escapeHtml('),'index.html must not call undefined escapeHtml');
assert(html.includes('function safeHtml('),'safeHtml helper must exist');
const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert(scripts.length>0,'inline app script must exist');
for(const [i,s] of scripts.entries()){
  try{ new Function(s); }catch(e){ throw new Error('inline script '+i+' syntax error: '+e.message); }
}
assert(html.includes('bindAddModal();'),'employee onboarding boot binding expected');
assert(html.includes('route();'),'app route boot expected');
console.log('index startup smoke v1: PASS');
