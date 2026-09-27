import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const night=fs.readFileSync('payroll_night_allowance_ui_v1.js','utf8');
const policy=fs.readFileSync('VERSIONING.md','utf8');

assert.ok(html.includes('id="appVersion">v0.01</span>'));
assert.ok(html.includes('const APP_VERSION="v0.01";'));
assert.ok(policy.includes('`v0.01`부터 시작'));
assert.ok(policy.includes('`0.01`씩 올린다'));
assert.ok(html.includes('confirm("로그아웃하시겠습니까?")'));
assert.ok(html.includes('grid-auto-rows:108px!important'));
assert.ok(html.includes('height:108px!important;min-height:108px!important;max-height:108px!important'));
assert.ok(html.includes('.payroll-gross-value{font-size:.8rem!important'));
assert.ok(night.includes("card.querySelector('.payroll-card-body')||card"));

console.log('v0.01 version, logout confirmation, payroll card consistency: PASS');
