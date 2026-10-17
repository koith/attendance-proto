import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const ops=fs.readFileSync('operations_v1.js','utf8');
const ui=fs.readFileSync('operations_stocktake_v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261012210500_store_inventory_stocktake.sql','utf8');
assert.match(html,/operations_v1\.js\?v=[\w.-]+/,'Operations asset must be cache-busted');
assert.match(html,/operations_stocktake_v1\.js\?v=20261012v244/);
assert.match(html,/const APP_VERSION="v0\.\d+";/);
assert.match(ops,/id="opsStocktakeOpen"/);
assert.match(ops,/window\.openStoreInventoryStocktake\?\.\(\)/);
for (const rpc of [
 'admin_store_stocktake_catalog','admin_store_stocktake_list','admin_store_stocktake_detail',
 'admin_store_stocktake_draft','admin_store_stocktake_post'
]) assert.match(html,new RegExp('rpc\\("'+rpc+'"'),'missing authorized adapter '+rpc);
assert.match(ui,/window\.openStoreInventoryStocktake=async function/);
assert.match(ui,/await Promise\.all\(\[BE\.inventoryStocktakeCatalog\(\),BE\.inventoryStocktakeList\(\)\]\)/);
assert.match(ui,/const draft=await BE\.inventoryStocktakeDraft\(/);
assert.match(ui,/if\(!confirm\("실사 #"/,'explicit human confirmation required before stock mutation');
assert.match(ui,/const result=await BE\.inventoryStocktakePost\(id\)/);
assert.match(ui,/STOCKTAKE_POST_NOT_CONFIRMED/);
assert.match(ui,/아직 재고 수량은 변경되지 않았습니다/);
assert.match(ui,/최대 100개 품목/);
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.store_inventory_stocktakes/);
assert.match(sql,/ALTER TABLE public\.store_inventory_stocktakes ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/ALTER TABLE public\.store_inventory_stocktake_lines ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON TABLE public\.store_inventory_stocktakes FROM PUBLIC,anon,authenticated/);
assert.match(sql,/REVOKE ALL ON TABLE public\.store_inventory_stocktake_lines FROM PUBLIC,anon,authenticated/);
assert.match(sql,/DEMO_STOCK_NEEDS_REVIEW/);
assert.match(sql,/STOCK_CHANGED_RECOUNT/);
assert.match(sql,/STOCKTAKE_EXPIRED_RECOUNT/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/movement_type,quantity,/);
assert.match(sql,/'STORE_STOCKTAKE'/);
assert.doesNotMatch(sql,/UPDATE public\.inventory_movements|DELETE FROM public\.inventory_movements/);
assert.doesNotMatch(sql,/UPDATE public\.inventory_manual_items|DELETE FROM public\.inventory_manual_items/);
new Function(ui);
new Function(ops);
console.log('PASS stocktake UI: optional opt-in, draft-only then explicit posted movements, no original-row changes');
