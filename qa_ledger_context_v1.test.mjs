import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactLedgerContext} from './scripts/ledger_context.mjs';

test('no query emits only file metadata, never full original text', () => {
  const result = compactLedgerContext([{path:'ledger.md',content:'private context '+ 'A'.repeat(100000)}]);
  assert.ok(result.length < 1000);
  assert.doesNotMatch(result,/private context|AAAAA/);
  assert.equal(JSON.parse(result).sources[0].chars, 100016);
});
test('exact task ID returns canonical row and recent relevant evidence only', () => {
  const body = [
    '| ID | status |',
    '| SEC-S04 | IN_PROGRESS |',
    '| SEC-S040 | DIFFERENT |',
    'historical SEC-S04 note',
    'new SEC-S04 evidence'
  ].join('\n');
  const obj = JSON.parse(compactLedgerContext([{path:'ledger.md',content:body}],'SEC-S04'));
  assert.ok(obj.hits.some(x=>x.excerpt.includes('IN_PROGRESS')));
  assert.ok(obj.hits.some(x=>x.excerpt.includes('new SEC-S04 evidence')));
  assert.ok(obj.hits.every(x=>!x.excerpt.includes('SEC-S040')));
});
test('large matching lines and many hits respect output cap', () => {
  const body = Array.from({length:500},(_,i)=>'SEC-S01 case '+i+' '+'x'.repeat(500)).join('\n');
  const output = compactLedgerContext([{path:'ledger.md',content:body}],'SEC-S01',1600);
  assert.ok(output.length <= 1600);
  assert.ok(JSON.parse(output).hits.length <= 4);
});
test('unsafe query and unsafe budget are rejected',()=>{
  assert.throws(()=>compactLedgerContext([], '../../secrets'),/INVALID_TASK_ID/);
  assert.throws(()=>compactLedgerContext([], 'SEC-S04', 20),/INVALID_CONTEXT_INPUT/);
});
