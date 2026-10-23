import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
const notify=readFileSync('.github/workflows/verified-pages-deployment-notification.yml','utf8');
const qa=readFileSync('.github/workflows/qa1243-live-e2e.yml','utf8');
const apps=readFileSync('.github/workflows/apps-script-deploy.yml','utf8');
const marker='[QA1243-NO-OPERATING-WRITE]';
// On the special, reviewed QA-only main push all three operating release jobs
// MUST skip, including the job containing POST(mode:deployment) sheet writer.
assert.match(pages,/Verify marked QA-only changes contain no operating assets/);
assert.match(pages,/QA1243_NO_WRITES_UNEXPECTED_MAIN_CHANGE/);
assert.match(pages,/supabase\/functions\/qa1243-mobile-auth\/index\.ts/);
assert.match(pages,/scripts\/qa1243_mobile_http_smoke\.mjs/);
assert.match(qa,/Supabase shared-domain HTML rewrite diagnostic GET POST query/);
assert.match(qa,/node scripts\/qa1243_safari_static_build\.test\.mjs/);
assert.match(qa,/node scripts\/qa1243_mobile_http_smoke\.mjs/);
const safari=readFileSync('supabase/functions/qa1243-mobile-auth/index.ts','utf8');
assert.match(safari,/QA1243_READ_ONLY_PAGE/);
assert.doesNotMatch(safari,/api\.github\.com|github_pat_|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(safari,/localStorage|sessionStorage/);
// QA-only static Pages publish must be separate from the original job that
// writes live Google payroll after a normal operating release.
const qaStart=pages.indexOf('\n  qa1243-safari-pages:');
const qaEnd=pages.indexOf('\n  build-pages:',qaStart);
assert.ok(qaStart>=0&&qaEnd>qaStart,'Isolated QA Pages job missing');
const qaOnly=pages.slice(qaStart,qaEnd);
assert.match(qaOnly,/\[QA1243-NO-OPERATING-WRITE\]/);
assert.match(qaOnly,/\[QA1243-SAFARI-PAGES\]/);
assert.match(qaOnly,/\[QA1243-APP-PAGES\]/);
assert.match(qaOnly,/scripts\/qa1243_owner_ready_pages_smoke\.mjs --before/);
assert.match(qaOnly,/scripts\/qa1243_owner_ready_pages_smoke\.mjs --after/);
assert.match(pages,/QA1243_UNMARKED_APP_CHANGE_MUST_NOT_SKIP_OPERATING_RELEASE/);
assert.match(pages,/QA1243_APP_HTML_UNEXPECTED_DIFF/);
assert.match(pages,/CONFIRMED_PRIMARY_OWNER_REQUIRED|hq_store_onboarding_ui\.js/);
assert.match(qaOnly,/needs: p0-gate/);
assert.match(qaOnly,/node scripts\/qa1243_safari_pages_smoke\.mjs --before/);
assert.match(qaOnly,/node scripts\/qa1243_safari_pages_smoke\.mjs --after/);
assert.match(qaOnly,/actions\/upload-pages-artifact@v3/);
assert.match(qaOnly,/actions\/deploy-pages@v4/);
assert.doesNotMatch(qaOnly,/server-sync-sheet|mode:\s*'deployment'|SHEET_SHARED_SECRET|body: JSON\.stringify/);
assert.match(pages,/scripts\/qa1243_safari_static_build\.mjs/);
assert.match(pages,/scripts\/qa1243_safari_pages_smoke\.mjs/);
assert.match(pages,/const allowed=new Set\(/);
assert.match(pages,/!files\.some\(f=>\[/);
assert.match(pages,/scripts\/qa1243_oauth_bootstrap\.mjs/);
assert.match(pages,/QA1243_OAuth_Start\.cmd/);
assert.match(qa,/node scripts\/qa1243_oauth_bootstrap\.test\.mjs/);
assert.match(qa,/secrets\.QA1243_GOOGLE_OAUTH_CLIENT_SECRET/);
assert.match(qa,/secrets\.QA1243_GOOGLE_OAUTH_REFRESH_TOKEN/);
for(const name of ['build-pages','notify-deployment-result','deploy-pages']){
  const begin=pages.indexOf('\n  '+name+':');
  assert.ok(begin>=0,'Missing Pages job: '+name);
  const rest=pages.slice(begin+4);
  const next=rest.search(/\n  [a-z][a-z-]*:\n/);
  const block=pages.slice(begin,next>=0?begin+4+next:pages.length);
  assert.ok(block.includes('!contains(github.event.head_commit.message, '+JSON.stringify(marker).replace(/"/g,"'")+')'),
    'QA only must skip operating job '+name);
}
assert.match(pages,/body: JSON\.stringify\(\{mode:'deployment'\}\)/);
assert.match(notify,/!contains\(github\.event\.workflow_run\.head_commit\.message, '\[QA1243-NO-OPERATING-WRITE\]'\)/);
assert.match(qa,/QA1243_GOOGLE_OAUTH_CLIENT_ID/);
assert.doesNotMatch(qa,/secrets\.GOOGLE_OAUTH_CLIENT_ID/);
assert.doesNotMatch(apps,/scripts\/qa1243_build_isolated_gas|QA1243_QA_GOOGLE_BOOTSTRAP/);
// Execute the ACTUAL GitHub Actions isolation guard on synthetic push payloads.
assert.match(pages,/qa_hq_sample_roster_activation_guard_v1\.mjs/,
  'Previous production push failed because this exact QA-only file was not allowlisted');
assert.match(pages,/QA1243_SAFE_RETRY_SCOPE_MISMATCH/);
assert.match(pages,/QA1243_SAFE_RETRY_PARENT_UNVERIFIED/);
const scriptStart=pages.indexOf('            const allowed=new Set([');
const scriptLast=pages.indexOf("            core.info('QA1243_NO_OPERATING_WRITE_GUARD_PASS",scriptStart);
const scriptEnd=pages.indexOf('\n',scriptLast);
assert.ok(scriptStart>0&&scriptLast>scriptStart&&scriptEnd>scriptLast);
const actualGuard=pages.slice(scriptStart,scriptEnd).split('\n').map(line=>
  line.startsWith('            ')?line.slice(12):line).join('\n');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const executeActualGuard=new AsyncFunction('context','github','core',actualGuard);
const originalRelease='66cb74612baf47950ba2cc391a9cf019c32b95f6';
const approvedMarker='[QA1243-NO-OPERATING-WRITE] [QA1243-APP-PAGES]';
const retryMarker=approvedMarker+' [QA1243-APP-PAGES-RETRY]';
async function proveRetry({parent=originalRelease,message=retryMarker,
  parentMessage=approvedMarker,changed=[
    '.github/workflows/p0-pages-deploy.yml',
    'qa1243_pages_no_operating_write_guard.mjs'
  ]}={}){
  let getCommitCalled=false;
  const context={repo:{owner:'koith',repo:'attendance-proto'},sha:'f'.repeat(40),
    payload:{before:parent,head_commit:{message}}};
  const github={rest:{repos:{
    compareCommits:async()=>({data:{files:changed.map(filename=>({filename}))}}),
    getCommit:async()=>{getCommitCalled=true;return {data:{commit:{message:parentMessage}}};}
  }}};
  await executeActualGuard(context,github,{info:()=>{}});
  assert.equal(getCommitCalled,true,'Parent approved marker must be independently fetched');
}
await proveRetry();
// A change to any root synthetic journey fixture MUST trigger full browser,
// PostgreSQL and salary/Sheet contract CI. It must remain exempt from the
// normal Pages publisher that writes to the production payroll spreadsheet.
const journeyWorkflow=readFileSync('.github/workflows/store-opening-full-journey.yml','utf8');
for(const [name,section] of [
 ['pull_request',journeyWorkflow.split('  pull_request:')[1]?.split('  push:')[0]],
 ['push',journeyWorkflow.split('  push:')[1]?.split('  workflow_dispatch:')[0]]
]){
 assert.ok(section,'missing full journey CI trigger: '+name);
 assert.match(section,/      - 'qa_\*\.mjs'/,'root QA mjs must trigger '+name);
 assert.match(section,/      - 'qa_\*\.sql'/,'disposable SQL QA must trigger '+name);
}
const qaOnlyRepair='[QA1243-NO-OPERATING-WRITE] fix root journey CI trigger';
async function proveJourneyRepair(changed,shouldAccept){
 const context={repo:{owner:'koith',repo:'attendance-proto'},sha:'f'.repeat(40),
  payload:{before:'a'.repeat(40),head_commit:{message:qaOnlyRepair}}};
 const github={rest:{repos:{compareCommits:async()=>({data:{files:changed.map(filename=>({filename}))}})}}};
 const action=executeActualGuard(context,github,{info:()=>{}});
 if(shouldAccept)await action;
 else await assert.rejects(action,/QA1243_NO_WRITES_UNEXPECTED_MAIN_CHANGE|QA1243_UNMARKED_APP_CHANGE/);
}
await proveJourneyRepair([
 '.github/workflows/store-opening-full-journey.yml',
 '.github/workflows/p0-pages-deploy.yml',
 'qa1243_pages_no_operating_write_guard.mjs',
 'PROJECT_BACKLOG_20261017.md'
],true);
await proveJourneyRepair([
 '.github/workflows/qa1243-auth-role-journey.yml',
 'qa_auth_role_journey_1243.sql','qa_auth_role_journey_1243.mjs',
 '.github/workflows/p0-pages-deploy.yml','PROJECT_BACKLOG_20261017.md'
],true);
await proveJourneyRepair(['qa_auth_role_journey_1243.mjs','owner_activation.js'],false);
await proveJourneyRepair([
 '.github/workflows/store-opening-full-journey.yml',
 'qa_inventory_valuation_1243.sql','qa_import_identity_1243.sql',
 'supabase/migrations/20261023023009_qa1243_inventory_valuation_fail_closed.sql',
 'supabase/migrations/20261023023246_qa1243_import_source_conflict_guard.sql'
],true);
await proveJourneyRepair(['.github/workflows/p0-pages-deploy.yml'],false);
await proveJourneyRepair(['.github/workflows/store-opening-full-journey.yml','index.html'],false);
await proveJourneyRepair(['.github/workflows/store-opening-full-journey.yml',
 'supabase/functions/server-sync-sheet/index.ts'],false);
console.log('PASS QA1243 root QA/SQL triggers and strictly scoped CI-only main push cannot write operating Sheets');
await assert.rejects(proveRetry({parent:'a'.repeat(40)}),/QA1243_SAFE_RETRY_SCOPE_MISMATCH/);
await assert.rejects(proveRetry({parentMessage:'unmarked external deployment'}),
  /QA1243_SAFE_RETRY_PARENT_UNVERIFIED/);
await assert.rejects(proveRetry({changed:[
  '.github/workflows/p0-pages-deploy.yml','index.html'
]}),/QA1243_SAFE_RETRY_SCOPE_MISMATCH/);
await assert.rejects(proveRetry({changed:[
  '.github/workflows/p0-pages-deploy.yml','supabase/functions/server-sync-sheet/index.ts'
]}),/QA1243_SAFE_RETRY_SCOPE_MISMATCH/);
console.log('PASS QA1243 scoped v0.354 Pages retry on approved parent, reject unrelated app/Edge diff');

console.log('PASS QA1243 QA-only main push cannot invoke Pages publisher, operating Sheet refresh, or false production deploy notification');
