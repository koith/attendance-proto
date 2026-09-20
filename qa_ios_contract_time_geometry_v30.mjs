import fs from 'node:fs';import assert from 'node:assert/strict';
const css=fs.readFileSync('employment_contracts.css','utf8'),html=fs.readFileSync('employment_contracts.html','utf8');
assert(css.includes('.subcard.compact .timepair input[type="time"]'));
assert(css.includes('height:38px!important;min-height:38px!important;max-height:38px!important'));
assert(css.includes('-webkit-appearance:none!important;appearance:none!important'));
assert(html.includes('employment_contracts.css?v=20260920i'));
assert(html.includes('employment_contracts_v3.js?v=20260920i'));
console.log('ios contract time geometry v30: PASS');
