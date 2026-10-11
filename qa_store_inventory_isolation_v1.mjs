import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261011083000_store_scoped_inventory_ledger.sql','utf8');
const html=fs.readFileSync('index.html','utf8');
const ops=fs.readFileSync('operations_v1.js','utf8');
const refUI=fs.readFileSync('operations_reference_ui_v208.js','utf8');
assert.match(sql,/inventory_movements\s+ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES public\.stores\(id\)/);
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.store_inventory_unit_configs/);
assert.match(sql,/ALTER TABLE public\.store_inventory_unit_configs ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON TABLE public\.store_inventory_unit_configs FROM PUBLIC,anon,authenticated/);
for(const n of ['admin_store_inventory_overview_v3','admin_store_inventory_items','admin_store_inventory_movements','admin_store_inventory_unit_config_save'])
 assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+n+'\\('));
assert.match(sql,/m\.store_id=p_store_id OR \(p_store_id=1 AND m\.store_id IS NULL\)/);
assert.match(sql,/public\.can_manage_store\(p_store_id\)/);
assert.match(sql,/LEFT JOIN public\.store_inventory_unit_configs c/);
assert.match(sql,/WHERE m\.id=p_manual_item_id AND m\.store_id=p_store_id/);
assert.match(sql,/\(store_id,item_id,business_date,movement_type,quantity,source_type,source_key,note\)/);
assert.match(sql,/VALUES\(r\.store_id,r\.item_id/);
assert.match(sql,/WHERE id=r\.manual_item_id AND store_id=r\.store_id/);
assert.match(sql,/COALESCE\(c\.conversion_quantity,i\.conversion_quantity\)/);
for(const n of ['admin_store_inventory_overview_v3','admin_store_inventory_items','admin_store_inventory_movements','admin_store_inventory_unit_config_save'])
 assert.ok(html.includes('rpc("'+n+'"'),'App does not call '+n);
for(const n of ['admin_inventory_overview_v3','admin_inventory_items','admin_inventory_movements','admin_inventory_unit_config_save'])
 assert.ok(!html.includes('rpc("'+n+'"'),'Unscoped inventory RPC still in app: '+n);
assert.match(ops,/inventoryUnitConfigSave\(item\.id,s,o,q,!!item\.manual\)/);
assert.match(html,/operations_v1\.js\?v=20261011v202/);
assert.match(html,/const APP_VERSION="v0\.216"/);
assert.doesNotMatch(sql,/UPDATE public\.inventory_movements SET store_id=/);
// UI rollout is deliberately hidden; the preserved renderer can still be tested internally.
assert.match(html,/const tabs=Number\(CURRENT_STORE_ID\)===1/);
assert.match(html,/\[\["report","리포트"\],\["admin","직원 관리"\]/);
assert.match(html,/: \[\["admin","직원 관리"\],\["pay","급여"\],\["hours","운영시간"\]\]/);
assert.match(html,/else if\(\["report","sales","inventory","ops"\]\.includes\(h\)&&Number\(CURRENT_STORE_ID\)!==1\)\{location\.hash="#admin";return;\}/);
assert.match(refUI,/window\.renderOperations=async tab=>tab==="recipe"\?renderRecipes\(\):originalRender\(tab\)/);
assert.doesNotMatch(refUI,/tab==="inventory"\?renderInventory\(\)/);
assert.match(ops,/ops-unit-config-btn/);
assert.match(ops,/ops-stock-level/);
assert.match(ops,/ops-stock-info-btn/);
assert.match(ops,/stock-now/);
assert.match(html,/header\.long-store-context\{/);
assert.doesNotMatch(html,/\n\s+header\{flex-wrap:wrap!important/);
console.log('PASS store inventory balance and receipts isolated; manual settings and Inha history protected');
