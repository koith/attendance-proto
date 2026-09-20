import fs from 'node:fs';import assert from 'node:assert/strict';const h=fs.readFileSync('substitution.html','utf8'),j=fs.readFileSync('substitution_v2.js','utf8');
assert(h.includes('>← 뒤로</a>'));assert(h.includes('touch-action:manipulation'));assert(h.includes('-webkit-text-size-adjust:100%'));
assert(j.includes('maxlength="4"'));assert(j.includes("/^\\d{4}$/.test(pin)"));assert(j.includes('pin.length<4'));
assert(j.includes('e instanceof TypeError'));assert(j.includes('setTimeout(x,220)'));
assert(j.includes("substitution_request_list"));assert(j.includes("substitution_request_create"));assert(j.includes("substitution_request_respond"));assert(j.includes("substitution_clock_in"));
console.log('substitution runtime hardening: PASS');
