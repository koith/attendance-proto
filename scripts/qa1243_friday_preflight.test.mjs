import assert from 'node:assert/strict';
import {REQUIRED,EXTERNAL_BLOCKERS,classifyWorkflow,verdict,reconcileIntegratedSqlEvidence,reconcileSafePagesEvidence,verifyGoogleOnLiveMain} from './qa1243_friday_preflight.mjs';
const SHA='864383ceeefa5ec9596886804efeb77505180685';
const now=Date.parse('2026-10-21T00:00:00Z');
const spec={id:'GENERIC_WORKFLOW',sameSha:false};
const older={id:100,head_branch:'main',head_sha:SHA,event:'push',created_at:'2026-10-20T13:00:00Z',status:'completed',conclusion:'success'};
const failed={...older,id:101,created_at:'2026-10-20T14:00:00Z',conclusion:'failure'};
assert.deepEqual(classifyWorkflow(spec,[older,failed],SHA,now).status,'FAIL',
 'Latest failed E2E supersedes historic synthetic/real success');
assert.match(classifyWorkflow(spec,[older,failed],SHA,now).reason,/FAILURE/);
assert.equal(classifyWorkflow(spec,[older],SHA,now).status,'PASS');
const qaOnlyPage={...older,head_commit:{message:'fix QA [QA1243-NO-OPERATING-WRITE]'},display_title:'QA-only'};
assert.equal(classifyWorkflow({id:'PAGES_PUBLISH',sameSha:true},[qaOnlyPage],SHA,now).reason,
 'QA_ONLY_PUSH_NO_PAGES_PUBLICATION','QA-only skipped Pages is not a release success');
assert.equal(classifyWorkflow({id:'INDEPENDENT_PAGES',sameSha:true},[qaOnlyPage],SHA,now).status,
 'FAIL','Skipped independent publication is not independent approval');
assert.equal(classifyWorkflow({id:'PAGES_PUBLISH',sameSha:true},[older],SHA,now).status,'PASS');

assert.equal(classifyWorkflow(spec,[{...older,status:'in_progress',conclusion:null}],SHA,now).status,'FAIL');
assert.equal(classifyWorkflow(spec,[{...older,head_branch:'feature'}],SHA,now).status,'FAIL');
assert.equal(classifyWorkflow(spec,[{...older,event:'pull_request'}],SHA,now).status,'FAIL');
assert.equal(classifyWorkflow({...spec,sameSha:true},[{...older,head_sha:'a'.repeat(40)}],SHA,now).reason,'OTHER_MAIN_SHA');
assert.equal(classifyWorkflow(spec,[{...older,created_at:'2026-09-01T00:00:00Z'}],SHA,now).reason,'RUN_STALE_OR_INVALID_DATE');
assert.equal(classifyWorkflow(spec,[],SHA,now).reason,'NO_MAIN_RUN');
assert.equal(classifyWorkflow(spec,null,SHA,now).reason,'WORKFLOW_RUN_LIST_INVALID');
assert.equal(classifyWorkflow(spec,[{...older,conclusion:'skipped'}],SHA,now).status,'FAIL');
const greens=REQUIRED.map(s=>({id:s.id,status:'PASS'}));
assert.equal(verdict(greens,[]).verdict,'PASS','only full independently verified evidence can pass');
assert.equal(verdict(greens).verdict,'NO_GO','hosted mail/user and production safety may not be inferred from sandbox');
assert.equal(verdict([{...greens[0],status:'FAIL'},...greens.slice(1)],[]).verdict,'NO_GO');
assert.ok(REQUIRED.some(s=>s.id==='LIVE_EDGE_GAS_SHEETS'));
assert.ok(REQUIRED.some(s=>s.id==='TEST_MAIL_GOTRUE'));
assert.ok(REQUIRED.some(s=>s.id==='INDEPENDENT_PAGES'));
assert.ok(EXTERNAL_BLOCKERS.some(s=>s.id==='HOSTED_TEST_MAIL_RECEIPT'));
assert.ok(EXTERNAL_BLOCKERS.some(s=>s.id==='PRODUCTION_PREPOST_DATA_PROOF'));
const integratedSource=`Run isolated SQL fixtures; never connect to Supabase production
set -euo pipefail
fixtures=(qa_hq_store_onboarding_postgres_integration.sql qa_store_delegated_manager_postgres.sql)
if ! psql -f fixture; then exit 1; fi`;
const staleSql=[
 {id:'STORE_E2E',status:'PASS',run_id:8833,head_sha:SHA},
 {id:'HQ_STORE_POSTGRES',status:'FAIL',reason:'RUN_STALE_OR_INVALID_DATE'},
 {id:'MANAGER_POSTGRES',status:'FAIL',reason:'NO_MAIN_RUN'}
];
const mergedSql=reconcileIntegratedSqlEvidence(staleSql,integratedSource);
assert.equal(mergedSql[1].status,'PASS','full-jouney HQ fixture is independently exercised in disposable SQL');
assert.equal(mergedSql[2].status,'PASS','full-jouney delegated fixture is independently exercised in disposable SQL');
assert.equal(mergedSql[1].run_id,8833);
assert.equal(reconcileIntegratedSqlEvidence(staleSql,integratedSource.replace('exit 1','no fail-closed'))[1].status,'FAIL');
assert.equal(reconcileIntegratedSqlEvidence(staleSql,integratedSource.replace('qa_store_delegated_manager_postgres.sql','missing.sql'))[2].status,'FAIL');
assert.equal(reconcileIntegratedSqlEvidence([{...staleSql[0],status:'FAIL'},...staleSql.slice(1)],integratedSource)[1].status,'FAIL');
assert.equal(reconcileIntegratedSqlEvidence([{...staleSql[0]}, {...staleSql[1],reason:'WORKFLOW_FAILURE'}, staleSql[2]],integratedSource)[1].status,'FAIL',
 'A standalone failure cannot be laundered by a different green workflow');

