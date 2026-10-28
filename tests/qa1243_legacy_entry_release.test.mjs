import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertLegacyEntryRelease,LEGACY_BASE,LEGACY_BYTES} from '../scripts/qa1243_legacy_entry_release.mjs';
const files=Object.keys(LEGACY_BYTES).map(filename=>({filename,status:'modified'}));
const message='[QA1243-PROTECTED-TAB-ENTRY] [QA1243-ASSISTANT-UX] [QA1243-STAFF-STOCKTAKE-UI] [QA1243-AUTH-MAIL-BRANDING] [QA1243-OWNER-PASSWORD-FEEDBACK] [QA1243-LEGACY-ENTRY] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
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
 for(const filename of ['apps_script.gs','actual_attendance_unreviewed.js','owner_activation_other.js','supabase/migrations/unreviewed.sql','supabase/functions/server-sync-sheet/index.ts','unknown.js'])
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


test('deployed v0.373 evidence repair cannot republish or change operating source',()=>{
 const markers='[QA1243-LEGACY-ENTRY] [QA1243-LEGACY-EVIDENCE] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
 const parent='7087f7c1c9ffaa3f1e09e91ebc0f4a57d7383265';
 const qa=[{filename:'qa_legacy_entry_browser_v372.mjs',status:'modified'}];
 assert.equal(assertLegacyEntryRelease(qa,markers,parent),true);
 assert.throws(()=>assertLegacyEntryRelease(qa,markers+' [QA1243-APP-PAGES]',parent),/PARENT/);
 assert.throws(()=>assertLegacyEntryRelease([...qa,{filename:'index.html',status:'modified'}],markers,parent),/SCOPE/);
 assert.throws(()=>assertLegacyEntryRelease(qa,markers,parent,{read:p=>readFileSync(p,'utf8')+'changed'}),/BYTES/);
 assert.throws(()=>assertLegacyEntryRelease(qa,markers,parent.replace(/^7/,'8')),/PARENT/);
});
