import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const content=fs.readFileSync('operations_reference_v208.js','utf8');
const ctx={window:{}};
vm.runInNewContext(content,ctx);
const publicRef=ctx.window.OPERATIONS_REFERENCE_V208;
assert.equal(publicRef.inventory.length,172,'existing inventory reference must be preserved');
assert.equal(publicRef.shelf_life.length,125,'existing product shelf-life reference must be preserved');
assert.ok(Array.isArray(publicRef.recipes)&&publicRef.recipes.length===0,
 'no manufacturing recipes may be shipped in unauthenticated static assets');
assert.doesNotMatch(content,/"variants":\[\{"label":/,'source recipe bodies must not be publicly bundled');
const ops=fs.readFileSync('operations_reference_ui_v208.js','utf8');
assert.match(ops,/async function loadProtectedRecipes/);
assert.match(ops,/BE\.storeRecipeList\(storeId\)/,
 'manager must use a store-scoped authenticated recipe endpoint');
assert.match(ops,/if\(!LIVE\|\|!Auth\.isLoggedIn\(\)\)throw/,
 'fail closed for unsigned preview and unauthenticated management sessions');
assert.match(ops,/variants:Array\.isArray\(r\.instructions\)\?r\.instructions:\[\]/);
assert.match(ops,/loadRegisteredRecipes\(\),loadProtectedRecipes\(\)/,
 'manager reference UI must populate recipe bodies from the real server');
assert.doesNotMatch(ops,/REF\.recipes/,'manager UI cannot rely on static manufacturing recipes');
const staff=fs.readFileSync('recipe_access_v220.js','utf8');
assert.match(staff,/const instructionsFor=row=>Array\.isArray\(row\.instructions\)/);
assert.doesNotMatch(staff,/referenceFor\(|OPERATIONS_REFERENCE_V208\?\.recipes/);
assert.match(staff,/BE\.staffRecipeList\(id,pin,CURRENT_STORE_ID\)/);
assert.doesNotMatch(staff,/BE\.publicStoreRecipeList\(/);
const sql=fs.readFileSync('supabase/migrations/20261011172000_revoke_public_recipe_instructions.sql','utf8');
assert.match(sql,/REVOKE ALL ON FUNCTION public\.store_recipe_list_public/);
console.log('PASS public recipe content absent; manager and PIN-verified staff fetch source only after authentication');
