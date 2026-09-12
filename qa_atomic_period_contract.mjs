import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('employment_contracts.html','utf8');
const js=fs.readFileSync('employment_period_atomic_v1.js','utf8');
const state=fs.readFileSync('employment_contract_form_state_fix.js','utf8');

const tests=[];
const t=(name,fn)=>tests.push([name,fn]);

t('atomic flow loads before form-state preservation',()=>{
  const a=html.indexOf('employment_period_atomic_v1.js');
  const b=html.indexOf('employment_contract_form_state_fix.js');
  assert(a>0&&b>a);
});

t('new period is staged locally instead of calling periodSet immediately',()=>{
  assert(js.includes('S.pendingNewPeriod={'));
  assert(js.includes("if(!S.creatingPeriod)return baseSavePeriod()"));
  const staged=js.slice(js.indexOf('savePeriod=async function'),js.indexOf('BE.contractSet=async function'));
  assert(!staged.includes('BE.periodSet('));
});

t('first contract uses atomic period+contract RPC',()=>{
  assert(js.includes("rpc('admin_employment_period_contract_create'"));
  assert(js.includes('p_started_on:d.started_on'));
  assert(js.includes('p_contract_memo:args.p_memo'));
  assert(js.includes('p_workdays:args.p_workdays'));
});

t('atomic success switches to persisted period and preserves normal contract readback path',()=>{
  assert(js.includes('S.periodId=Number(r.period_id)'));
  assert(js.includes('S.pendingNewPeriod=null'));
  assert(js.includes('id:Number(r.contract_id)'));
});

t('pending period can be cancelled without deleting production data',()=>{
  assert(js.includes('cancelPendingPeriod'));
  assert(js.includes('S.pendingNewPeriod=null'));
  assert(!js.includes('delete('));
  assert(!js.includes('periodDelete'));
});

t('form drafts isolate pending period from existing period ids',()=>{
  assert(state.includes("S.pendingNewPeriod?'pending-period':(S.periodId??'')"));
});

let failed=0;
for(const [name,fn] of tests){
  try{fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}
}
if(failed)process.exit(1);
console.log(`PASS ${tests.length}/${tests.length}`);
