import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the actual production function bodies with synthetic responses.
// No live credentials, mail, payroll close, inventory or business data writes.
const storeSource=fs.readFileSync('hq_store_onboarding_ui.js','utf8');
const storeStart=storeSource.indexOf('  async function refresh(){');
const storeEnd=storeSource.indexOf('  async function act(',storeStart);
assert.ok(storeStart>0&&storeEnd>storeStart,'HQ refresh function found');
const makeRefresh=(responses)=>{
 let nextResponses=responses,renderCount=0;
 const factory=new Function('rpc','render',
  'let stores=[],managers=[],proofs=[],sampleCounts=[],primaryOwners=[],ownerInvitations=[],selected=1;'+
  storeSource.slice(storeStart,storeEnd)+
  '\nreturn {refresh, state:()=>({stores,managers,proofs,sampleCounts,selected})};');
 const result=factory(async name=>nextResponses[name],()=>renderCount++);
 return {...result,getRenderCount:()=>renderCount,setResponses:value=>{nextResponses=value;}};
};
const valid={
 hq_stores_onboarding_list:[{id:1,onboarding_status:'READY'},{id:2,onboarding_status:'STAGED'}],
 hq_store_manager_list:[],
 hq_store_provenance_list:[],
 hq_store_sample_roster_counts:[],
 hq_store_primary_owner_list:[],
 hq_store_primary_owner_invitation_list:[]
};
const store=makeRefresh(valid);
await store.refresh();
assert.equal(store.getRenderCount(),1,'valid source data renders once');
assert.equal(store.state().stores.length,2);
for(const badKey of Object.keys(valid)){
 store.setResponses({...valid,[badKey]:{ok:false,error:'BACKEND_FAILED'}});
 await assert.rejects(store.refresh(),/HQ_ONBOARDING_INVALID_RESPONSE/,'malformed '+badKey+' must fail closed');
 assert.equal(store.getRenderCount(),1,'invalid HQ data must not render another ready state');
 assert.equal(store.state().stores.length,2,'invalid HQ data must not partially overwrite cached state');
}

const opsSource=fs.readFileSync('operations_v1.js','utf8');
const opStart=opsSource.indexOf('async function openOpsModal(kind){');
const opEnd=opsSource.indexOf(' const sources=',opStart);
assert.ok(opStart>0&&opEnd>opStart,'real operations import-history preflight found');
const opsFactory=new Function('BE','alert',
 'return '+opsSource.slice(opStart,opEnd)+' return rows; }');
let reads=0,alerts=[];
const failure=opsFactory({operationsImports:async()=>{reads++;throw Error('REMOTE_DOWN');}},
 msg=>alerts.push(msg));
assert.equal(await failure('collect'),undefined);
assert.equal(reads,1);
assert.match(alerts[0],/REMOTE_DOWN/,'collect must show backend failure');
assert.deepEqual(await failure('upload'),[],'CSV upload preflight is independent');
assert.equal(reads,1,'CSV upload must not unnecessarily depend on import-history API');
alerts=[];
const malformed=opsFactory({operationsImports:async()=>({ok:false})},msg=>alerts.push(msg));
assert.equal(await malformed('collect'),undefined);
assert.match(alerts[0],/IMPORT_HISTORY_INVALID_RESPONSE/,'malformed history cannot masquerade as empty');
const validOps=opsFactory({operationsImports:async()=>[{id:1,status:'FAILED'}]},()=>{throw Error('unexpected alert')});
assert.equal((await validOps('collect')).length,1,'valid history renders unchanged');
new Function(storeSource);
new Function(opsSource);
console.log('PASS HQ readiness and operations collection fail-closed: malformed/error, valid history, CSV isolation');
