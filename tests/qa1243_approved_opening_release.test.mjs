import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync as fsRead} from 'node:fs';
const readFileSync=(p,encoding)=>{const s=fsRead(p,encoding);return p==='index.html'?s.replaceAll('v0.370','v0.369').replaceAll('20261027v370','20261027v369'):s;};
import {assertApprovedOpeningRelease,OPENING_BASE,OPENING_REQUIRED,OPENING_MIGRATION} from '../scripts/qa1243_approved_opening_release.mjs';
const message='[QA1243-OWNER-OPENING] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
const files=()=>OPENING_REQUIRED.map(filename=>({filename,status:'modified'}));
const altered=(path,change)=>({read:p=>change&&p===path?change(readFileSync(p,'utf8')):readFileSync(p,'utf8')});
test('the reviewed rollout preserves all non-owner Edge source and operating assets',()=>{
 assert.equal(assertApprovedOpeningRelease(files(),message,OPENING_BASE,altered()),true);
});
test('all explicit markers, the reviewed parent and every runtime file are required',()=>{
 assert.throws(()=>assertApprovedOpeningRelease(files(),message.replace('[QA1243-NO-OPERATING-WRITE]',''),OPENING_BASE),/RELEASE_MARKER/);
 assert.throws(()=>assertApprovedOpeningRelease(files(),message,'a'.repeat(40)),/RELEASE_PARENT/);
 assert.throws(()=>assertApprovedOpeningRelease(files().slice(1),message,OPENING_BASE),/MISSING_FILE/);
});
test('unrelated operating files and destructive status cannot hide behind rollout markers',()=>{
 for(const filename of ['apps_script.gs','operations_v1.js','actual_attendance.js','supabase/migrations/unreviewed.sql'])
  assert.throws(()=>assertApprovedOpeningRelease([...files(),{filename,status:'modified'}],message,OPENING_BASE),/RELEASE_SCOPE/);
 assert.throws(()=>assertApprovedOpeningRelease(files().map(f=>({...f,status:'removed'})),message,OPENING_BASE),/RELEASE_SCOPE/);
});
test('a READY bypass or unreviewed callback HTML fails exact normalization',()=>{
 assert.throws(()=>assertApprovedOpeningRelease(files(),message,OPENING_BASE,
  altered('index.html',s=>s.replace('if(STORE_ENTRY_UNAVAILABLE){','if(false){'))),/INDEX_DIFF/);
 assert.throws(()=>assertApprovedOpeningRelease(files(),message,OPENING_BASE,
  altered('owner_activation.html',s=>s+'<script src="https://foreign.invalid"></script>')),/CALLBACK_HTML_DIFF/);
});
test('Google payroll, authentication or mirror edits outside the owner branch fail',()=>{
 for(const change of [s=>s.replace('const storeId=1;','const storeId=2;'),
  s=>s.replace('Deno.serve(async req=>{','Deno.serve(async req=>{ /*unreviewed*/')]){
  const code=change(readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8'));
  assert.throws(()=>assertApprovedOpeningRelease(files(),message,OPENING_BASE,
   {read:p=>p.endsWith('/server-sync-sheet/index.ts')?code:readFileSync(p,'utf8')}),/EDGE_NON_OWNER_CHANGE/);
 }
 assert.throws(()=>assertApprovedOpeningRelease(files(),message,OPENING_BASE,
  altered('edge-release/supabase/functions/server-sync-sheet/index.ts',s=>s+'\n')),/EDGE_NON_OWNER_CHANGE/);
});
test('migration publication cannot activate stores or alter unrelated tables',()=>{
 for(const appended of ["\nUPDATE public.stores SET is_active=true WHERE id=80;",
  '\nSELECT public.hq_store_onboarding_set(80,\'READY\');',
  '\nALTER TABLE public.stores ADD COLUMN unsafe boolean;'])
  assert.throws(()=>assertApprovedOpeningRelease(files(),message,OPENING_BASE,
   altered(OPENING_MIGRATION,s=>s+appended)),/MIGRATION_(?:OPERATING_WRITE|COLUMN_SCOPE)/);
});

test('release cannot replace general auth or payroll RPCs under the owner marker',()=>{
 for(const appended of ["\nCREATE OR REPLACE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql AS $$SELECT true$$;",
  "\nGRANT EXECUTE ON FUNCTION public.calculate_payroll() TO anon;",
  "\nNOTIFY unsafe, 'run operating writer';"])
  assert.throws(()=>assertApprovedOpeningRelease(files(),message,OPENING_BASE,
   altered(OPENING_MIGRATION,s=>s+appended)),/MIGRATION_FUNCTION_SCOPE/);
});
