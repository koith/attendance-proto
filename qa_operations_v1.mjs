import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),js=fs.readFileSync('operations_v1.js','utf8'),css=fs.readFileSync('operations_v1.css','utf8');
assert.match(html,/id="tabOps"/);assert.match(html,/operations_v1\.css\?v=20260922c/);assert.match(html,/operations_v1\.js\?v=20260922c/);assert.match(html,/h==="ops"/);
for(const n of ['operationsSummary','operationsTransactions','operationsImports','operationsAnalytics','inventoryOverview','inventoryMovements','recipeList','reconciliationIssues','seedOperationsDemo','clearOperationsDemo']) assert.match(html,new RegExp(n));
for(const t of ['대시보드','매출','매입','재고','레시피','대사','데이터 연동','예시 데이터']) assert.ok(js.includes(t));
for(const s of ['RAW','거래원장','재고','대사']) assert.ok(js.includes(s));
assert.ok(css.includes('var(--brand-700)'));assert.ok(!css.includes('#2563eb'));assert.ok(css.includes('max-width:100%'));assert.ok(css.includes('min-width:0'));assert.ok(css.includes('@media(max-width:430px)'));assert.ok(css.includes('@media(max-width:360px)'));assert.ok(html.includes('overflow-x:hidden'));
console.log('operations v3 regression + mobile containment + demo fixture: PASS');