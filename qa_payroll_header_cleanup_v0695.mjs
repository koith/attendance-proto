import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.5";'),'version must be v0.69.5');
assert(!html.includes('<div class="section-t">급여 정산</div>'),'redundant payroll title must be removed');
assert(!html.includes('<label>정산 월</label>'),'redundant month label must be removed');
assert(html.includes('aria-label="급여 정산 월"'),'month input must retain accessible label');
assert(html.includes('payTitle.textContent="직원별 급여";'),'employee payroll list title must remain');
console.log('payroll header cleanup v0.69.5: PASS');
