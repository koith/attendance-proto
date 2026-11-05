import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const deploy=read('.github/workflows/p0-pages-deploy.yml');
const verifier=read('.github/workflows/verified-pages-deployment-notification.yml');
const secondary=read('.github/workflows/publish-pages.yml');
// Only the guaranteed P0 workflow publishes automatically for main pushes.
// The secondary publisher can be explicitly dispatched for recovery after P0 QA.
// Inspect the YAML top-level event block, not a double-escaped regex that
// incorrectly looked for a literal backslash followed by "s". Reject an
// accidental second automatic Pages publisher before merging or deploying.
function automaticPagePublishEvents(workflow){
  const events=workflow.match(/^on:\s*\n((?:[ \t]+[^\n]*\n|[ \t]*\n)*)/m)?.[1]||'';
  return events.split('\n').map(line=>line.match(/^[ \t]{2}(push|pull_request|workflow_run|schedule)\s*:/)?.[1]).filter(Boolean);
}
assert.deepEqual(automaticPagePublishEvents(secondary),[],'No second automatic Pages writer');
const badSecondary=secondary.replace('  workflow_dispatch:', '  push:\n    branches: [main]\n  workflow_dispatch:');
assert.deepEqual(automaticPagePublishEvents(badSecondary),['push'],
  'Mutation proof: detect a duplicate main push publisher');
const badScheduled=secondary.replace('  workflow_dispatch:', '  schedule:\n    - cron: "0 1 * * *"\n  workflow_dispatch:');
assert.deepEqual(automaticPagePublishEvents(badScheduled),['schedule'],
  'Mutation proof: catch scheduled independent publisher');

assert.match(secondary,/workflow_dispatch:/,'Manual recovery remains available');
assert.match(secondary,/MANUAL_PAGES_P0_GATE_MISSING/,'Manual recovery requires a matching successful P0 gate');
assert.match(secondary,/STALE_MANUAL_RELEASE/,'Manual recovery must reject obsolete commit');

const rollback=read('.github/workflows/safe-pages-rollback.yml');
const agent=read('scripts/autonomous_dev_agent.sh');
const agentWorkflow=read('.github/workflows/autonomous-development-agent.yml');
const secretlessQa=read('scripts/security/run_secretless_agent_qa.sh');
// New agent architecture: model/develop stages only produce patch data;
// the separate privileged publisher (after QA) owns git auth and PR creation.
const publishJob=agentWorkflow.match(/^  publish:\s*\n([\s\S]*?)(?=^  report-failure:)/m)?.[1]||'';
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

