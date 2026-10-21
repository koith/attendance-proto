import assert from 'node:assert/strict';
import {REQUIRED,EXTERNAL_BLOCKERS,classifyWorkflow,verdict,reconcileIntegratedSqlEvidence} from './qa1243_friday_preflight.mjs';
const SHA='864383ceeefa5ec9596886804efeb77505180685';
const now=Date.parse('2026-10-21T00:00:00Z');
const spec={id:'LIVE_EDGE_GAS_SHEETS',sameSha:false};
const older={id:100,head_branch:'main',head_sha:SHA,event:'push',created_at:'2026-10-20T13:00:00Z',status:'completed',conclusion:'success'};
const failed={...older,id:101,created_at:'2026-10-20T14:00:00Z',conclusion:'failure'};
assert.deepEqual(classifyWorkflow(spec,[older,failed],SHA,now).status,'FAIL',
 'Latest failed E2E supersedes historic synthetic/real success');
assert.match(classifyWorkflow(spec,[older,failed],SHA,now).reason,/FAILURE/);
assert.equal(classifyWorkflow(spec,[older],SHA,now).status,'PASS');
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
console.log('PASS #1243 Friday prelaunch: failing current Google 403, stale run, historical green, wrong SHA, synthetic-vs-hosted boundaries all NO_GO');
