import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("./operations_reconciliation_v1.js",import.meta.url),"utf8");
const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
assert.match(html,/const APP_VERSION="v0\.354"/);
assert.match(html,/aria-label="현재 앱 버전 v0\.354">v0\.354<\/button>/);
assert.match(html,/operations_reconciliation_v1\.js\?v=20261021v354/);
assert.doesNotMatch(html,/operations_reconciliation_v1\.js\?v=20261020v351/);
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let store=1,from="2026-10-01",to="2026-10-19",issues=deferred(),suspects=deferred();
 let issueCalls=0,suspectCalls=0,disabled=false;
 const alerts=[],added=[];
 const trigger={get disabled(){return disabled},set disabled(v){disabled=v}};
 const inputs={opsFrom:{get value(){return from}},opsTo:{get value(){return to}}};
 const document={
  getElementById(id){return id==="opsReconciliationOpen"?trigger:inputs[id]??null},
  createElement(){return {className:"",innerHTML:"",querySelector(){return {onclick:null}},remove(){}}},
  body:{appendChild(node){added.push(node)}}
 };
 const BE={
  storeReconciliationIssues(){issueCalls++;return issues.promise},
  storeCrossSourceSuspects(){suspectCalls++;return suspects.promise}
 };
 const ctx={document,BE,alert:value=>alerts.push(value),get CURRENT_STORE_ID(){return store}};
 ctx.window=ctx;
 vm.runInNewContext(source,ctx);
 return {ctx,issues,suspects,alerts,added,trigger,get disabled(){return disabled},
  get issueCalls(){return issueCalls},get suspectCalls(){return suspectCalls},
  setStore(value){store=value},setFrom(value){from=value},setTo(value){to=value}};
}
async function stale(stage,dimension){
 const t=fixture(),pending=t.ctx.openStoreOperationsReconciliation();
 assert.equal(t.disabled,true);
 if(stage==="suspects"){t.issues.resolve([]);await tick();assert.equal(t.suspectCalls,1);}
 if(dimension==="store")t.setStore(2);
 if(dimension==="from")t.setFrom("2026-10-02");
 if(dimension==="to")t.setTo("2026-10-20");
 if(stage==="issues")t.issues.resolve([]);
 else t.suspects.resolve([]);
 await pending;
 assert.equal(t.added.length,0,"stale "+dimension+" result cannot show modal");
 assert.equal(t.alerts.length,0,"stale "+dimension+" cannot show an alert");
 assert.equal(t.disabled,false,"same button must recover from stale lookup");
}
for(const stage of ["issues","suspects"])
 for(const dimension of ["store","from","to"])await stale(stage,dimension);
{
 const t=fixture(),first=t.ctx.openStoreOperationsReconciliation();
 await t.ctx.openStoreOperationsReconciliation();
 assert.equal(t.issueCalls,1,"parallel issue lookup must be suppressed");
 t.issues.resolve([]);
 await tick();
 assert.equal(t.disabled,true,"must remain locked throughout suspected-duplicate lookup");
 assert.equal(t.suspectCalls,1);
 await t.ctx.openStoreOperationsReconciliation();
 assert.equal(t.issueCalls,1,"parallel lookup during phase two must be suppressed");
 assert.equal(t.suspectCalls,1);
 t.suspects.resolve([]);
 await first;
 assert.equal(t.added.length,1,"successful lookup should open exactly one modal");
 assert.equal(t.disabled,false,"finished lookup must release button");
}
{
 const t=fixture(),first=t.ctx.openStoreOperationsReconciliation();
 t.issues.reject(new Error("TEST_SOURCE_FAILURE"));
 await first;
 assert.equal(t.disabled,false,"failed first request must release button");
 assert.equal(t.alerts.length,1);
 const retry=t.ctx.openStoreOperationsReconciliation();
 await retry;
 assert.equal(t.issueCalls,2,"user can retry after a failed lookup");
}
{
 const t=fixture(),first=t.ctx.openStoreOperationsReconciliation();
 t.issues.resolve([]);
 await tick();
 t.suspects.reject(new Error("TEST_SUSPECTS_FAILURE"));
 await first;
 assert.equal(t.disabled,false,"failed suspect lookup must release button");
 assert.equal(t.added.length,1,"partial result must remain visible with failure context");
 assert.match(t.added[0].innerHTML,/중복 의심 조회 실패/);
}
{
 const t=fixture(),first=t.ctx.openStoreOperationsReconciliation();
 t.issues.resolve([null]);
 await first;
 assert.equal(t.added.length,0,"malformed reconciliation row never renders");
 assert.equal(t.alerts.length,1,"malformed upstream row surfaces a retryable error");
 assert.match(t.alerts[0],/RECONCILIATION_INVALID_RESPONSE/);
 assert.equal(t.disabled,false,"bad upstream response releases control");
}
{
 const t=fixture(),first=t.ctx.openStoreOperationsReconciliation();
 t.issues.resolve([]);
 await tick();
 const pair={pos_transaction_id:11,delivery_transaction_id:12,
  total_amount:4500,gap_seconds:60,business_date:"2026-10-20",
  delivery_source:"BAEMIN",pos_key:"POS-11",delivery_key:"DELIVERY-12"};
 t.suspects.resolve([pair,{...pair}]);
 await first;
 assert.equal(t.added.length,1,"valid issue portion still shown");
 assert.match(t.added[0].innerHTML,/SUSPECTS_DUPLICATE_PAIR/);
 assert.doesNotMatch(t.added[0].innerHTML,/POS-11/,"duplicate suspects never appear as confirmed twice");
 assert.equal(t.disabled,false);
}
{
 const t=fixture(),first=t.ctx.openStoreOperationsReconciliation();
 t.issues.resolve([]);
 await tick();
 t.suspects.resolve([{pos_transaction_id:11,delivery_transaction_id:12,
  total_amount:4500,gap_seconds:60,business_date:"2026-10-20",
  delivery_source:"BAEMIN",pos_key:"POS-11",delivery_key:"DELIVERY-12"}]);
 await first;
 assert.equal(t.added.length,1);
 assert.match(t.added[0].innerHTML,/POS-11/,"valid unique suspect is preserved");
 assert.doesNotMatch(t.added[0].innerHTML,/중복 의심 조회 실패/);
}
console.log("MTG-06 reconciliation context/locking/retry and upstream malformed/duplicate protection PASS (12 scenarios)");
