import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const edge=fs.readFileSync('edge-release/supabase/functions/server-sync-sheet/index.ts','utf8');
const mirrored=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const script=fs.readFileSync('scripts/qa1243_live_edge_gas_sheets.mjs','utf8');
const generator=fs.readFileSync('scripts/qa1243_build_isolated_gas.mjs','utf8');
const wf=fs.readFileSync('.github/workflows/qa1243-live-e2e.yml','utf8');
assert.equal(edge,mirrored,'Native release must match source exactly');
const mode='qa1243_sandbox_e2e';
assert.match(edge,/if\(mode==="deployment"\|\|mode==="qa1243_sandbox_e2e"\)/);
assert.match(edge,/mode==="deployment"\?\["p0-pages-deploy\.yml","apps-script-deploy\.yml"\]:\["qa1243-live-e2e\.yml"\]/);
assert.match(edge,/payload\.repository!=="koith\/attendance-proto"/);
assert.match(edge,/payload\.ref!=="refs\/heads\/main"/);
assert.match(edge,/payload\.event_name!=="push"/);
assert.match(edge,/qaUrl===\(Deno\.env\.get\("SHEET_WEBAPP_URL"\)\|\|""\)/);
assert.match(edge,/qaSecret===\(Deno\.env\.get\("SHEET_SHARED_SECRET"\)\|\|""\)/);
assert.match(edge,/QA1243_SBX_/);
assert.match(edge,/QA_SANDBOX_ISOLATION_REJECTED/);
assert.ok(edge.indexOf('if(mode==="qa1243_sandbox_e2e"){')<edge.indexOf('if(mode==="deployment"){\n      const ym=currentYm()'),
  'No operating sync path may be called to perform QA writes');
