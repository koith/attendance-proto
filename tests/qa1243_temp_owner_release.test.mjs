import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTempOwnerRelease,OWNER_NOTICE_BEFORE,OWNER_NOTICE_AFTER} from '../scripts/qa1243_temp_owner_release.mjs';
const message='[QA1243-TEMP-OWNER-PAGES] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
const original=[
 '<button id="appVersion" aria-label="v0.363">v0.363</button>',
 'const APP_VERSION="v0.363";'
];
const valid=()=>[
 {filename:'index.html',status:'modified',patch:original.map(x=>'-'+x).concat(original.map(x=>'+'+x.replaceAll('v0.363','v0.364'))).join('\n')},
 {filename:'owner_temp_activation.html',status:'modified',patch:'-<script src="owner_temp_activation.js?v=20261026retry2" defer></script>\n+<script src="owner_temp_activation.js?v=20261026resume1" defer></script>'},
 {filename:'owner_temp_activation.js',status:'modified'}
];
test('the reviewed static release may skip operating Sheets writes',()=>{
 assert.equal(assertTempOwnerRelease(valid(),message),true);
});
test('a marker cannot exempt DB, Edge, recipes or ordinary app edits',()=>{
 for(const filename of ['supabase/migrations/unsafe.sql','supabase/functions/server-sync-sheet/index.ts',
  'apps_script.gs','operations_v1.js','actual_attendance.js'])
  assert.throws(()=>assertTempOwnerRelease([...valid(),{filename,status:'modified'}],message),/RELEASE_SCOPE/);
});
test('unexpected runtime configuration or callback HTML edits fail before publish',()=>{
 let f=valid();f[0].patch+='\n-const secret="old";\n+const secret="new";';
 assert.throws(()=>assertTempOwnerRelease(f,message),/VERSION_DIFF/);
 f=valid();f[1].patch+='\n+<script src="https://evil.example"></script>';
 assert.throws(()=>assertTempOwnerRelease(f,message),/HTML_DIFF/);
});
test('all release markers, files and non-destructive file status are required',()=>{
 assert.throws(()=>assertTempOwnerRelease(valid(),message.replace('[QA1243-NO-OPERATING-WRITE]','')),/MARKER_REQUIRED/);
 assert.throws(()=>assertTempOwnerRelease(valid().slice(1),message),/FILE_REQUIRED/);
 assert.throws(()=>assertTempOwnerRelease(valid().map(f=>({...f,status:'removed'})),message),/RELEASE_SCOPE/);
});
const noticeFiles=()=>{
 const before=['<button id="appVersion" aria-label="v0.366">v0.366</button>',
  'const APP_VERSION="v0.366";',"      view.innerHTML='"+OWNER_NOTICE_BEFORE+"';"];
 const after=before.map(l=>l.replaceAll('v0.366','v0.367').replace(OWNER_NOTICE_BEFORE,OWNER_NOTICE_AFTER));
 return [{filename:'index.html',status:'modified',patch:before.map(l=>'-'+l).concat(after.map(l=>'+'+l)).join('\n')}];
};
test('the reviewed approval notice changes text only and needs its own explicit marker',()=>{
 assert.equal(assertTempOwnerRelease(noticeFiles(),message+' [QA1243-OWNER-NOTICE]'),true);
 assert.throws(()=>assertTempOwnerRelease(noticeFiles(),message),/RELEASE_FILE_REQUIRED/);
});
test('approval notice cannot weaken READY routing or change any other runtime asset',()=>{
 const release=message+' [QA1243-OWNER-NOTICE]';
 const files=noticeFiles();files[0].patch+='\n-if(STORE_ENTRY_UNAVAILABLE){\n+if(false){';
 assert.throws(()=>assertTempOwnerRelease(files,release),/OWNER_NOTICE_RELEASE_HTML_DIFF/);
 for(const filename of ['owner_temp_activation.js','hq_store_onboarding_ui.js',
  'supabase/migrations/unsafe.sql','supabase/functions/server-sync-sheet/index.ts'])
  assert.throws(()=>assertTempOwnerRelease([...noticeFiles(),{filename,status:'modified'}],release),/RELEASE_SCOPE/);
});
