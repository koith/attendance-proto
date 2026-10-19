import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// QA-05: exercise the ACTUAL production doPost in an isolated Apps Script VM.
// Never use an external Google workbook or real payroll data.
const code=fs.readFileSync('apps_script.gs','utf8');
const context=vm.createContext({});
vm.runInContext(code,context);
context.SHARED_SECRET='qa-only-secret';
context._json=value=>value;
const events=[];
let grant=true,throwWrite=false,throwOpen=false,lockCount=0,openCount=0,writeCount=0,releaseCount=0;
context.LockService={
  getScriptLock:()=>({
    tryLock:ms=>{assert.equal(ms,20000);events.push('lock');lockCount++;return grant;},
    releaseLock:()=>{events.push('release');releaseCount++;}
  })
};
const workbook={getId:()=> 'fixture-id',getUrl:()=> 'https://example.invalid/qa',
  getName:()=> '2026 근태'};
context._annualBook=()=>{
  events.push('open');openCount++;
  if(throwOpen)throw Error('INACCESSIBLE_MAPPING');
  return workbook;
};
context._writeMonth=()=>{
  events.push('write');writeCount++;
  if(throwWrite)throw Error('SHEET_WRITE_ERROR');
  return {verified_month_tabs:12};
};
const payload=()=>({
  secret:'qa-only-secret',ym:'2026-10',store_key:'QA_7',synced_at:'test-only',
  status_label:'TEST',attendance:{header:['직원명'],rows:[['가상직원']]},
  sessions:{header:[],rows:[]},payroll:{header:[],rows:[]}
});
const post=body=>context.doPost({postData:{contents:JSON.stringify(body)}});
const good=post(payload());
assert.equal(good.ok,true);
assert.equal(good.spreadsheet_id,'fixture-id');
assert.deepEqual(events,['lock','open','write','release'],'write and annual mapping must run under the same lease');

events.length=0;grant=false;
const busy=post(payload());
assert.equal(busy.ok,false);
assert.equal(busy.error,'SHEET_SYNC_BUSY','concurrent report must fail closed with retryable marker');
assert.deepEqual(events,['lock'],'busy request must not touch a workbook or release a lock it did not acquire');
assert.equal(openCount,1);assert.equal(writeCount,1);assert.equal(releaseCount,1);

events.length=0;
const invalid=payload();invalid.attendance.rows=[['wrong-width','second']];
assert.equal(post(invalid).error,'BAD_ROW_SHAPE');
assert.deepEqual(events,[],'invalid payload rejected BEFORE any lock or workbook access');

events.length=0;grant=true;throwOpen=true;
assert.match(post(payload()).error,/INACCESSIBLE_MAPPING/);
assert.deepEqual(events,['lock','open','release'],'mapping exception releases script lock');
events.length=0;throwOpen=false;throwWrite=true;
assert.match(post(payload()).error,/SHEET_WRITE_ERROR/);
assert.deepEqual(events,['lock','open','write','release'],'sheet write exception releases script lock');

events.length=0;throwWrite=false;
assert.equal(post(payload()).ok,true,'next sync succeeds after the failed writer');
assert.deepEqual(events,['lock','open','write','release']);
assert.equal(lockCount,5);
assert.equal(openCount,4);
assert.equal(writeCount,3);
assert.equal(releaseCount,4);
assert.ok(code.indexOf('tryLock(20000)')<code.indexOf('_annualBook(storeKey, year)'),
 'the actual annual workbook must never open before the script lock');
assert.ok(code.indexOf('_annualBook(storeKey, year)')<code.indexOf('syncLock.releaseLock()'));
console.log('PASS QA-05 synchronized report write: busy fails without touching Sheets; lock released on success, mapping and write errors; malformed data rejected before lock');
