import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildQa1243GAS} from './scripts/qa1243_build_isolated_gas.mjs';
const original=readFileSync('apps_script.gs','utf8');
const secret='QA1243_64_CHARACTERS_OR_MORE_FAKE_ONLY_TEST_SECRET_NO_REAL_SYSTEM_VALUE_123456';
const qa=buildQa1243GAS(original,secret);
assert.equal(original.includes('QA1243_MAPPED_WORKBOOK_FOREIGN'),false,
  'Operating Apps Script must not be modified by test-only transformation');
assert.match(qa,/QA1243_MAPPED_WORKBOOK_FOREIGN/);
assert.match(qa,/QA1243_STORE_KEY_REQUIRED/);
assert.match(qa,/qa1243AuthorizeServices/);
assert.ok(!qa.includes("ss = SpreadsheetApp.create(year + ' 근태');"));
assert.throws(()=>buildQa1243GAS(original,'tiny'),/Dedicated random/);
assert.throws(()=>buildQa1243GAS(original.replace('SpreadsheetApp.create(year + \' 근태\');','SpreadsheetApp.create(\'unexpected\');'),secret),
  /QA source contract changed/,'Do not publish after upstream writer code drift');

// Exercise the exact generated Apps Script _annualBook function in a Node VM.
// We intentionally use a mapped workbook accessible to the script owner to
// reproduce the dangerous case: previous version would rename/overwrite it.
const from=qa.indexOf('function _annualBook(storeKey, year){');
const to=qa.indexOf('\nfunction _ensureMonthTabs(',from);
assert.ok(from>=0&&to>from);
const body=qa.slice(from,to);
const test=(initialTitle,knownId)=>{
  const originalId='1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024';
  const oldSheet={id:originalId,title:initialTitle,getId(){return this.id;},getName(){return this.title;}};
  const state={mapped:knownId||null,opened:0,created:0,renamed:0,tabs:0};
  const ctx={
    PropertiesService:{getScriptProperties(){return{
      getProperty(){return state.mapped;},getProperties(){return{};},setProperty(_k,id){state.mapped=id;}
    }}},
    SpreadsheetApp:{openById(id){state.opened++;assert.equal(id,knownId);return oldSheet;},
      getActiveSpreadsheet(){return null;},create(title){state.created++;return{
        getId(){return'NEW_QA_ONLY'},getName(){return title;}};}},
    DriveApp:{getFileById(){state.renamed++;return {setName(){state.renamed++},moveTo(){}}}},
    _ensureMonthTabs(){state.tabs++},
    Error
  };
  vm.runInNewContext(body+'\nthis.__fn=_annualBook;',ctx);
  return {fn:ctx.__fn,state};
};
const prod=test('2026 근태','1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024');
assert.throws(()=>prod.fn('QA1243_SBX_A1B2C3D4',2026),/QA1243_MAPPED_WORKBOOK_FOREIGN/);
assert.equal(prod.state.opened,1);
assert.equal(prod.state.created,0);
assert.equal(prod.state.renamed,0);
assert.equal(prod.state.tabs,0);
const otherQa=test('QA1243 QA1243_SBX_OTHERID1 2026 근태','1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024');
assert.throws(()=>otherQa.fn('QA1243_SBX_A1B2C3D4',2026),/QA1243_MAPPED_WORKBOOK_FOREIGN/);
assert.equal(otherQa.state.renamed,0);
const correctQa=test('QA1243 QA1243_SBX_A1B2C3D4 2026 근태','REUSABLE_QA_WORKBOOK');
correctQa.fn('QA1243_SBX_A1B2C3D4',2026);
assert.equal(correctQa.state.tabs,1);
assert.equal(correctQa.state.created,0);
assert.equal(correctQa.state.renamed,0);
const fresh=test('no active report',null);
fresh.fn('QA1243_SBX_A1B2C3D4',2026);
assert.equal(fresh.state.created,1);
assert.equal(fresh.state.tabs,1);

// A direct caller (not only the Edge caller) must never coerce INHA or 1
// into the isolated QA writer; reject before taking a lock or touching Drive.
const doStart=qa.indexOf('function doPost(e){'),doEnd=qa.indexOf('\n/**',doStart);
assert.ok(doStart>=0&&doEnd>doStart);
const qaPost=qa.slice(doStart,doEnd);
for(const bad of ['INHA','1','705','QA1243_SBX_BAD!',null]){
 let locks=0;
 const ctx={
  SHARED_SECRET:secret,
  _validateSheetPayload:()=>null,
  _json:x=>x,
  LockService:{getScriptLock(){locks++;throw Error('no lock allowed')}},
  JSON,
  Error,
 };
 vm.runInNewContext(qaPost+'\nthis.__post=doPost;',ctx);
 const payload={secret,ym:'2026-10',store_key:bad,
   attendance:{header:[],rows:[]},sessions:{header:[],rows:[]},payroll:{header:[],rows:[]}};
 const res=ctx.__post({postData:{contents:JSON.stringify(payload)}});
 assert.equal(res.error,'QA1243_STORE_KEY_REQUIRED',String(bad));
 assert.equal(locks,0,'Invalid store key must never access Drive or Sheet');
}
// Only the independent QA deployment gets the health probe. It must not
// read secrets, acquire a lock or reach Drive/Sheets before returning JSON.
const getStart=qa.indexOf('function doGet(){');
const getEnd=qa.indexOf('\nfunction qa1243AuthorizeServices()',getStart);
assert.ok(getStart>0&&getEnd>getStart,'Isolated generated writer needs GET');
const getBody=qa.slice(getStart,getEnd);
assert.match(getBody,/QA1243_PUBLICATION_GET_ONLY/);
assert.doesNotMatch(getBody,/SpreadsheetApp|DriveApp|LockService|PropertiesService|SHARED_SECRET|_writeMonth|_annualBook/);
const getContext={_json:v=>v};
vm.runInNewContext(getBody+'\nthis.__get=doGet;',getContext);
assert.equal(getContext.__get().probe,'QA1243_PUBLICATION_GET_ONLY');
assert.equal(getContext.__get().ok,true);
// The owner-only helper has no mutable Sheet or account operation.
const scopeBegin=qa.indexOf('function qa1243AuthorizeServices(){');
assert.ok(scopeBegin>0);
const scopeBody=qa.slice(scopeBegin,qa.indexOf('\n',scopeBegin)+1);
assert.match(scopeBody,/QA1243_AUTH_SCOPE_CHECK_ONLY/);
assert.doesNotMatch(scopeBody,/\.create\(|\.insert|\.delete|\.update|\.clear|\.setProperty|\.setValue|\.setName|\.moveTo|\.append/);
console.log('PASS #1243 QA-only GAS map guard: foreign operating workbook, foreign QA workbook, legitimate reuse, fresh create, invalid store writes blocked before lock; operating script untouched');
