import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertStoreIsolationRelease,ISOLATION_BASE,ISOLATION_ASSETS} from '../scripts/qa1243_store_isolation_release.mjs';
const files=()=>Object.keys(ISOLATION_ASSETS).map(filename=>({filename,status:'modified'}));
const message='[QA1243-STORE-ISOLATION] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
test('only the reviewed three static runtime files may ship under this marker',()=>{
 assert.equal(assertStoreIsolationRelease(files(),message,ISOLATION_BASE),true);
});
test('markers, reviewed parent and every changed runtime asset are mandatory',()=>{
 assert.throws(()=>assertStoreIsolationRelease(files(),message.replace('[QA1243-NO-GOOGLE-RERUN]',''),ISOLATION_BASE),/MARKER/);
 assert.throws(()=>assertStoreIsolationRelease(files(),message,'0'.repeat(40)),/PARENT/);
 assert.throws(()=>assertStoreIsolationRelease(files().slice(1),message,ISOLATION_BASE),/ASSET_REQUIRED/);
});
test('SQL, Edge, payroll, Google, security and unrelated assets cannot be hidden in static release',()=>{
 for(const filename of ['supabase/migrations/unreviewed.sql','supabase/functions/server-sync-sheet/index.ts',
  'apps_script.gs','operations_v1.js','owner_activation.js'])
  assert.throws(()=>assertStoreIsolationRelease([...files(),{filename}],message,ISOLATION_BASE),/SCOPE/);
 assert.throws(()=>assertStoreIsolationRelease(files().map(f=>({...f,status:'removed'})),message,ISOLATION_BASE),/SCOPE/);
});
test('a weaker account guard or unreviewed callback code fails exact source hashes',()=>{
 for(const path of Object.keys(ISOLATION_ASSETS))
  assert.throws(()=>assertStoreIsolationRelease(files(),message,ISOLATION_BASE,
   {read:p=>readFileSync(p,'utf8')+(p===path?'\n/* unreviewed */':'')}),/UNREVIEWED_ASSET/);
});
