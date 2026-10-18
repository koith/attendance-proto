import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('operations_sale_sku_preview_v1.js','utf8');
const ops=fs.readFileSync('operations_v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261018212000_store_sale_sku_preview.sql','utf8');
assert.match(html,/const APP_VERSION="v0\.328"/);
assert.match(html,/operations_sale_sku_preview_v1\.js\?v=20261018v328/);
assert.match(html,/async saleSkuPreview\(names\)\{ return rpc\("admin_store_sale_sku_preview",\{p_store_id:CURRENT_STORE_ID\|\|1,p_sale_names:names\},true\); \}/);
assert.match(ops,/id="opsSaleSkuPreview"/);
assert.match(ops,/openStoreSaleSkuPreview\?\.\(\)/);
assert.match(sql,/public\.can_manage_store\(p_store_id\)/);
assert.match(sql,/spa\.store_id=p_store_id AND spa\.status='ACTIVE'/);
assert.match(sql,/l\.transaction_type='SALE'/);
assert.match(sql,/r\.n_products<>1 THEN 'AMBIGUOUS'/);
assert.match(sql,/r\.tier=0 THEN 'EXACT'/);
assert.match(sql,/ELSE 'PROMOTION'/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.admin_store_sale_sku_preview\(bigint,text\[\]\) FROM PUBLIC,anon/);
assert.doesNotMatch(sql,/\bUPDATE\s+public\.hq_products|\bDELETE\s+FROM|\bINSERT\s+INTO\s+public\.hq_products/i);
const begin=js.indexOf('function parseSkuPreview('),end=js.indexOf('window.openStoreSaleSkuPreview=',begin);
assert.ok(begin>0&&end>begin);
const parse=Function(js.slice(begin,end)+'\nreturn parseSkuPreview')();
const a=['아메리카노','행사 아메리카노','행사 아메리카노 1L','없는제품','중복'];
const responses=[
 {input_index:1,sale_name:a[0],match_status:'EXACT',product_id:11,product_name:'아메리카노',matched_alias:'아메리카노'},
 {input_index:2,sale_name:a[1],match_status:'PROMOTION',product_id:11,product_name:'아메리카노',matched_alias:'아메리카노'},
 {input_index:3,sale_name:a[2],match_status:'PROMOTION',product_id:12,product_name:'아메리카노 1L',matched_alias:'아메리카노 1L'},
 {input_index:4,sale_name:a[3],match_status:'UNMAPPED',product_id:null},
 {input_index:5,sale_name:a[4],match_status:'AMBIGUOUS',product_id:null}
];
assert.deepEqual(parse(responses,a).map(x=>[x.status,x.product]),[
 ['EXACT',11],['PROMOTION',11],['PROMOTION',12],['UNMAPPED',null],['AMBIGUOUS',null]
]);
assert.throws(()=>parse(responses.slice(0,4),a),/SKU_RESPONSE_COUNT_MISMATCH/);
assert.throws(()=>parse([{...responses[0],product_id:null},...responses.slice(1)],a),/SKU_RESPONSE_INVALID_PRODUCT/);
assert.throws(()=>parse([{...responses[0],input_index:2},...responses.slice(1)],a),/SKU_RESPONSE_INVALID/);
assert.throws(()=>parse([{...responses[0],match_status:'AUTO_APPROVED'},...responses.slice(1)],a),/SKU_RESPONSE_INVALID/);
new Function(js);new Function(ops);
console.log('PASS MTG-07: guarded store-only sale SKU UI, campaign and litre separate, no automatic transaction writes');
