import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('index.html','utf8');
const actual=fs.readFileSync('actual_attendance.css','utf8');
const subHtml=fs.readFileSync('substitution.html','utf8');
const sub=fs.readFileSync('substitution_v2.js','utf8');
const ops=fs.readFileSync('operations_v1.css','utf8');

assert(index.includes('const APP_VERSION="v0.69.3";'),'version must be v0.69.3');
assert(index.includes('.badge-on{display:inline-flex'),'POS working badge must use canonical pill geometry');
assert(index.includes('.emp .badge-off,.badge-off{display:inline-flex'),'neutral/off badge must use canonical pill geometry');
assert(index.includes('class="badge work">근무중</span>'),'admin/current-record working state must use canonical work badge');

assert(actual.includes('.pill{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:600;padding:3px 9px'),'actual attendance pill geometry must match canonical');
assert(actual.includes('.pill.warn{border-color:#e8d9a8'),'actual attendance warning tone required');

assert(subHtml.includes('.badge{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:600;padding:3px 9px'),'substitution badge geometry must match canonical');
assert(sub.includes("const badgeTone=s=>"),'substitution semantic badge tones required');

assert(ops.includes('.ops-status{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:600;padding:3px 9px'),'operations status geometry must match canonical');
assert(ops.includes('.ops-status.ok{border-color:#bfe3cb'),'operations success tone required');
assert(ops.includes('.ops-status.warn{border-color:#e8d9a8'),'operations warning tone required');

new Function(sub);
console.log('status badge unification v0.69.3: PASS');
