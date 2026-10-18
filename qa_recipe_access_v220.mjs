import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const ui=fs.readFileSync('recipe_access_v220.js','utf8');
const css=fs.readFileSync('recipe_access_v220.css','utf8');
const sheet=fs.readFileSync('apps_script.gs','utf8');
const migration=fs.readFileSync('supabase/migrations/20260927183000_recipe_access_store_overrides_and_safe_retirement.sql','utf8');
const roleMigration=fs.readFileSync('supabase/migrations/20260927184500_hq_role_enforcement.sql','utf8');

assert.match(html,/const APP_VERSION="v0\.318"/);
assert.ok(html.includes('id="tabRecipe"')&&html.includes('href="#recipe"'),'recipe must be a top-level tab');
assert.ok(!html.includes('data-admin-tab="recipe"'),'recipe must not remain in management subtabs');
assert.match(html,/recipe_access_v220\.js\?v=20261018public1038/);
assert.ok(ui.includes('BE.publicStoreRecipeList(CURRENT_STORE_ID)'),'anonymous reader must use scoped server RPC');
assert.ok(!ui.includes('rvStaffPin')&&!ui.includes('staffRecipeGate'),'no employee PIN or shift gate is allowed for read-only view');
assert.ok(ui.includes('보기 전용'),'staff recipes must be read-only');
assert.ok(!ui.includes('+ 레시피 등록'),'store recipe screen must not expose registration');
assert.ok(ui.includes('adminStoreRecipeOverrideSave')===false);
assert.ok(ui.includes('BE.storeRecipeOverrideSave')&&ui.includes('BE.storeRecipeOverrideClear'),'manager must save or restore local overrides');
assert.ok(ui.includes('재고 소진 확인 · 판매 종료')&&ui.includes('BE.storeProductRetirementFinalize'),'retiring products require store finalization');
assert.ok(ui.includes('thumbnail_url')&&css.includes('.recipe-v220-thumb'),'recipe cards must show thumbnails');
assert.match(migration,/v_last_type[\s\S]*NOT_CLOCKED_IN/);
assert.match(migration,/store_recipe_overrides/);
assert.match(migration,/status in \('ACTIVE','RETIRING','DISCONTINUED'\)/);
assert.match(migration,/pi\.created_by_hq and m\.on_hand>0/,'only product-exclusive stock may block retirement');
assert.match(roleMigration,/admin_hq_product_apply/);
assert.match(roleMigration,/public\.is_hq_admin\(\)/);
assert.ok(sheet.includes("year + ' 근태'"),'sheet workbook must be annual');
assert.ok(sheet.includes("m+'월'")&&sheet.includes('m<=12'),'sheet must create January through December tabs');
assert.ok(sheet.includes("'근태 현황'")&&sheet.includes("'급여 집계'"),'monthly tab must retain payroll and attendance');
assert.ok(html.includes('function hhmmBusiness')&&html.includes('d.getHours()+dayOffset*24'),'overnight sheet times must support 25/26 hour notation');

console.log('recipe access v220 QA PASS (guest read-only; authenticated edits)');

assert(ui.includes('recipeBadges'), 'recipe cards must derive operational category badges');
assert(ui.includes('대용량 베이스') && ui.includes('잔'), 'batch recipes must show batch serving badge');
assert(ui.includes('recipe-v220-ea'), 'EA package count must be visually separated from product title');
assert(ui.includes('추가 옵션'), 'extra option badge must be supported');
assert(css.includes('.recipe-v220-kind') && css.includes('.recipe-v220-ea'), 'recipe badge and EA styles must exist');