// Previous prelaunch classifier misread a verified app-only Pages release as
// skipped, even when public HTML+JS were byte-identical to the current main.
// Never accept bare green workflow metadata, fake jobs or stale HTML instead.
const pageFailures=[
 {id:'PAGES_PUBLISH',status:'FAIL',reason:'QA_ONLY_PUSH_NO_PAGES_PUBLICATION'},
 {id:'INDEPENDENT_PAGES',status:'FAIL',reason:'NO_MAIN_RUN'},
 {id:'HOSTED_AUTH_READ',status:'FAIL',reason:'RUN_STALE_OR_INVALID_DATE'}
];
const validReceipt={published:{run_id:1001,head_sha:SHA,verified:true},
 independent:{run_id:1002,head_sha:SHA,verified:true},
 liveHashMatch:true,assetSha256:{'index.html':'a'.repeat(64),'hq_store_onboarding_ui.js':'b'.repeat(64),'operations_v1.js':'c'.repeat(64)}};
const accepted=reconcileSafePagesEvidence(pageFailures,validReceipt);
assert.deepEqual(accepted.map(x=>x.status),['PASS','PASS','FAIL'],
 'Only verified Pages gates may be promoted; hosted Auth remains blocked');
assert.deepEqual(accepted.slice(0,2).map(x=>x.run_id),[1001,1002]);
assert.equal(verdict(accepted).verdict,'NO_GO','Pages proof can never replace hosted identity/approval');
for(const invalid of [
 null,{...validReceipt,liveHashMatch:false},
 {...validReceipt,published:{...validReceipt.published,verified:false}},
 {...validReceipt,independent:{...validReceipt.independent,verified:false}},
 {...validReceipt,independent:{...validReceipt.independent,head_sha:'b'.repeat(40)}},
 {...validReceipt,published:{...validReceipt.published,run_id:null}},
 {...validReceipt,assetSha256:{'index.html':'a'.repeat(64),'hq_store_onboarding_ui.js':'b'.repeat(64)}},
 {...validReceipt,assetSha256:{...validReceipt.assetSha256,'operations_v1.js':'wrong'}}
]){
 assert.deepEqual(reconcileSafePagesEvidence(pageFailures,invalid),pageFailures,
  'Fail closed on missing, fabricated, stale or mismatched release proof');
}

