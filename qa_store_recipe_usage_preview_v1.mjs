import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync('operations_sale_sku_preview_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const version=Number(html.match(/const APP_VERSION="v0\.(\d+)"/)?.[1]);
assert.ok(Number.isInteger(version)&&version>=339);
assert.match(html,/operations_sale_sku_preview_v1\.js\?v=20261019v339/);
assert.match(s,/await BE\.storeRecipeList\(store\)/);
assert.match(s,/data-sale-units/);
assert.match(s,/현재 POS 거래건수는 판매수량이 아닙니다/);
assert.match(s,/실제 판매·폐기·시식·서비스·손실 수량/);
assert.match(s,/usage\.disabled=rows\.some\(x=>x\.status!=="EXACT"\)/);
const start=s.indexOf('function computeScopedRecipeUsage('),end=s.indexOf('window.openStoreSaleSkuPreview=',start);
assert.ok(start>0&&end>start);
const calc=Function(s.slice(start,end)+'\nreturn computeScopedRecipeUsage')();
const p=[
 {name:'아메리카노',product:1,status:'EXACT'},
 {name:'아메리카노 1L',product:2,status:'EXACT'},
 {name:'카페 라떼',product:3,status:'EXACT'}
];
const recipes=[
 {product_id:1,assignment_status:'ACTIVE',is_overridden:false,components:[
  {item_id:11,item_name:'원두',unit:'g',quantity:20},
  {item_id:12,item_name:'물',unit:'ml',quantity:180}
 ]},
 {product_id:2,assignment_status:'ACTIVE',is_overridden:true,components:[
  {item_id:11,item_name:'원두',unit:'g',quantity:50},
  {item_id:12,item_name:'물',unit:'ml',quantity:900}
 ]},
 {product_id:3,assignment_status:'RETIRING',is_overridden:false,components:[
  {item_id:11,item_name:'원두',unit:'g',quantity:20},
  {item_id:13,item_name:'우유',unit:'ml',quantity:200}
 ]}
];
const result=calc(p,recipes,['2','1','3']);
assert.deepEqual(result.details.map(x=>[x.units,x.product,x.override]),[
 [2,1,false],[1,2,true],[3,3,false]
]);
const byId=new Map(result.ingredients.map(x=>[x.id,x]));
assert.equal(byId.get(11).amount,150,'normal and 1L SKU usage must remain separated then aggregate ingredients');
assert.equal(byId.get(12).amount,1260);
assert.equal(byId.get(13).amount,600);
assert.equal(byId.size,3);
for(const bad of [
 ['', '1','3'],['0','1','3'],['2.5','1','3'],['-2','1','3'],
 ['abc','1','3'],['2','1000000','3'],['2',' ', '3']
])assert.throws(()=>calc(p,recipes,bad),/USAGE_QUANTITY_REQUIRED/);
assert.throws(()=>calc(p,recipes,['2','1']),/USAGE_INPUT_INCOMPLETE/);
assert.throws(()=>calc([{...p[0],status:'PROMOTION'},...p.slice(1)],recipes,['2','1','3']),/USAGE_SKU_UNVERIFIED/);
assert.throws(()=>calc([{...p[0],status:'AMBIGUOUS'},...p.slice(1)],recipes,['2','1','3']),/USAGE_SKU_UNVERIFIED/);
assert.throws(()=>calc(p,recipes.slice(0,2),['2','1','3']),/USAGE_RECIPE_MISSING/);
assert.throws(()=>calc(p,recipes.map((r,i)=>i===0?{...r,components:[]}:r),['2','1','3']),/USAGE_RECIPE_MISSING/);
assert.throws(()=>calc(p,recipes.map((r,i)=>i===0?{...r,components:[null]}:r),['2','1','3']),/USAGE_COMPONENT_INVALID/);
assert.throws(()=>calc(p,recipes.map((r,i)=>i===0?{...r,components:[{item_id:11,item_name:'원두',unit:'g',quantity:null}]}:r),['2','1','3']),/USAGE_COMPONENT_INVALID/);
assert.throws(()=>calc(p,recipes.map((r,i)=>i===1?{...r,components:[{item_id:11,item_name:'원두',unit:'kg',quantity:0.05}]}:r),['2','1','3']),/USAGE_UNIT_CONFLICT/);
assert.throws(()=>calc(p,[recipes[0],recipes[0],recipes[2]],['2','1','3']),/USAGE_RECIPE_INVALID/);
assert.throws(()=>calc(p,recipes.map((r,i)=>i===1?{...r,assignment_status:'DISCONTINUED'}:r),['2','1','3']),/USAGE_RECIPE_MISSING/);
assert.ok(!/BE\.inventory.*(?:adjust|post|save)/i.test(s.slice(s.indexOf(' usage.onclick=async()=>'),s.indexOf(' load.onclick=async()=>'))));
console.log('PASS MTG-13 store-specific recipe quantity preview, overrides, units and fail-closed incomplete evidence');
