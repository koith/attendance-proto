import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("./operations_reconciliation_v1.js",import.meta.url),"utf8");
const makeDeferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function check(phase){
 let store=1,first=makeDeferred(),second=makeDeferred(),alerts=[],added=[],disabled=false;
 const trigger={get disabled(){return disabled},set disabled(v){disabled=v}};
 const document={getElementById(id){return id==="opsFrom"?{value:"2026-10-01"}:id==="opsTo"?{value:"2026-10-19"}:trigger},
 createElement(){return {className:"",innerHTML:"",querySelector(){return {onclick:null}},remove(){}}},body:{appendChild(x){added.push(x)}}};
 const BE={storeReconciliationIssues(){return first.promise},storeCrossSourceSuspects(){return second.promise}};
 const ctx={document,BE,alert:x=>alerts.push(x),get CURRENT_STORE_ID(){return store}};
 ctx.window=ctx;
 vm.runInNewContext(source,ctx);
 const pending=ctx.openStoreOperationsReconciliation();
 if(phase==="issues"){store=2;first.resolve([]);await pending;}
 else {first.resolve([]);await new Promise(r=>setImmediate(r));store=2;second.resolve([]);await pending;}
 assert.equal(added.length,0,"stale store modal must not be mounted");
 assert.equal(alerts.length,0,"stale store must not trigger cross-store alerts");
}
await check("issues");await check("suspects");
console.log("MTG-06 cross-store reconciliation async race PASS (2 phases)");
