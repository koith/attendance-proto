import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8'),js=fs.readFileSync('operations_v1.js','utf8'),css=fs.readFileSync('operations_v1.css','utf8');
for(const route of ['report','admin','pay','hours','sales','inventory','recipe']) assert.ok(html.includes('"'+route+'"'));
for(const label of ['직원 관리','급여','운영시간','레시피']) assert.ok(html.includes(label));
assert.ok(html.includes('const tabs=Number(CURRENT_STORE_ID)===1'));
assert.ok(html.includes('[["report","리포트"],["admin","직원 관리"],["pay","급여"],["hours","운영시간"],["sales","매출·매입"],["inventory","재고"]]'));
assert.ok(html.includes(': [["admin","직원 관리"],["pay","급여"],["hours","운영시간"]]'));
assert.ok(html.includes('else if(["report","sales","inventory","ops"].includes(h)&&Number(CURRENT_STORE_ID)!==1){location.hash="#admin";return;}'));
assert.ok(html.includes('[["report","리포트"]'));
assert.ok(html.includes('["inventory","재고"]'));
assert.ok(js.includes('window.renderOperations=shell'),'Keep private operations renderer for later development');
assert.ok(!html.includes('>매장운영</a>'));
for(const tab of ['dashboard','inquiry','inventory']) assert.ok(js.includes('tab==="'+tab+'"')||js.includes(tab+':["'),'Private operations code must be preserved for '+tab);
assert.ok(html.includes('renderRecipeHub()'),'recipe must use the dedicated top-level recipe renderer');
assert.ok(!html.includes('["products","상품배포"]'),'product deployment must not be an admin subtab');
assert.ok(html.includes('window.openHqProductModal?.()'),'dashboard product button must open the modal directly');
for(const text of ['데이터 수집','파일 업로드','메뉴 카테고리','일괄 등록','수동 등록','레시피 조회 · 수정','현재 잔고는 팝업을 연 시점 기준','CSV 파일을 선택하면','수집 요청 대기']) assert.ok(js.includes(text));
assert.ok(!js.includes('권장 발주량은 현재 단계에서'));assert.ok(!js.includes('현재 재고가치'));assert.ok(!js.includes('CSV는 원본 행을 먼저'));
assert.ok(js.includes('openOpsModal("collect")'));assert.ok(js.includes('openOpsModal("upload")'));
assert.ok(css.includes('.ops-stock-chart'));assert.ok(css.includes('.ops-modal'));assert.ok(css.includes('.admin-subtabs-wide'));assert.ok(css.includes('.ops-ingredient-row'));assert.ok(css.includes('.ops-stock-grid'));assert.ok(css.includes('.ops-import-sheet'));assert.ok(css.includes('.ops-source-action .ops-status'));assert.ok(css.includes('.ops-recipe-thumb'));assert.ok(js.includes('recipeThumbnail'));assert.ok(js.includes('thumbnail_url'));assert.ok(html.includes('p_thumbnail_url'));assert.ok(css.includes('justify-content:center'));assert.ok(html.includes('admin_recipe_list_v2'));assert.ok(html.includes('admin_recipe_save'));
new Function(js);
for(const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) new Function(m[1]);
console.log('operations navigation/inventory/recipe/HQ products: PASS');

import './qa_operations_real_data_only_v1.mjs';

import './qa_operations_csv_integrity_v1.mjs';

import './qa_operations_real_ledger_export_v1.mjs';