// Exercise the actual GitHub-only evidence reader. A successful workflow that
// skipped Google must never manufacture a live result or send another Google call.
const current='c'.repeat(40),proofSha='50690f26e31b5ef9ae9bce830fcdd17bd4dd6551';
const scope={...older,id:5000,head_sha:current,created_at:'2026-10-23T00:00:00Z'};
const real={...older,id:39781031886,head_sha:proofSha,created_at:'2026-10-22T12:45:47Z'};
const jobName='Trusted production Edge to a new independent GAS project and Sheets';
const execName='Execute real new GAS project and production Edge service-to-service QA';
const attestName='Await verified native production Edge deployment of this exact revision';
const validateName='Validate integration runner and OIDC isolation contract';
const realJobs=[{name:jobName,conclusion:'success',steps:[execName,attestName,validateName].map(name=>({name,conclusion:'success'}))}];
const skippedJobs=[{name:jobName,conclusion:'success',steps:[{name:execName,conclusion:'skipped'}]}];
const testNow=Date.parse('2026-10-23T01:00:00Z');
assert.equal(classifyWorkflow({id:'LIVE_EDGE_GAS_SHEETS'},[scope],current,testNow).reason,'LIVE_EXECUTION_PROOF_REQUIRED');
async function googleCase(change={}){
 const state={runs:[scope,real],jobs:{[scope.id]:skippedJobs,[real.id]:realJobs},
  diff:{status:'ahead',merge_base_commit:{sha:proofSha},files:[]},...change};
 const requested=[];
 const fetcher=async url=>{
  assert.ok(url.startsWith('https://api.github.com/repos/koith/attendance-proto/'),'No Google, OAuth, Edge or Sheets request is permitted');
  requested.push(url);let value;
  if(url.includes('/actions/workflows/'))value={workflow_runs:state.runs};
  else if(url.includes('/jobs?')){const id=Number(url.match(/runs\/(\d+)/)[1]);value={total_count:state.jobs[id]?.length||0,jobs:state.jobs[id]||[]};}
  else if(url.includes('/compare/'))value=state.diff;
  else throw Error('UNEXPECTED_READ_URL');
  return {ok:true,status:200,json:async()=>value};
 };
 return {result:await verifyGoogleOnLiveMain('koith/attendance-proto','test-token',current,fetcher,testNow),requested};
}
const reused=await googleCase();
assert.equal(reused.result.status,'PASS');assert.equal(reused.result.run_id,real.id);
assert.equal(reused.result.googleE2ERepeated,false);
assert.equal((await googleCase({runs:[scope]})).result.reason,'NO_SUCCESSFUL_REAL_GOOGLE_EXECUTION_PROOF');
const changedRunner={filename:'scripts/qa1243_live_edge_gas_sheets.mjs',status:'modified',sha:'x'.repeat(40)};
assert.equal((await googleCase({diff:{status:'ahead',merge_base_commit:{sha:proofSha},files:[changedRunner]}})).result.reason,'GOOGLE_EXECUTION_SOURCE_CHANGED');
const loggingOnly={...changedRunner,sha:'c516cde85456f0438e84794e0d4213651e1668e4'};
assert.equal((await googleCase({diff:{status:'ahead',merge_base_commit:{sha:proofSha},files:[loggingOnly]}})).result.reuse_basis,'REVIEWED_FAILURE_LOGGING_ONLY');
for(const diff of [
 {status:'diverged',merge_base_commit:{sha:proofSha},files:[]},
 {status:'ahead',merge_base_commit:{sha:'d'.repeat(40)},files:[]},
 {status:'ahead',merge_base_commit:{sha:proofSha},files:Array(300).fill({filename:'doc.md'})},
 {status:'ahead',merge_base_commit:{sha:proofSha},files:[{filename:'supabase/functions/server-sync-sheet/engine.mjs',status:'modified'}]},
 {status:'ahead',merge_base_commit:{sha:proofSha},files:[{filename:'renamed.js',previous_filename:'apps_script.gs',status:'renamed'}]}
])assert.equal((await googleCase({diff})).result.status,'FAIL');
const noAttest=structuredClone(realJobs);noAttest[0].steps.find(x=>x.name===attestName).conclusion='skipped';
assert.equal((await googleCase({jobs:{[scope.id]:skippedJobs,[real.id]:noAttest}})).result.reason,'REAL_GOOGLE_ATTESTATION_OR_VALIDATION_MISSING');
const badJobs=structuredClone(realJobs);badJobs[0].steps[0].conclusion='failure';badJobs[0].conclusion='failure';
const newerFailure={...scope,id:5001,created_at:'2026-10-22T23:00:00Z',conclusion:'failure'};
assert.equal((await googleCase({runs:[scope,newerFailure,real],jobs:{[scope.id]:skippedJobs,[newerFailure.id]:badJobs,[real.id]:realJobs}})).result.reason,'LATEST_REAL_GOOGLE_EXECUTION_NOT_SUCCESS');
const stale={...real,created_at:'2026-10-01T00:00:00Z'};
assert.equal((await googleCase({runs:[scope,stale]})).result.reason,'RUN_STALE_OR_INVALID_DATE');
const failure=await googleCase({runs:[{...scope,conclusion:'failure'},real]});
assert.equal(failure.result.reason,'WORKFLOW_FAILURE');assert.equal(failure.requested.length,1);
console.log('PASS actual GitHub evidence reader: skipped Google is not live success; historical real proof, ancestry, runner blob, failure and expiry checked without Google requests');

console.log('PASS #1243 Friday prelaunch: failing current Google 403, stale run, historical green, wrong SHA, synthetic-vs-hosted boundaries all NO_GO');
