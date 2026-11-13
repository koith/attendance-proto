import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublishedUiAsset,checkReleaseVersion} from '../scripts/release_version_guard.mjs';

function html(v){
 return '<button id="appVersion" title="현재 앱 버전" aria-label="현재 앱 버전 '+v+'">'+v+'</button>\nconst APP_VERSION="'+v+'";';
}
const pass=(changedPaths)=>checkReleaseVersion({before:html('v0.386'),after:html('v0.387'),changedPaths});

test('all published standalone app assets require a release version bump',()=>{
 for(const path of ['index.html','actual_attendance.js','operations_reference_ui_v208.js','operations_v1.css',
  'version_test_toggle_982.js','owner_activation.html','logo_combine.jpg','images/a.png','assets/ui/icon.svg']){
  assert.equal(isPublishedUiAsset(path),true,path);
  assert.deepEqual(pass([path]).published,[path]);
  assert.throws(()=>checkReleaseVersion({before:html('v0.386'),after:html('v0.386'),changedPaths:[path]}),
    /APP_VERSION_NOT_INCREMENTED/,path);
 }
});
test('non-public tests, migrations, scripts and docs do not demand an app version change',()=>{
 for(const path of ['qa_operations_v1.mjs','tests/guard.test.mjs','scripts/security/backup.mjs',
  'supabase/migrations/20261114.sql','.github/workflows/p0-pages-deploy.yml','PROJECT_BACKLOG_20261017.md',
  'docs/notes.html','security/readme.js']){
  assert.equal(isPublishedUiAsset(path),false,path);
  assert.equal(checkReleaseVersion({before:html('v0.386'),after:html('v0.386'),changedPaths:[path]}).skipped,true);
 }
});
test('a release must increase numerically; literal text inequality is not enough',()=>{
 assert.throws(()=>checkReleaseVersion({before:html('v0.386'),after:html('v0.099'),changedPaths:['index.html']}),/APP_VERSION_NOT_INCREMENTED/);
 assert.deepEqual(pass(['index.html']).published,['index.html']);
});
test('release badge text and accessibility label must agree with shipped APP_VERSION',()=>{
 const staleBadge=html('v0.386').replace('const APP_VERSION="v0.386";','const APP_VERSION="v0.387";');
 assert.throws(()=>checkReleaseVersion({before:html('v0.386'),after:staleBadge,changedPaths:['index.html']}),/VISIBLE_VERSION_BADGE_MISMATCH/);
 const staleLabel=html('v0.387').replace('aria-label="현재 앱 버전 v0.387"','aria-label="현재 앱 버전 v0.386"');
 assert.throws(()=>checkReleaseVersion({before:html('v0.386'),after:staleLabel,changedPaths:['index.html']}),/VISIBLE_VERSION_BADGE_MISMATCH/);
});
test('duplicate changed paths and traversal cannot silently bypass app release gate',()=>{
 assert.deepEqual(pass(['actual_attendance.js','actual_attendance.js']).published,['actual_attendance.js']);
 assert.equal(isPublishedUiAsset('../index.html'),false);
 assert.equal(isPublishedUiAsset('public/../index.html'),false);
});
