import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertStoreIsolationRelease,ISOLATION_BASE,ISOLATION_ASSETS} from '../scripts/qa1243_store_isolation_release.mjs';
const files=()=>Object.keys(ISOLATION_ASSETS).map(filename=>({filename,status:'modified'}));
// Reconstruct only the released v0.368 index; production old-release guard stays strict.
const reviewed=p=>{const s=readFileSync(p,'utf8');return p==='index.html'?s.replaceAll('v0.369','v0.368')
 .replaceAll('hq_owner_console.js?v=20261027v369','hq_owner_console.js?v=20261020v352')
 .replaceAll('hq_store_onboarding_ui.js?v=20261027v369','hq_store_onboarding_ui.js?v=20261026v362'):s;};
const message='[QA1243-STORE-ISOLATION] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
test('only the reviewed three static runtime files may ship under this marker',()=>{
 assert.equal(assertStoreIsolationRelease(files(),message,ISOLATION_BASE,{read:reviewed}),true);
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
