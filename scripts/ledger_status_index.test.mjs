import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeStatusIndex,boundedIndex} from './ledger_status_index.mjs';

test('extracts checked, open, sec and AISEC statuses without full evidence text',()=>{
 const sources=[
  {kind:'development',path:'backlog.md',content:'- [x] **QA-04 (P0)** completed but remaining acceptance\n- [ ] **QA-06 (P1)** pending\n- [x] **QA-04 (old)** duplicate'},
  {kind:'security',path:'sec.md',content:'| SEC-S04 | Critical | restore | IN_PROGRESS | enormous evidence A |'},
  {kind:'agent_security',path:'ai.md',content:'| AISEC-04 | Risk | COMPLETE | evidence B |'}
 ];
 const idx=makeStatusIndex(sources);
 assert.equal(idx.count,4);
 assert.equal(idx.items.find(x=>x.id==='QA-04').status,'MARKED_DONE');
 assert.equal(idx.items.find(x=>x.id==='SEC-S04').status,'IN_PROGRESS');
 assert.ok(boundedIndex(sources).length<12000);
 assert.doesNotMatch(boundedIndex(sources),/enormous evidence|duplicate/);
});
test('real ledgers produce bounded index with valid known security status cells',()=>{
 const files=[
  {kind:'development',path:'PROJECT_BACKLOG_20261017.md'},
  {kind:'security',path:'SECURITY_STABILITY_LEDGER_20261103.md'},
  {kind:'agent_security',path:'AI_AUTOMATION_SECURITY_LEDGER_20261104.md'}
 ].map(x=>({...x,content:fs.readFileSync(x.path,'utf8')}));
 const r=makeStatusIndex(files);
 assert.ok(r.items.some(x=>x.id==='QA-06'&&x.status==='OPEN'));
 assert.ok(r.items.some(x=>x.id==='SEC-S03'&&x.status==='COMPLETE'));
 assert.ok(r.items.some(x=>x.id==='AISEC-04'&&x.status==='COMPLETE'));
 assert.equal(new Set(r.items.map(x=>x.kind+':'+x.id)).size,r.count);
 assert.ok(boundedIndex(files).length<=12000);
});
test('badly large source count fails rather than silently dropping tasks',()=>{
 const body=Array.from({length:161},(_,i)=>'- [ ] **TASK-'+String(i).padStart(3,'0')+'** pending').join('\n');
 assert.throws(()=>makeStatusIndex([{kind:'development',path:'bad.md',content:body}]),/INDEX_ITEM_LIMIT/);
});
