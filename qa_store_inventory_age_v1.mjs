import assert from 'node:assert/strict';
import fs from 'node:fs';

// MTG-14 contract: test the actual shipped age-panel parser and server scope.
const js=fs.readFileSync('operations_inventory_age_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const view=fs.readFileSync('operations_reference_ui_v208.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261018180500_store_inventory_age_review.sql','utf8');
assert.match(html,/operations_inventory_age_v1\.js\?v=20261018v325/);
assert.match(html,/async inventoryAgeReview\(days=60\)\{ return rpc\("admin_store_inventory_age_review",\{p_store_id:CURRENT_STORE_ID\|\|1,p_days_threshold:Number\(days\)\},true\); \}/);
assert.match(view,/id="opsInventoryAgeReview"/);
assert.match(view,/window\.openStoreInventoryAgeReview\?\.\(\)/);
assert.match(js,/window\.openStoreInventoryAgeReview=async function/);
assert.match(js,/window\.refreshStoreInventoryAgeAlert=async function/,'auto review on opening inventory');
assert.match(js,/window\.openStoreInventoryAgeReview=async function/);
assert.match(js,/Date\.now\(\)\+60000/,'search keystrokes should share cached results');
assert.match(js,/자료 확인 실패 · 안전 판정 불가/,'RPC failures must not assert stock is safe');
assert.match(js,/입고 이력 누락 시 판정 불가/,'empty ledger is not proof of safety');
assert.match(view,/id="opsInventoryAgeAlert" role="status" aria-live="polite"/);
assert.match(view,/void window\.refreshStoreInventoryAgeAlert\?\.\(\)/);

assert.match(js,/await BE\.inventoryAgeReview\(days\)/);
assert.match(js,/소비기한 만료를 의미하지 않습니다/);
assert.match(sql,/IF NOT public\.can_manage_store\(p_store_id\)/);
assert.match(sql,/s\.onboarding_status='READY'/);
assert.match(sql,/m\.is_demo IS FALSE/);
assert.match(sql,/i\.is_demo IS FALSE/);
assert.match(sql,/a\.measured_balance>0/);
assert.match(sql,/a\.last_receipt IS NOT NULL/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.admin_store_inventory_age_review\(bigint,integer\) FROM PUBLIC,anon/);
assert.doesNotMatch(sql,/\bUPDATE\s+public\.inventory_movements\b|\bDELETE\s+FROM\s+public\.inventory_movements\b|\bINSERT\s+INTO\s+public\.inventory_movements\b/i);
const from=js.indexOf('function ageReviewRows(');
const to=js.indexOf('let ageReviewCache=',from);
assert.ok(from>0&&to>from);
const parser=Function(js.slice(from,to)+'\nreturn ageReviewRows')();
const row={item_id:7,item_name:'장기 입고 원두',unit:'g',on_hand:20,last_receipt_on:'2026-06-01',last_usage_on:'2026-07-03',days_since_receipt:139};
assert.deepEqual(parser([row]),[{id:7,days:139,balance:20,unit:'g',name:'장기 입고 원두',receipt:'2026-06-01',usage:'2026-07-03'}]);
assert.deepEqual(parser([]),[],'empty verified ledger is not expired/unsafe stock');
for(const patch of [{on_hand:null},{on_hand:0},{item_id:-1},{days_since_receipt:-1},{last_receipt_on:'unknown'}]){
 assert.throws(()=>parser([{...row,...patch}]),/AGE_REVIEW_INVALID_ROW/,'unverified/no-stock data fail closed');
}
assert.throws(()=>parser(null),/AGE_REVIEW_INVALID_RESPONSE/);
new Function(js);new Function(view);
console.log('PASS MTG-14 inventory aging source, real runtime parser, safe UX and scoped SQL contract');
