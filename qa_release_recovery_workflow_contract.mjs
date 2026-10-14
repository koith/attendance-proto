import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const deploy=read('.github/workflows/p0-pages-deploy.yml');
const verifier=read('.github/workflows/verified-pages-deployment-notification.yml');
const rollback=read('.github/workflows/safe-pages-rollback.yml');
const agent=read('scripts/autonomous_dev_agent.sh');
const agentWorkflow=read('.github/workflows/autonomous-development-agent.yml');
assert.match(deploy,/needs: \[p0-gate, build-pages\]/,'Pages must depend on QA and build');
assert.match(deploy,/node qa_release_recovery_policy\.mjs/,'Safety decision tests must be P0 gate');
assert.match(deploy,/id: final_health\s+if: steps\.request_live\.outcome == 'success'/,'Same-run live health must require matching published bytes');
assert.match(verifier,/reRunWorkflowFailedJobs/,'Only failed jobs receive bounded automatic rerun');
assert.match(verifier,/recovery\.outputs\.action != 'retry'/,'No intermediate retry alert');
assert.match(verifier,/rollback\.outputs\.dispatched != 'true'/,'Defer report during rollback');
assert.match(verifier,/isStaticOnlyRelease/,'No rollback of backend/data-changing releases');
assert.match(rollback,/group: pages/,'Rollback and primary Pages publishing must serialize');
assert.match(rollback,/steps\.approve\.outcome == 'success'/,'No rollback without verified approval');
assert.match(rollback,/qa_production_deployment_health_v1\.mjs/,'Check restored real Pages');
assert.match(rollback,/qa_release_changed_assets_live\.mjs/,'Verify restored file bytes');
assert.match(rollback,/qa_browser_app_smoke\.mjs/,'Restored mobile and desktop routes require live browser QA');
assert.match(verifier,/retry API rejected recovery/,'Re-run API failure must not suppress final report');
// A same-run check must never publish a premature success receipt.
assert.doesNotMatch(deploy,/Same-run deployment alert delivered|Send one deduplicated report even if workflow_run event is suppressed/);
assert.doesNotMatch(deploy,/github\.rest\.issues\.create/,'No early success notification from Pages release job');
assert.match(verifier,/let isSuccess = process\.env\.DEPLOY_CONCLUSION === 'success'/);
assert.match(verifier,/if\(superseded\)isSuccess=false/,'Stale deployment cannot be called successful');
assert.match(verifier,/const receipt=isSuccess\?'\[independent-verified-run:/,
  'Only independently verified success earns a healthy receipt');
assert.match(verifier,/github\.rest\.issues\.update/,'Existing same-run receipt must be corrected');
assert.match(verifier,/independent\.data\.conclusion!=='success'/,
  'Recovery dispatcher rejects unverified rollback target');
assert.match(rollback,/independent\.data\.conclusion!=='success'/,
  'Rollback must recheck independent successful verification');
assert.match(rollback,/independent-verified-run/,'No rollback to early same-run success');
assert.match(verifier,/id: independent_rollback/,'Independent live acceptance must initiate guarded rollback');
assert.match(verifier,/steps\.independent_rollback\.outputs\.dispatched != 'true'/,
  'Do not send final report while a guarded independent rollback runs');
assert.match(verifier,/failed_verification_run_id:String\(context\.runId\)/,
  'Rollback dispatch must pass independent run identity');
assert.match(rollback,/failed_verification_run_id:/,
  'Rollback must support independent verifier failure');
assert.match(rollback,/decideIndependentRecovery/,'Independent rollback is fail-closed');
assert.match(rollback,/verifier\.data\.head_sha!==failed/,'Verifier commit must match published release');
assert.match(rollback,/verifier\.data\.conclusion/,'Verifier must be terminally unsuccessful');
assert.match(verifier,/isStaticOnlyRelease/,'Block independent rollback of data/backend releases');

assert.doesNotMatch(rollback,/mode:\s*'deployment'/,'Rollback must not write Sheets');
assert.match(agent,/for attempt in 1 2 3 4 5/,'Five bounded AI attempts');
assert.match(agent,/changed_tests=/,'Per-request changed feature QA is required');
assert.match(agent,/Agent attempted restricted changes/,'Code editing restricted to app/test files');
assert.match(agentWorkflow,/if: failure\(\)/,'Escalate agent failure without operating deployment');
assert.match(agentWorkflow,/id: preflight/);
assert.match(agentWorkflow,/id: dependencies/);
assert.match(agentWorkflow,/id: implementation/);
assert.match(agentWorkflow,/PREFLIGHT: \${{ steps.preflight.outcome }}/);
assert.match(agentWorkflow,/DEPENDENCIES: \${{ steps.dependencies.outcome }}/);
assert.match(agentWorkflow,/IMPLEMENTATION: \${{ steps.implementation.outcome }}/);
assert.match(agentWorkflow,/classifyAgentFailure/,'Agent report must identify actual failed phase');
assert.doesNotMatch(agentWorkflow,/AI 자동 개발 또는 최대 5회 자동 수정·QA가 실패했습니다/,
  'Preflight failure must not be misreported as five attempted AI repairs');
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {classifyAgentFailure}=require('./scripts/autonomous_agent_failure_policy.cjs');
const classify=(preflight,dependencies,implementation)=>classifyAgentFailure({preflight,dependencies,implementation}).stage;
assert.equal(classify('failure','skipped','skipped'),'preflight');
assert.equal(classify('success','failure','skipped'),'dependencies');
assert.equal(classify('success','success','failure'),'implementation');
assert.equal(classify('success','success','success'),'unexpected');
assert.match(classifyAgentFailure({preflight:'failure'}).message,/시작되지 않았습니다/);

console.log('PASS release safety workflow contract');
