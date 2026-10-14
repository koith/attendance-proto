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
assert.match(agent,/git rev-parse --git-path info\/exclude/,'Agent must set up local-only exclusion for installed QA dependencies');
assert.match(agent,/node_modules/,'NPM QA dependencies must never be treated as agent source changes');
assert.match(agent,/git add -A/,'Agent PR staging still checks all nonignored source changes');

assert.match(agentWorkflow,/if: failure\(\)/,'Escalate agent failure without operating deployment');
assert.match(agentWorkflow,/copilot-requests: write/,'Token-only Copilot model access must be permitted');
assert.match(agentWorkflow,/GITHUB_TOKEN: \$\{\{ github\.token \}\}/,
  'Issue agent uses ephemeral Actions token if no external OpenAI secret');
assert.match(agentWorkflow,/npm install -g --no-audit --no-fund @github\/copilot/,
  'Install official GitHub Copilot CLI when OpenAI key absent');
assert.doesNotMatch(agentWorkflow,/test -n "\$OPENAI_API_KEY"/,
  'Missing OpenAI key must never fail approval validation');
assert.match(agent,/--available-tools='view,grep,glob,edit'/,
  'AI must not be able to invoke arbitrary shell/network tools');
assert.match(agent,/--allow-tool=read --allow-tool=write/,'AI editing is limited to file tools');
assert.match(agent,/env -u GH_TOKEN -u OPENAI_API_KEY/,
  'Copilot process must not inherit GitHub API write token from GH_TOKEN');
assert.match(agent,/GITHUB_TOKEN="\$GITHUB_TOKEN" copilot/,
  'Copilot must use the built-in Actions inference token');
assert.match(agent,/provider_status=\$\?/,'AI provider failures should flow into bounded repair loop');

console.log('PASS release safety workflow contract');