// The trusted agent now uses an always() failure-report job with explicit
// dependency result checks. Reject missing/mis-scoped conditions, but do not
// require the superseded single-step "if: failure()" syntax.
function hasFailClosedAgentFailureEscalation(yaml){
  const header=yaml.match(/^  report-failure:\s*\n((?:    [^\n]*\n)*)/m)?.[1]||'';
  const condition=header.match(/^    if:\s*(.*)$/m)?.[1]||'';
  const jobs=['capture-intake','develop','qa','publish'];
  return header.includes('needs: [capture-intake, develop, qa, publish]') &&
    /^always\(\)\s*&&\s*\(/.test(condition) &&
    jobs.every(job=>condition.includes(`needs.${job}.result == 'failure'`));
}
assert.ok(hasFailClosedAgentFailureEscalation(agentWorkflow),
  'Escalate every agent stage failure without requiring operating deployment');
assert.equal(hasFailClosedAgentFailureEscalation(
  agentWorkflow.replace("needs.qa.result == 'failure'",'false')),false,
  'Mutation proof: report cannot silently omit QA failure');
assert.equal(hasFailClosedAgentFailureEscalation(
  agentWorkflow.replace('if: always() && (','if: (')),false,
  'Mutation proof: failure reporting must execute even when upstream fails');
assert.match(agentWorkflow,/copilot-requests: write/,'Token-only Copilot model access must be permitted');
assert.match(agentWorkflow,/GITHUB_TOKEN: \$\{\{ github\.token \}\}/,
  'Issue agent uses ephemeral Actions token if no external OpenAI secret');
assert.match(agentWorkflow,/npm install -g --no-audit --no-fund @github\/copilot/,
  'Install official GitHub Copilot CLI when OpenAI key absent');
assert.doesNotMatch(agentWorkflow,/test -n "\$OPENAI_API_KEY"/,
  'Missing OpenAI key must never fail approval validation');
assert.match(agent,/--available-tools='view,grep,glob'/,
  'AI may only inspect checkout files; no shell, write or network tool');
assert.match(agent,/--allow-tool=read/,'Copilot model has no write tool');
assert.doesNotMatch(agent,/--allow-tool=read --allow-tool=write/,'No direct model file edit permissions');
assert.match(agent,/node scripts\/agent_apply_structured_edits\.mjs/,
  'Host must apply schema-constrained read-only model edit proposals');
assert.match(agent,/AGENT_EDITS_BEGIN/,'Structured proposals are explicitly required');
assert.match(agent,/env -u GH_TOKEN -u OPENAI_API_KEY/,
  'Copilot process must not inherit GitHub API write token from GH_TOKEN');
assert.match(agent,/GITHUB_TOKEN="\$GITHUB_TOKEN" copilot/,
  'Copilot must use the built-in Actions inference token');
assert.match(agentWorkflow,/persist-credentials: false/,
  'Do not persist GitHub write credential into untrusted code checkout');
assert.match(agent,/unset GH_TOKEN GITHUB_TOKEN OPENAI_API_KEY/,
  'Agent-proposed JavaScript QA must not inherit cloud credentials');
assert.doesNotMatch(agent,/gh auth setup-git|git push -u origin|gh pr create/,
  'Untrusted provider stage must not push or create PRs');
assert.match(publishJob,/needs: qa/,'Privileged publishing must depend on independent QA');
assert.match(publishJob,/if: needs\.qa\.result == 'success'/,'PR publication requires successful QA');
assert.match(publishJob,/gh auth setup-git[\s\S]*git push -u origin "\$branch"/,
  'Trusted publisher installs push credentials only after QA');
assert.match(publishJob,/node scripts\/security\/validate_agent_publish_patch\.mjs/,
  'Trusted publisher performs independent staged patch validation');

assert.match(agent,/provider_status=\$\?/,'AI provider failures should flow into bounded repair loop');
assert.match(agent,/AGENT_PROPOSAL_STAGED_FOR_SEPARATE_PUBLISH/,
  'Develop runner emits only validated patch metadata for separate publisher');
assert.match(agentWorkflow,/name: agent-qa-passed-patch/,
  'QA-passed patch is handed to separate privileged publisher');
assert.match(agentWorkflow,/github\.rest\.issues\.createComment/,
  'Trusted failure reporter must attach incomplete-run evidence to approved issue');
assert.match(agent,/git diff --cached --quiet && \{ echo "::error::Agent produced no changes"; exit 1; \}/,
  'Developer may not claim patch success without actual staged changes');
assert.match(agent,/test -s "\$patch_dir\/agent-validated\.patch"/,
  'Validated patch must exist before separate QA/publisher');

assert.match(agent,/CODE-IMPLEMENTATION AGENT/,'Agent must produce validated source changes instead of text-only replies');
assert.match(agent,/read-only Copilot outputs AGENT_EDITS JSON/,
  'Prompt must describe the actual read-only provider and host-side edit path');
assert.doesNotMatch(agent,/Use the edit tool now to modify/,
  'Missing Copilot write tool must not be requested on repair attempts');
assert.match(agent,/: > \/tmp\/agent-reports\/edits\.log/,
  'Each repair attempt must clear stale edit-validation evidence');
assert.match(secretlessQa,/node qa_hq_quicknav_escape_contract_v1\.mjs/,
  'HQ quick picker AI patches must pass the exact P0 keyboard contract before PR');
assert.match(secretlessQa,/node qa_hq_store_search_owner_activation_v1\.mjs/,
  'Store onboarding AI patches must pass relevant P0 activation and owner constraints');
assert.match(secretlessQa,/node qa_store_delegated_manager_v1\.mjs/,
  'Manager tab AI patches must preserve delegated manager security contracts');
assert.match(agent,/tail -c 3500 \/tmp\/agent-reports\/provider\.log/,
  'Bounded local provider diagnosis required for zero-edit repair attempts');
assert.match(agent,/cat \/tmp\/agent-reports\/task\.txt/,
  'Every retry must preserve original approved issue instructions');
assert.match(agent,/changed_application=/,'Source edit is required, not just a test');
assert.match(secretlessQa,/test -n "\$changed_tests" && test -n "\$changed_application"/,
  'Separate unprivileged QA must fail on missing application or QA changes');
assert.match(agentWorkflow,/bash scripts\/security\/run_secretless_agent_qa\.sh/,
  'Unprivileged QA must execute the separate secretless regression suite');
assert.match(secretlessQa,/QA_SECRET_PRESENT:/,
  'Secretless QA rejects injected privileged env');
assert.match(read('.github/workflows/p0-pages-deploy.yml'),/node qa_autonomous_structured_edits_v1\.mjs/,
  'P0 gate runs host-side safe structured edit tests');
assert.match(read('scripts/agent_apply_structured_edits.mjs'),/ROOT_APP=/,
  'Host rejects writes outside allowed app/test files');


console.log('PASS release safety workflow contract');

// QA ensures one production Pages publisher per main commit.
