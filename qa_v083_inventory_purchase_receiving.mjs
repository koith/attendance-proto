import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync('operations_reference_ui_v208.js','utf8');
const idx=fs.readFileSync('index.html','utf8');
assert(idx.includes('APP_VERSION="v0.83"'));
for(const s of ['inventoryPurchaseOrders','inventoryPurchaseOrder(row','inventoryReceive(orderId']) assert(idx.includes(s));
for(const s of ['purchaseOrders=await BE.inventoryPurchaseOrders()','function receivingPanel()','async function openReceiveOrder(order)','async function openPurchaseOrder(row)','data-receive-order']) assert(js.includes(s));
assert(js.includes('await BE.inventoryReceive(order.id,qty)'));
assert(js.includes('await BE.inventoryPurchaseOrder(row,qty'));
console.log('v0.83 inventory purchase/receiving QA PASS');