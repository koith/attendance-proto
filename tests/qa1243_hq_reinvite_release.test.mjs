import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertHqReinviteRelease,REINVITE_BASE,REINVITE_ASSETS} from '../scripts/qa1243_hq_reinvite_release.mjs';
const files=Object.keys(REINVITE_ASSETS).map(filename=>({filename,status:'modified'}));
const message='[QA1243-OWNER-REINVITE] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
test('the frozen v0.370 owner re-invite release is strict but does not prohibit separately reviewed later versions',()=>{
 const html=readFileSync('index.html','utf8');
 const version=html.match(/const APP_VERSION="(v0\.\d+)"/)?.[1];
 assert.ok(version,'app release version must be visible');
 const releaseNumber=Number(version.slice(3));
 if(version==='v0.370'){
  assert.equal(assertHqReinviteRelease(files,message,REINVITE_BASE),true);
 }else{
  // The original reviewed assets remain pinned by assertHqReinviteRelease,
  // which must REJECT any newer index bytes when invoked for the v0.370 release.
  assert.ok(releaseNumber>370,'unexpected older app release');
  assert.throws(()=>assertHqReinviteRelease(files,message,REINVITE_BASE),/ASSET_BYTES/,
   'v0.370 pin must never silently authorize a later index release');
 }
});
test('all markers, exact current main and all three reviewed assets are mandatory',()=>{
 for(const marker of message.split(' '))assert.throws(()=>assertHqReinviteRelease(files,message.replace(marker,''),REINVITE_BASE),/MARKER/);
 assert.throws(()=>assertHqReinviteRelease(files,message,'a'.repeat(40)),/PARENT/);
 assert.throws(()=>assertHqReinviteRelease(files.slice(1),message,REINVITE_BASE),/ASSET_REQUIRED/);
});
test('unknown, SQL, Edge, callback, Google and deleted assets are rejected',()=>{
 for(const filename of ['unknown.js','supabase/migrations/unsafe.sql','supabase/functions/server-sync-sheet/index.ts','owner_activation.js','actual_attendance.js','apps_script.gs'])
  assert.throws(()=>assertHqReinviteRelease([...files,{filename,status:'modified'}],message,REINVITE_BASE),/SCOPE/);
 assert.throws(()=>assertHqReinviteRelease(files.map(f=>({...f,status:'removed'})),message,REINVITE_BASE),/SCOPE/);
});
test('any unreviewed client bytes are rejected, including a weakened route guard',()=>{
 for(const path of Object.keys(REINVITE_ASSETS))
  assert.throws(()=>assertHqReinviteRelease(files,message,REINVITE_BASE,{read:p=>readFileSync(p,'utf8')+(p===path?'\n// unexpected':'')}),/ASSET_BYTES/);
});
test('all release consumers validate the same marker and preserve real readback',()=>{
 for(const p of ['.github/workflows/p0-pages-deploy.yml','.github/workflows/qa1243-live-e2e.yml']){
  const s=readFileSync(p,'utf8');assert.match(s,/QA1243-OWNER-REINVITE/);assert.match(s,/assertHqReinviteRelease/);
 }
 const pages=readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
 assert.match(pages,/smoke\.mjs --before --reinvite/);assert.match(pages,/smoke\.mjs --after --reinvite/);
 assert.match(readFileSync('.github/workflows/qa1243-owner-ready-pages-independent.yml','utf8'),/smoke\.mjs --independent --reinvite/);
});
