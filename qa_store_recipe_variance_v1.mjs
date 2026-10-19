import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the exact runtime JS loaded by the production app, not a copy.
const script=fs.readFileSync('operations_recipe_variance_v1.js','utf8');
const sku=fs.readFileSync('operations_sale_sku_preview_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const context={window:{}};vm.runInNewContext(script,context);
const compare=context.window.computeStoreRecipeVariance;
assert.equal(typeof compare,'function');
assert.match(html,/operations_recipe_variance_v1\.js\?v=20261019v341/);
assert.match(sku,/compareStoreRecipeUsage|computeStoreRecipeVariance/);
assert.match(sku,/관측 재료 사용량·폐기·서비스·허용오차 과부족 대조/);
assert.match(sku,/판매수량이 변경되었습니다. 예상 사용량을 다시 계산해야 합니다/);
assert.doesNotMatch(script,/(?:\bfetch\(|\.rpc\(|\.insert\(|\.update\(|\.delete\()/);
const parts=[{id:11,name:'원두',unit:'g',amount:150},{id:12,name:'우유',unit:'ml',amount:600}];
const rows=[
 {id:11,observed:'160',waste:'5',service:'0',tolerance:'5'},
 {id:12,observed:'500',waste:'0',service:'0',tolerance:'10'}
];
const result=compare(parts,rows);
assert.equal(result[0].status,'WITHIN');
assert.equal(result[0].expected,155);
assert.equal(result[0].delta,5);
assert.equal(result[1].status,'UNDER');
assert.equal(result[1].delta,-100);
const above=compare(parts,[{...rows[0],observed:'200'},rows[1]]);
assert.equal(above[0].status,'OVER');
assert.equal(above[0].delta,45);
const exactZero=compare(parts,[{...rows[0],waste:'0',service:'0',observed:'150',tolerance:'0'},rows[1]]);
assert.equal(exactZero[0].status,'WITHIN','explicit zero extras and zero tolerance remain valid');
for(const patch of [{observed:''},{observed:null},{observed:' '},{waste:''},{service:''},
 {tolerance:''},{observed:'-1'},{waste:'NaN'},{service:'1e3'},{tolerance:'101'},
 {observed:'3.4567'},{observed:'10000000000'}]){
 assert.throws(()=>compare(parts,[{...rows[0],...patch},rows[1]]),
  /USAGE_(?:OBSERVATION_REQUIRED|OBSERVATION_INVALID|TOLERANCE_RANGE)/);
}
assert.throws(()=>compare(parts,rows.slice(0,1)),/USAGE_VARIANCE_INCOMPLETE/);
assert.throws(()=>compare(parts,[rows[1],rows[0]]),/USAGE_VARIANCE_INVALID/);
assert.throws(()=>compare([{...parts[0],amount:0},parts[1]],rows),/USAGE_VARIANCE_INVALID/);
assert.throws(()=>compare([{...parts[0],amount:null},parts[1]],rows),/USAGE_VARIANCE_INVALID/);
assert.throws(()=>compare([parts[0],{...parts[1],id:11}],rows),/USAGE_VARIANCE_INVALID/);
new Function(sku);new Function(script);
console.log('PASS MTG-13 actual calculator + UI: explicit waste/service/observation/tolerance, over/under, zero, stale input, no mutation');
