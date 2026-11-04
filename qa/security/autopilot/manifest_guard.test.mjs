import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {checkManifest} from '../../../scripts/security/autopilot/manifest_guard.mjs';
test('manifest derives real table and row counts',()=>{
 const v=checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:2,data:{'public.one':[{a:1}], 'auth.users':[{id:1},{id:2}]}});
 assert.deepEqual(v,{table_count:2,row_count:3});
});
test('rejects declared table count mismatch',()=>{
 assert.throws(()=>checkManifest({format:'attendance-privileged-data-escrow-v1',table_count:4,data:{'public.one':[]}}),/TABLE_COUNT_MISMATCH/);
});
