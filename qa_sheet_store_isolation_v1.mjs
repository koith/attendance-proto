import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Isolated Apps Script exercise: all Sheets/Drive/Properties operations are
// in-memory fakes. No production workbook, IDs, properties or payroll are touched.
const source=fs.readFileSync('apps_script.gs','utf8');
const vmContext=vm.createContext({});
vm.runInContext(source,vmContext);
const books=new Map();
const active={id:'original-active-primary',name:'2026 근태'};
books.set(active.id,active);
const props=new Map(),created=[];
const apiBook=row=>({
 getId:()=>row.id,getUrl:()=> 'https://example.invalid/'+row.id,
 getName:()=>row.name
});
let activeBook=apiBook(active),next=0;
vmContext.PropertiesService={getScriptProperties:()=>({
 getProperty:key=>props.get(key)||null,
 setProperty:(key,value)=>props.set(key,value),
 deleteProperty:key=>props.delete(key),
 getProperties:()=>Object.fromEntries(props)
})};
vmContext.SpreadsheetApp={
 getActiveSpreadsheet:()=>activeBook,
 openById:id=>{if(!books.has(id))throw Error('UNKNOWN_FILE');return apiBook(books.get(id));},
 create:name=>{
  const row={id:'isolated-new-'+(++next),name};
  books.set(row.id,row);created.push(row.id);return apiBook(row);
 }
};
vmContext.DriveApp={
 getFileById:id=>{
  const row=books.get(id);assert.ok(row,'fake Drive reference must exist');
  return {setName:name=>{row.name=name;},
   getParents:()=>({hasNext:()=>false})};
 }
};
vmContext._ensureMonthTabs=()=>{};
const branch=vmContext._annualBook('2',2026);
assert.equal(branch.getId(),'isolated-new-1',
 'First sync of a secondary store MUST create an independent workbook');
assert.notEqual(branch.getId(),active.id);
assert.equal(props.get('ATTENDANCE_BOOK_2_2026'),branch.getId());
assert.equal(vmContext._annualBook('2',2026).getId(),branch.getId(),
 'Re-sync is idempotent: retain the already assigned workbook');
assert.deepEqual(created,['isolated-new-1'],'repeated sync never creates another file');
const primary=vmContext._annualBook('1',2026);
assert.equal(primary.getId(),active.id,
 'Primary store may adopt the existing bound operational workbook');
assert.equal(props.get('ATTENDANCE_BOOK_1_2026'),active.id);
assert.equal(vmContext._annualBook('3',2026).getId(),'isolated-new-2');
assert.equal(props.get('ATTENDANCE_BOOK_3_2026'),'isolated-new-2');
assert.notEqual(props.get('ATTENDANCE_BOOK_3_2026'),branch.getId());
assert.equal(active.name,'2026 근태','other stores cannot rename the primary workbook');
vmContext.SHARED_SECRET='fixture-secret';
vmContext._json=x=>x;
let writes=0;
vmContext._writeMonth=()=>{writes++;return {column_width_readback_verified:true};};
const post=key=>vmContext.doPost({postData:{contents:JSON.stringify({
 secret:'fixture-secret',store_key:key,ym:'2026-10',synced_at:'test-only',
 status_label:'test-only',attendance:{header:[],rows:[]},
 sessions:{header:[],rows:[]},payroll:{header:[],rows:[]}
})}});
for(const k of ['A/B','A B','가게 1','', 'x'.repeat(49),true]){
 const count=created.length,write=writes;
 const res=post(k);
 assert.equal(res.error,'BAD_STORE_KEY','Unsafe/ambiguous store key rejected: '+k);
 assert.equal(created.length,count,'No new workbook for malformed key');
 assert.equal(writes,write,'No monthly report cleared for malformed key');
}
assert.equal(post('2').ok,true,'valid existing store isolated sync still works');
assert.equal(writes,1);
assert.equal(vmContext._annualBook('INHA',2026).getId(),'isolated-new-3',
 'Legacy INHA may not reuse the already claimed primary active workbook');
console.log('PASS QA-05 primary workbook protected; new stores independent, property readback stable, unsafe keys rejected before any Sheet write');
