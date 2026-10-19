import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync('operations_supplier_handoff_v1.js','utf8');
const view=fs.readFileSync('operations_reference_ui_v208.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const context={window:{}};vm.runInNewContext(js,context);
const candidates=context.window.verifiedSupplierOrderCandidates;
const handoff=context.window.supplierHandoffText;
const orders=[
 {id:7,store_id:1,item_id:31,manual_item_id:null,item_name:'원두',unit:'box',order_unit:'box',
  status:'PARTIAL',ordered_quantity:7,received_quantity:2,is_demo:false},
 {id:8,store_id:1,item_id:null,manual_item_id:61,item_name:'우유',unit:'팩',order_unit:'팩',
  status:'ORDERED',ordered_quantity:3,received_quantity:0,is_demo:false},
 {id:9,store_id:1,item_id:77,manual_item_id:null,item_name:'취소',unit:'box',order_unit:'box',
  status:'CANCELLED',ordered_quantity:90,received_quantity:0}
];
assert.deepEqual(Array.from(candidates(orders,1),r=>[r.id,r.remaining]),[[7,5],[8,3]]);
const value=handoff(orders,1,[7]);
assert.match(value,/내부발주 #7 · 원두 · 미입고 5 box/);
assert.doesNotMatch(value,/내부발주 #8/);
assert.doesNotMatch(value,/취소/);
assert.match(value,/실제 주문이 아닙니다/);
assert.match(value,/상품 코드·규격·입고일/);
assert.throws(()=>handoff(orders,1,[]),/SUPPLIER_HANDOFF_SELECTION_REQUIRED/);
assert.throws(()=>handoff(orders,1,[7,7]),/SUPPLIER_HANDOFF_SELECTION_INVALID/);
assert.throws(()=>handoff(orders,1,[9]),/SUPPLIER_HANDOFF_SELECTION_INVALID/);
assert.throws(()=>handoff(orders,1,[777]),/SUPPLIER_HANDOFF_SELECTION_INVALID/);
for(const patch of [
 {store_id:2},{item_id:null},{manual_item_id:44},{id:0},{ordered_quantity:null},
 {ordered_quantity:''},{ordered_quantity:'-'},{received_quantity:null},
 {received_quantity:8},{received_quantity:7},{received_quantity:-1},
 {item_name:'\n주문수량 변경'}, {unit:'\n이상'}, {order_unit:'kg'}, {is_demo:true},
 {ordered_quantity:1.1234},{ordered_quantity:Infinity}
]){
 assert.throws(()=>handoff([{...orders[0],...patch}],1,[7]),
 /SUPPLIER_HANDOFF_INVALID_(?:ORDER|ITEM|QUANTITY)/,'reject invalid sample '+JSON.stringify(patch));
}
assert.throws(()=>candidates([orders[0],orders[0]],1),/SUPPLIER_HANDOFF_INVALID_ORDER/);
assert.match(js,/await BE\.inventoryPurchaseOrders\(\)/,'must re-read the store ledger before copying');
assert.match(js,/SUPPLIER_HANDOFF_STALE_ORDERS/);
assert.match(js,/window\.confirm\("점주가 선택한 내부 발주/,'explicit owner review prompt required');
assert.match(js,/!Auth\?\.isLoggedIn\?\.\(\)/);
assert.match(view,/id="opsSupplierHandoffOpen"/);
assert.match(view,/openSupplierOrderHandoff\?\.\(purchaseOrders,Number\(CURRENT_STORE_ID\)\|\|1\)/);
assert.match(html,/operations_supplier_handoff_v1\.js\?v=20261019v343/);
assert.doesNotMatch(js,/\.insert\(|\.update\(|\.delete\(|fetch\(|https?:\/\/onlyonefoodnet/i,'no supplier or inventory mutation');
new Function(js);new Function(view);
console.log('PASS #1175 live-manager order handoff: selected ID/remaining unit, canceled exclusion, cross-store, demo, stale data, no vendor writes');
