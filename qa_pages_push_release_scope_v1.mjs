// Existing AISEC-05/SEC-S17 operating-write boundary:
 // PR CI may run on QA/security changes, but a push with only these files
 // cannot republish a Pages artifact and then refresh real Google Sheets.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
const push=text.match(/^  push:\n([\s\S]*?)(?=^  workflow_dispatch:)/m)?.[1];
assert.ok(push,'push branch/path scope must be explicit');
assert.match(push,/^    branches: \[main\]$/m);
const paths=[...push.matchAll(/^      - '([^']+)'$/gm)].map(x=>x[1]);
assert.ok(paths.length>=12,'must preserve root runtime and asset patterns');
function match(pattern,path){
 let negative=pattern.startsWith('!');
 if(negative)pattern=pattern.slice(1);
 const regex='^'+pattern.replace(/[.*+?^\$\{\}()|[\]\\]/g,'\\$&')
  .replace(/\\\*\\\*/g,'.*').replace(/\\\*/g,'[^/]*')+'$';
 return new RegExp(regex).test(path);
}
function shouldPublish(path){
 let accepted=false;
 for(const p of paths)if(match(p,path))accepted=!p.startsWith('!');
 return accepted;
}
for(const item of [
 'index.html','actual_attendance.js','operations_v1.css','owner_activation.html',
 'version_test_toggle_982.js','favicon.ico','manifest.json','manifest.webmanifest',
 'assets/app.png','public/fonts/ui.woff2'
])assert.equal(shouldPublish(item),true,'missing public asset '+item);
for(const item of [
 'qa_store_opening_matrix_v1.mjs','qa_fake_regression.js','tests/abc.test.js',
 'scripts/security/autopilot/propose.mjs','security/sec01_session_revocation_guard_v1.sql',
 'SECURITY_STABILITY_LEDGER_20261103.md','PROJECT_BACKLOG_20261017.md',
 'docs/ops.html','supabase/migrations/20261114.sql',
 '.github/workflows/release-version-guard.yml','.github/workflows/p0-pages-deploy.yml',
 'qa-results/incident.json'
])assert.equal(shouldPublish(item),false,'accidental deployment and operating Sheet refresh: '+item);
assert.match(text,/^  pull_request:\n    paths:/m,'original broad PR release QA must remain');
assert.match(text,/^  workflow_dispatch:/m,'manual verified Pages release remains possible');
assert.match(text,/Confirm immediate Sheet refresh after Pages deployment/,'actual Pages release keeps existing sheet consistency check');
console.log('PASS AISEC-05: published UI causes Pages+Sheet release, security/QA/docs/CI-only main cannot, manual release preserved');
