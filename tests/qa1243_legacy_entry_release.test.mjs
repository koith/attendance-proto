import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertLegacyEntryRelease,LEGACY_BASE,LEGACY_BYTES} from '../scripts/qa1243_legacy_entry_release.mjs';
const files=Object.keys(LEGACY_BYTES).map(filename=>({filename,status:'modified'}));
const message='[QA1243-LEGACY-ENTRY] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
test('only the exact reviewed startup and public manifest builder may publish',()=>{
 assert.equal(assertLegacyEntryRelease(files,message,LEGACY_BASE),true);
});
test('missing safety marker, changed main and incomplete runtime bytes block publication',()=>{
 for(const m of message.split(' '))assert.throws(()=>assertLegacyEntryRelease(files,message.replace(m,''),LEGACY_BASE),/MARKER/);
 assert.throws(()=>assertLegacyEntryRelease(files,message,'a'.repeat(40)),/PARENT/);
 assert.throws(()=>assertLegacyEntryRelease(files.slice(1),message,LEGACY_BASE),/REQUIRED/);
 for(const path of Object.keys(LEGACY_BYTES))assert.throws(()=>assertLegacyEntryRelease(files,message,LEGACY_BASE,{read:p=>readFileSync(p,'utf8')+(path===p?'\n// unreviewed':'')}),/BYTES/);
});
test('operating, SQL, Edge, Auth callback, unknown and removed assets cannot hide in static repair',()=>{
 for(const filename of ['apps_script.gs','actual_attendance.js','owner_activation.js','supabase/migrations/unreviewed.sql','supabase/functions/server-sync-sheet/index.ts','unknown.js'])
  assert.throws(()=>assertLegacyEntryRelease([...files,{filename,status:'modified'}],message,LEGACY_BASE),/SCOPE/);
 assert.throws(()=>assertLegacyEntryRelease(files.map(f=>({...f,status:'removed'})),message,LEGACY_BASE),/SCOPE/);
});
test('both publication and Google exclusion validate the same reviewed repair scope',()=>{
 for(const path of ['.github/workflows/p0-pages-deploy.yml','.github/workflows/qa1243-live-e2e.yml']){
  const s=readFileSync(path,'utf8');assert.match(s,/QA1243-LEGACY-ENTRY/);assert.match(s,/assertLegacyEntryRelease/);
 }
 const independent=readFileSync('.github/workflows/qa1243-owner-ready-pages-independent.yml','utf8');
 assert.match(independent,/qa1243_legacy_pages_readback/);assert.match(independent,/qa_legacy_entry_browser_v372\.mjs --live/);
 assert.match(readFileSync('.github/workflows/p0-pages-deploy.yml','utf8'),/qa1243_legacy_release_manifest/);
});
