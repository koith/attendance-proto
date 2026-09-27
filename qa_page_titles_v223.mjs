import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('index.html','utf8');
const ops=fs.readFileSync('operations_v1.js','utf8');
const opsRef=fs.readFileSync('operations_reference_ui_v208.js','utf8');
const recipe=fs.readFileSync('recipe_access_v220.js','utf8');

assert.ok(html.includes('const APP_VERSION="v0.01"'));
assert.ok(html.includes('.page-title,.hq-title-row h2{')&&html.includes('font-size:1.25rem!important')&&html.includes('font-weight:750'),'common title typography must be defined');
assert.ok(html.includes('<h2 class="page-title">출퇴근</h2>'),'POS title must exist');
assert.ok(html.includes('<h2 class="page-title">직원 관리</h2>'),'employee management title must exist');
assert.ok(html.includes('<h2 class="page-title">급여</h2>'),'payroll title must exist');
assert.ok(html.includes('upgradeLegacyPageTitle(".store-hours-page>.section-t","운영시간")'),'hours title must use the common title');
assert.ok(html.includes('.hq-title-row h2'),'dashboard title must share the common typography');
assert.ok(ops.includes('ops-head page-title-row')&&ops.includes('h2 class="page-title"'),'operations screens must use the common title');
assert.ok(opsRef.includes('ops-head page-title-row')&&opsRef.includes('h2 class="page-title"'),'reference operations screens must use the common title');
assert.ok(recipe.includes('recipe-v220-head page-title-row')&&recipe.includes('<h2 class="page-title">레시피</h2>'),'recipe screen must use the common title');
assert.ok(html.includes('.payroll-page-title{flex:0 0 auto}'),'payroll title must not collapse the card layout');

console.log('page titles v223 QA PASS');
