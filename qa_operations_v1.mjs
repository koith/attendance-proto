import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),js=fs.readFileSync('operations_v1.js','utf8'),css=fs.readFileSync('operations_v1.css','utf8');
assert.match(html,/id="tabOps"/);assert.match(html,/operations_v1\.css/);assert.match(html,/operations_v1\.js/);assert.match(html,/h==="ops"/);
for(const n of ['operationsSummary','operationsTransactions','inventoryItems','operationsImports']) assert.match(html,new RegExp(n));
for(const t of ['대시보드','매출','매입','재고','데이터 연동']) assert.ok(js.includes(t));
assert.ok(css.includes('var(--brand-700)'));assert.ok(!css.includes('#2563eb'));
console.log('operations v1 regression: PASS');