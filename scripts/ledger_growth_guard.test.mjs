import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessLedgerChange} from './ledger_growth_guard.mjs';
const backlog='PROJECT_BACKLOG_20261017.md';
const security='SECURITY_STABILITY_LEDGER_20261103.md';
test('allows only concise evidence updates to existing matching IDs',()=>{
 const old='## Archived evidence\n- [ ] **QA-06 (P1)** unfinished\nlast line\n';
 const newer='## Archived evidence\n- [x] **QA-06 (P1)** verified PR #45\nlast line\n';
 assert.equal(assessLedgerChange(old,newer,backlog).touched,1);
});
test('rejects append-only narratives and unrelated rewriting',()=>{
 const old='## Old log\n- [ ] **QA-06** pending\n';
 assert.throws(()=>assessLedgerChange(old,old+'## Yet another appended log\n',backlog),/APPEND_OR_DELETE/);
 assert.throws(()=>assessLedgerChange(old,'## edited\n- [ ] **QA-06** pending\n',backlog),/NARRATIVE_REWRITE/);
 assert.throws(()=>assessLedgerChange(old,'## Old log\n- [ ] **QA-07** pending\n',backlog),/ID_REWRITE/);
});
test('security/AISEC existing evidence changes remain scoped, no header changes',()=>{
 const sec='| SEC-S04 | Critical | description | IN_PROGRESS | evidence |\n';
 const changed=sec.replace('IN_PROGRESS','COMPLETE');
 assert.equal(assessLedgerChange(sec,changed,security).touched,1);
 assert.throws(()=>assessLedgerChange(sec,sec+'| NEW-S04 | add | NO |\n',security),/APPEND_OR_DELETE/);
 const ai='| AISEC-04 | description | IN_PROGRESS | evidence |\n';
 assert.equal(assessLedgerChange(ai,ai.replace('IN_PROGRESS','COMPLETE'),'AI_AUTOMATION_SECURITY_LEDGER_20261104.md').touched,1);
});
test('rejects excessively large single-row evidence and bulk edits',()=>{
 const s='- [ ] **QA-06** x\n';
 assert.throws(()=>assessLedgerChange(s,s.replace('x','x'.repeat(810)),backlog),/ROW_TOO_LONG/);
});