const qaBlock=edge.split('    if(mode==="qa1243_sandbox_e2e"){')[1].split('    if(mode==="deployment"){\n      const ym=currentYm();')[0];
assert.doesNotMatch(qaBlock,/client\.from\(|client\.rpc\(|client\.auth\.|SHEET_SHARED_SECRET\);/,'QA payload must not modify DB/Auth');
assert.match(qaBlock,/const result=await googleWrite\(ym,payload,false,null,null,999999999,route\)/);
assert.match(wf,/github\.event_name == 'push'/);
assert.match(wf,/id-token: write/);
assert.match(wf,/edge\/server-sync-sheet-deploy/);
assert.match(wf,/listCommitStatusesForRef/);
assert.doesNotMatch(wf,/secrets\.SUPABASE_SERVICE_ROLE_KEY|secrets\.SHEET_SHARED_SECRET|secrets\.APPS_SCRIPT_DEPLOYMENT_ID/);
assert.match(script,/https:\/\/script\.googleapis\.com\/v1\/projects/);
assert.match(script,/readFileSync\('apps_script\.gs'/);
assert.match(script,/getIDToken|ACTIONS_ID_TOKEN_REQUEST_URL/);
assert.match(script,/https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets/);
assert.match(script,/duplicateNoGrowth:true,correction:true/);
assert.match(script,/realProductionStoreOrAuthUsed:false/);
assert.match(script,/await waitForExecutableQaWebapp\(qaUrl\)/);
assert.match(script,/QA1243_NOT_A_VALID_SECRET_PROBE/);
assert.match(script,/QA1243_GAS_OWNER_CONSENT_REQUIRED/);
assert.match(script,/QA1243_GAS_PROJECT_REUSED/);
assert.match(generator,/SpreadsheetApp\.create\('QA1243 ' \+ storeKey \+ ' ' \+ year \+ ' 근태'\)/);
assert.match(generator,/QA1243_MAPPED_WORKBOOK_FOREIGN/);
assert.match(generator,/QA1243_STORE_KEY_REQUIRED/);
assert.match(script,/verifyQaWorkbookTitle\(aId,storeA\)/);
assert.match(script,/verifyQaWorkbookTitle\(bId,storeB\)/);
assert.match(script,/Only visibly marked test workbooks are acceptable/);
assert.match(script,/QA1243 isolated Edge GAS /);
assert.match(generator,/qa1243AuthorizeServices/);
assert.match(script,/buildQa1243GAS\(readFileSync\('apps_script\.gs','utf8'\),secret\)/);
assert.match(script,/QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403/);
assert.match(generator,/QA1243_PUBLICATION_GET_ONLY/);
assert.match(script,/probeReadonlyPublication\(url\)/);
assert.match(script,/QA1243_GOOGLE_OWNER_MISMATCH_STOP_BEFORE_SCRIPT_API/);
assert.match(script,/QA1243_SCRIPT_OWNER_NOT_QA_ACCOUNT/);
assert.match(script,/QA1243_LEGACY_OPERATING_OWNER_SCRIPT_FORBIDDEN/);
assert.match(script,/QA1243_REMOTE_SOURCE_ATTESTED/);
assert.match(script,/assertRemoteSource\(immutable,gs,manifest\)/);
assert.match(script,/verifyQaScriptOwner/);
assert.match(script,/EXPECTED_QA_OWNER='webuielf@gmail.com'/);
assert.match(script,/QA1243_GOOGLE_OAUTH_REFRESH_TOKEN/);
assert.match(wf,/secrets.QA1243_GOOGLE_OAUTH_REFRESH_TOKEN/);
assert.match(wf,/vars.QA1243_GAS_SCRIPT_ID/);
assert.match(generator,/buildQa1243Manifest/);
assert.match(generator,/QA1243_SCRIPT_SCOPES/);
assert.doesNotMatch(wf,/secrets.GOOGLE_OAUTH_/);
assert.doesNotMatch(script,/process.env.GOOGLE_OAUTH_/);
assert.doesNotMatch(script,/scripts\.run|EXECUTION_API/);
assert.match(script,/method:'GET'/);
assert.match(script,/QA1243_GAS_READONLY_GET_DIAGNOSTIC/);
assert.match(script,/QA1243_GAS_POST_ROUTE_OR_METHOD_403/);
assert.ok(script.indexOf('const publication=await probeReadonlyPublication(url)')<script.indexOf('const oidcUrl='),
 'GET may diagnose 403 only before any Edge or Sheet writes');
assert.match(script,/consecutive403>=\(knownQaProject\?1:3\)/);
assert.match(script,/QA1243_GAS_WRITER_EXECUTABLE/);
assert.ok(script.indexOf('await waitForExecutableQaWebapp(qaUrl);')<script.indexOf('const oidcUrl='),
 'Unauthorized POST must be verified before minting OIDC and writing');
// These previously separate shift-substitution tests now run on every
// trusted QA Edge->GAS->Sheets preflight, not only on unrelated scheduled CI.
// Each uses shipped app/SQL sources and synthetic IDs, never production rows.
const substitutionLanes=[
 'qa_actual_attendance_store_scope_v1.mjs',
 'qa_substitution_scoped_roster_v1.mjs',
 'qa_substitution_candidate_store_guard_v1.mjs',
 'qa_substitution_test_isolation_v1.mjs',
 'qa_substitution_effective_state_v25.mjs',
 'qa_payroll_weekly_substitution_boundary_v1.mjs'
];
for(const fixture of substitutionLanes){
 const run=spawnSync(process.execPath,[fixture],{
  encoding:'utf8',timeout:90000,maxBuffer:1024*1024
 });
 assert.ok(!run.error&&run.status===0,
  'QA1243_PRELAUNCH_SUBSTITUTION_LANE_FAILED: '+fixture);
}
assert.doesNotMatch(script,/const rawMessage=|rawMessage\.replace/);
assert.match(script,/REDACTED_UNTRUSTED_STATUS/);
assert.match(script,/providerStatus/);
assert.doesNotMatch(script,/String\(first\.value\?\.error\|\|'non-json'\)\.slice/);
console.log('PASS QA1243 6/6 additional substitution, real attendance store scope, weekly wage crossover checks; bounded error logging');
console.log('PASS QA1243 sandbox OIDC isolation, prod URL/secret denylist, real writer source, readback/correction/storage isolation CI static guards');
