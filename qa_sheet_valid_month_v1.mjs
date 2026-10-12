import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source=fs.readFileSync('apps_script.gs','utf8');
assert.match(source,/if\(!body\.ym \|\| !\/\^20\\d\{2\}-\(\?:0\[1-9\]\|1\[0-2\]\)\$\/\.test\(body\.ym\)\)/,
  'Year-month input must allow only 20xx and valid 01..12 months');
const context=vm.createContext({});
vm.runInContext(source,context);
context.SHARED_SECRET='fixture_not_a_real_secret';
context._json=obj=>obj;
let workbookCalls=0,writeCalls=0,seen=null;
const book={
  getId:()=> 'synthetic-spreadsheet',
  getUrl:()=> 'https://example.invalid/synthetic',
  getName:()=> '2026 근태'
};
context._annualBook=(store,year)=>{
  workbookCalls++; seen={store,year};
  return book;
};
context._writeMonth=(ss,name,meta,attendance,sessions,payroll)=>{
  writeCalls++; seen={...seen,name};
  assert.equal(ss,book);
  return {column_width_readback_verified:true};
};
const post=ym=>context.doPost({postData:{contents:JSON.stringify({
  secret:'fixture_not_a_real_secret',ym,synced_at:'synthetic-only',
  status_label:'테스트',attendance:{header:[],rows:[]},
  sessions:{header:[],rows:[]},payroll:{header:[],rows:[]}
})}});
for(const invalid of [
  null,'','2026-00','2026-13','2026-99','2026-1','2026-001',
  '2026-10-01','2026-10 ','1999-12','0000-10','2100-01','x026-10'
]){
  const before=workbookCalls, writes=writeCalls;
  assert.equal(post(invalid).error,'BAD_YM','Invalid month should reject: '+invalid);
  assert.equal(workbookCalls,before,'Invalid month must not access any workbook');
  assert.equal(writeCalls,writes,'Invalid month must not touch any Sheet');
}
for(const valid of ['2025-12','2026-01','2026-02','2026-10','2026-12','2099-12']){
  const result=post(valid);
  assert.equal(result.ok,true,'Valid year/month must be accepted: '+valid);
  assert.equal(seen.year,Number(valid.slice(0,4)));
  assert.equal(seen.name,Number(valid.slice(5))+'월');
  assert.equal(result.ym,valid);
}
assert.equal(workbookCalls,6);
assert.equal(writeCalls,6);
console.log('PASS invalid year/month rejected before workbook/Sheet writes; valid months still sync normally');
