import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('operations_sale_sku_preview_v1.js','utf8');
const ops=fs.readFileSync('operations_v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261018212000_store_sale_sku_preview.sql','utf8');
const version=html.match(/const APP_VERSION="v0\.(\d+)"/)?.[1];
assert.ok(Number(version)>=328,"SKU mapping preview must remain present in later releases");
assert.match(html,/operations_sale_sku_preview_v1\.js\?v=20261019v339/);
assert.match(html,/async saleNameCandidates\(from,to\)\{ return rpc\("admin_store_sale_name_candidates"/);
assert.match(js,/id="opsLoadRealSaleNames"/);
assert.match(js,/await BE\.saleNameCandidates\(from,to\)/);
const candidateSql=fs.readFileSync('supabase/migrations/20261018231500_store_real_sale_menu_candidates.sql','utf8');
assert.match(candidateSql,/public\.can_manage_store\(p_store_id\)/);
assert.match(candidateSql,/t\.is_demo IS FALSE/);
assert.match(candidateSql,/t\.transaction_type='SALE'/);
assert.match(candidateSql,/t\.status='CONFIRMED'/);
assert.match(candidateSql,/t\.store_id=p_store_id/);
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
const cstart=js.indexOf('function parseSaleNameCandidates('),cend=js.indexOf('window.openStoreSaleSkuPreview=',cstart);
assert.ok(cstart>0&&cend>cstart);
const candidates=Function(js.slice(cstart,cend)+'\nreturn parseSaleNameCandidates')();
assert.deepEqual(candidates([{sale_name:'아메리카노',transaction_count:2}]),[{name:'아메리카노',count:2}]);
assert.deepEqual(candidates([]),[],'no verified sales must not generate placeholder names');
assert.throws(()=>candidates([{sale_name:'',transaction_count:1}]),/SALE_NAME_RESPONSE_INVALID/);
assert.throws(()=>candidates([{sale_name:'원두',transaction_count:0}]),/SALE_NAME_RESPONSE_INVALID/);
assert.throws(()=>candidates([{sale_name:'중복',transaction_count:1},{sale_name:'중복',transaction_count:2}]),/SALE_NAME_RESPONSE_INVALID/);
// Executed read-only CSV audit path: export never fabricates quantities.
const csvBegin=js.indexOf('function saleSkuAuditCsv(');
const csvEnd=js.indexOf('window.openStoreSaleSkuPreview=',csvBegin);
assert.ok(csvBegin>=0&&csvEnd>csvBegin,'audit writer is a pure helper');
const audit=Function(js.slice(csvBegin,csvEnd)+'\nreturn saleSkuAuditCsv')();
const result=parse(responses,a);
const csv=audit(result);
assert.ok(csv.startsWith('\ufeff'),'Excel-ready UTF-8 BOM');
assert.equal(csv.split('\r\n').filter(Boolean).length,6,'five audited source names plus header');
assert.match(csv,/아메리카노 1L","PROMOTION","12"/,'litre SKU must remain distinct');
assert.match(csv,/없는제품","UNMAPPED","",""/,'unmapped has no fake SKU');
assert.match(csv,/행사 아메리카노","PROMOTION","11"/);
assert.match(csv,/관리자 검토용 · 실제 판매수량\/자동승인 아님/);
assert.doesNotMatch(csv,/판매수량","/,'unknown quantity not implied');
const malicious=audit([{name:'=HYPERLINK("https://fake")',status:'UNMAPPED',product:null}]);
assert.ok(malicious.includes("'=HYPERLINK"),'spreadsheet formula injection must be escaped');
assert.throws(()=>audit([]),/SKU_AUDIT_INVALID/);
assert.throws(()=>audit([{name:'fake',status:'EXACT',product:null}]),/SKU_AUDIT_INVALID_PRODUCT/);
assert.throws(()=>audit([{name:'fake',status:'AUTO_APPROVED',product:1}]),/SKU_AUDIT_INVALID_ROW/);
assert.match(js,/id="opsSaleSkuExport" disabled/);
assert.match(js,/modal\.querySelector\("#opsSaleNames"\)\.value!==verifiedInput/,'old inspection must not be exported after user edits');
assert.doesNotMatch(js,/\.insert\(|\.update\(|\.delete\(/,'read-only SKU audit');
new Function(js);new Function(ops);
console.log('PASS MTG-07: guarded store-only sale SKU UI, campaign and litre separate, no automatic transaction writes');
