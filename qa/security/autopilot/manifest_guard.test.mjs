import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {checkManifest} from '../../../scripts/security/autopilot/manifest_guard.mjs';

test('manifest derives real table and row counts',()=>{
 const v=checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:2,data:{'public.one':[{a:1}], 'auth.users':[{id:1},{id:2}]}});
 assert.deepEqual(v,{table_count:2,row_count:3});
});
test('rejects declared table count mismatch',()=>{
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:4,data:{'public.one':[]}}),/TABLE_COUNT_MISMATCH/);
});
test('accepts matching synthetic digest, row count, and timestamp',()=>{
 const rows=[{a:1}];
 const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 const receipt={format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':rows},table_digests:{'public.one':digest},table_row_counts:{'public.one':1},timestamp:'2026-11-04T01:49:03.000Z'};
 assert.deepEqual(checkManifest(receipt),{table_count:1,row_count:1});
});
test('rejects mismatched table content digest',()=>{
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':[{a:1}]},table_digests:{'public.one':'0'.repeat(64)}}),/TABLE_DIGEST_MISMATCH/);
});
test('rejects duplicate or invalid table IDs',()=>{
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:2,data:{'public.one':[],'PUBLIC.ONE':[]}}),/DUPLICATE_TABLE_ID/);
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'invalid-id':[]}}),/INVALID_TABLE_ID/);
});
test('rejects truncated row declarations and malformed timestamps',()=>{
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':[{a:1}]},table_row_counts:{'public.one':2}}),/TRUNCATED_ROWS/);
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':[]},timestamp:'not-a-timestamp'}),/INVALID_TIMESTAMP/);
});
test('rejects malformed rows despite matching metadata',()=>{
 for (const row of [null, 7, 'row', [], {a:undefined}]) {
  const rows=[row];
  const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const receipt={format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':rows},table_digests:{'public.one':digest},table_row_counts:{'public.one':1}};
  assert.throws(()=>checkManifest(receipt),/INVALID_ROW/);
 }
 const rows=[null];
 rows[Symbol.iterator]=function*(){yield {a:1};};
 const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 const receipt={format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':rows},table_digests:{'public.one':digest},table_row_counts:{'public.one':1}};
 assert.throws(()=>checkManifest(receipt),/INVALID_ROW/);
});
test('rejects nested unsafe values, getters, cycles and missing array slots',()=>{
 const self={a:1}; self.b=self;
 const withGetter={}; Object.defineProperty(withGetter,'a',{get(){throw Error('should never run getter')},enumerable:true});
 for(const row of [{a:[1,undefined]},{a:NaN},{a:self},withGetter,{a:new Date(0)},{a:[,2]}]) {
  assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:1,data:{'public.one':[row]}}),/INVALID_ROW/);
 }
});
