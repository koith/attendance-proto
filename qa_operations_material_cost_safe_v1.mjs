import assert from 'node:assert/strict';
import fs from 'node:fs';

// MTG-12: test the exact runtime guard, not an independent duplicate formula.
const src=fs.readFileSync('operations_v1.js','utf8');
const begin=src.indexOf('function operationsCostStatus(');
const end=src.indexOf('const withCatalog=',begin);
assert.ok(begin>0&&end>begin,'cost guard must exist in the shipped runtime');
const costGuard=Function(src.slice(begin,end)+'\nreturn operationsCostStatus;')();
for(const value of [0,30000,129999999]){
 const r=costGuard({purchases:value});
 assert.equal(r.purchaseAmount,value);
 assert.equal(r.materialCost,null);
 assert.equal(r.ready,false);
 assert.match(r.reason,/재고평가액/);
}
assert.equal(costGuard({purchases:'15000'}).purchaseAmount,15000,'valid numeric JSON string accepted');
for(const value of [null,undefined,'',-1,'-7',1.5,'1.5',NaN,Infinity,'15,000',Number.MAX_SAFE_INTEGER+1,'999999999999999999999999']){
 const r=costGuard({purchases:value});
 assert.equal(r.purchaseAmount,null,'unsafe purchase must not become zero: '+String(value));
 assert.equal(r.materialCost,null,'unknown usage cost must not be estimated');
}
assert.equal(costGuard(null).materialCost,null);
assert.match(src,/id="opsMaterialCostSafety"/);
assert.match(src,/사용 재료비<\/span><strong>미산출/);
assert.match(src,/cost\.purchaseAmount===null\?"자료 확인 필요":won\(cost\.purchaseAmount\)/);
assert.match(src,/미확인 재고는 0원으로 계산하지 않으며/);
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/operationsScoped\("admin_operations_summary","admin_store_operations_summary"/,
 'existing backend summary remains behind store-manager / HQ authority');
console.log('PASS MTG-12 safe actual summary: purchase gross and unavailable usage costs remain distinct');
