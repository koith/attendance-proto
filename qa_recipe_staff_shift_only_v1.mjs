// #1038 policy regression: public READ does not depend on shift or PIN.
// Legacy PIN-based staff RPC remains separately restricted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('recipe_access_v220.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261018013000_public_ready_store_recipe_read.sql','utf8');
const oldGuard=fs.readFileSync('supabase/migrations/20261011145000_staff_recipe_ready_guard.sql','utf8');
const oldRevoke=fs.readFileSync('supabase/migrations/20261011172000_revoke_public_recipe_instructions.sql','utf8');
assert.match(ui,/BE\.publicStoreRecipeList\(CURRENT_STORE_ID\)/);
assert.match(ui,/renderList\(visible,manager\)/);
assert.match(ui,/if\(LIVE&&Auth\.isLoggedIn\(\)\)/);
assert.match(ui,/BE\.storeRecipeList\(CURRENT_STORE_ID\)/);
assert.doesNotMatch(ui,/staffRecipeGate|rvStaffPin|rvStaffLogin|BE\.staffRecipeList\(/);
assert.match(sql,/s\.onboarding_status='READY'/);
assert.match(sql,/s\.is_active/);
assert.match(sql,/LEFT JOIN public\.store_recipe_overrides o\s+ON o\.store_id=p_store_id/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.store_recipe_list_public\(bigint\)\s+TO anon,authenticated,service_role/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.source_recipe_instructions\(text\)/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.source_recipe_components\(text\)/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.recipe_thumbnail_for_source\(text\)/);
assert.doesNotMatch(sql,/GRANT (?:UPDATE|INSERT|DELETE)/);
assert.match(oldGuard,/NOT_CLOCKED_IN/);
assert.match(oldGuard,/BAD_PIN/);
assert.match(oldRevoke,/REVOKE ALL ON FUNCTION public\.store_recipe_list_public/);
console.log('PASS #1038 anonymous READY-store recipe read, immutable source, protected manager edits');
