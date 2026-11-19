import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Real GAS doPost, fully synthetic in-memory Apps Script service stubs.
// Demonstrates overlapping writes to DIFFERENT stores without a global
// month-writing lock; duplicate writes to the SAME store fail closed.
const source=fs.readFileSync('apps_script.gs','utf8');
const ctx=vm.createContext({});
vm.runInContext(source,ctx);
ctx.SHARED_SECRET='synthetic-fixture-secret';
ctx._json=x=>x;
const props=new Map(),events=[];
ctx.PropertiesService={getScriptProperties:()=>({
  getProperty:k=>props.get(k)||null,
  setProperty:(k,v)=>props.set(k,v),
  deleteProperty:k=>props.delete(k)
})};
let count=0,held=false;
ctx.Utilities={getUuid:()=>String(++count).padStart(5,'0')};
ctx.LockService={getScriptLock:()=>({
  tryLock:ms=>{assert.equal(ms,20000);if(held)return false;held=true;events.push('acquire');return true},
  releaseLock:()=>{assert.equal(held,true);held=false;events.push('release')}
})};
ctx._annualBook=(key,year)=>{
  assert.equal(held,true,'Workbook creation/mapping must be under script lock');
  events.push('map '+key);return {
    getId:()=>key+'-'+year,
    getUrl:()=> 'https://example.invalid/'+key,
    getName:()=>year+' 근태'
  };
};
const sections={header:['직원명'],rows:[['fixture']]};
const post=key=>ctx.doPost({postData:{contents:JSON.stringify({
  secret:'synthetic-fixture-secret',ym:'2026-11',store_key:key,
  synced_at:'fixture',status_label:'fixture',
  attendance:sections,sessions:sections,payroll:sections
})}});
let nestedDifferent=null,nestedSame=null,recurse=true,writes=[];
ctx._writeMonth=(ss)=>{
  assert.equal(held,false,'Real spreadsheet write must never hold GLOBAL script lock');
  const key=ss.getId().split('-')[0];
  writes.push(key);
  if(key==='STORE_94'&&recurse){
    recurse=false;
    nestedDifferent=post('STORE_100');
    nestedSame=post('STORE_94');
  }
  return {verified_month_tabs:12};
};
const outer=post('STORE_94');
assert.equal(outer.ok,true);
assert.equal(nestedDifferent?.ok,true,
  'Separate store can write while previous store is already writing');
assert.equal(nestedSame?.error,'Error: SHEET_SYNC_BUSY',
  'Same store must be blocked until the first write finishes');
assert.equal(writes.join(','),'STORE_94,STORE_100');
assert.equal([...props.keys()].filter(k=>k.startsWith('ATTENDANCE_RUNNING_')).length,0,
  'Successful store writes release both independent leases');
assert.equal(post('STORE_94').ok,true,'Store can run again after release');
assert.equal(post('1').ok,true,'INHA legacy key uses the safe independent lease too');
assert.ok(events.indexOf('map STORE_100')>events.indexOf('release'),
  'Independent writer maps only after prior mapping lock released');
let throwWrite=true;
ctx._writeMonth=(ss)=>{
  if(ss.getId().startsWith('STORE_290')&&throwWrite)throw Error('SYNTHETIC_WRITE_FAIL');
  return {verified_month_tabs:12};
};
assert.match(post('STORE_290').error,/SYNTHETIC_WRITE_FAIL/);
throwWrite=false;
assert.equal(post('STORE_290').ok,true,'Failed write releases store lease');
assert.equal([...props.keys()].filter(k=>k.startsWith('ATTENDANCE_RUNNING_')).length,0);
assert.ok(source.includes('function _beginStoreSheetWrite'));
assert.ok(source.includes('function _endStoreSheetWrite'));
console.log('PASS parallel GAS store leases: distinct workbook writes overlap, same-store replay blocked, mapping atomic, errors reversible, INHA preserved');
