// AISEC-05 synthetic QA (sole-owner policy): stubbed GET responses only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {collect, evaluate, githubGetter, driftVerdict} from './github_settings_probe.mjs';

const stub = (map) => async (p) => { for (const [k, v] of Object.entries(map)) if (p.startsWith(k)) return v; return {status: 404, body: null}; };
const ok = (body) => ({status: 200, body});
const deny = {status: 403, body: null};
const mainOnlyEnv = (name, reviewers = []) => ({name, deployment_branch_policy: {protected_branches: false, custom_branch_policies: true},
  protection_rules: reviewers.length ? [{type: 'required_reviewers', prevent_self_review: false, reviewers: reviewers.map(() => ({type: 'User', reviewer: {login: 'hidden'}}))}] : []});
const branchPolicies = (names) => ok({branch_policies: names.map((n) => ({name: n}))});
const fullyApplied = {
  '/rules/branches/main': ok([{type: 'pull_request', parameters: {required_approving_review_count: 0}},
    {type: 'required_status_checks', parameters: {required_status_checks: [{context: 'required-gate', integration_id: 15368}, {context: 'gate-integrity', integration_id: 15368}]}},
    {type: 'non_fast_forward'}, {type: 'deletion'}]),
  '/branches/main/protection': deny,
  '/branches/main': ok({protected: true}),
  '/rulesets/7': ok({name: 'main-sole-owner-protection', enforcement: 'active', target: 'branch', bypass_actors: [], current_user_can_bypass: 'never'}),
  '/rulesets': ok([{id: 7}]),
  '/environments/production/deployment-branch-policies': branchPolicies(['main']),
  '/environments/production-backup/deployment-branch-policies': branchPolicies(['main']),
  '/environments/production-write/deployment-branch-policies': branchPolicies(['main']),
  '/environments': ok({environments: [mainOnlyEnv('production'), mainOnlyEnv('production-backup'), mainOnlyEnv('production-write', ['owner'])]}),
  '/actions/permissions/workflow': ok({default_workflow_permissions: 'read', can_approve_pull_request_reviews: false}),
};

test('fully applied sole-owner policy is PASS with 0 approvals and never leaks reviewer identities', async () => {
  const r = evaluate(await collect(stub(fullyApplied)));
  assert.equal(r.overall, 'PASS', JSON.stringify(r.checks));
  assert.equal(r.facts.required_approving_review_count, 0);
  assert.ok(!JSON.stringify(r).includes('hidden'));
});

test('reviewers on automation environments are FAIL (they would stall backup/deploy)', async () => {
  const m = {...fullyApplied, '/environments': ok({environments: [mainOnlyEnv('production', ['o']), mainOnlyEnv('production-backup', ['o'])]})};
  const r = evaluate(await collect(stub(m)));
  assert.equal(r.checks.environment_production_matches_policy, 'FAIL');
  assert.equal(r.checks['environment_production-backup_matches_policy'], 'FAIL');
  assert.equal(r.checks['environment_production-write_matches_policy'], 'NOT_APPLIED');
});

test('missing gate, bypass actors, or non-main branch policy fail', async () => {
  const noGate = {...fullyApplied, '/rules/branches/main': ok([{type: 'pull_request', parameters: {required_approving_review_count: 0}}, {type: 'non_fast_forward'}, {type: 'deletion'}])};
  assert.equal(evaluate(await collect(stub(noGate))).checks.main_requires_required_checks, 'FAIL');
  const bypass = {...fullyApplied, '/rulesets/7': ok({name: 'x', enforcement: 'active', target: 'branch', bypass_actors: [{actor_id: 5}]})};
  assert.equal(evaluate(await collect(stub(bypass))).checks.main_ruleset_has_no_bypass_actors, 'FAIL');
  const hidden = {...fullyApplied, '/rulesets/7': ok({name: 'x', enforcement: 'active', target: 'branch'})};
  assert.equal(evaluate(await collect(stub(hidden))).checks.main_ruleset_has_no_bypass_actors, 'CANNOT_VERIFY');
  const anyBranch = {...fullyApplied, '/environments/production/deployment-branch-policies': branchPolicies(['main', 'feature/*'])};
  assert.equal(evaluate(await collect(stub(anyBranch))).checks.environment_production_matches_policy, 'FAIL');
});

test('current real state (unprotected main, open environments) is FAIL', async () => {
  const r = evaluate(await collect(stub({
    '/rules/branches/main': ok([]), '/branches/main/protection': deny, '/branches/main': ok({protected: false}), '/rulesets': ok([]),
    '/environments': ok({environments: [{name: 'production', protection_rules: [], deployment_branch_policy: null}, {name: 'production-backup', protection_rules: [], deployment_branch_policy: null}]}),
    '/actions/permissions/workflow': deny,
  })));
  assert.equal(r.overall, 'FAIL');
  for (const k of ['main_requires_pull_request', 'main_requires_required_checks', 'main_blocks_force_push', 'main_blocks_deletion', 'main_ruleset_has_no_bypass_actors', 'environment_production_matches_policy'])
    assert.equal(r.checks[k], 'FAIL', k);
  assert.equal(r.checks.default_workflow_token_read_only, 'CANNOT_VERIFY');
});

test('opaque 403 responses are CANNOT_VERIFY, never PASS', async () => {
  const r = evaluate(await collect(stub({'/rules': deny, '/branches': deny, '/rulesets': deny, '/environments': deny, '/actions': deny})));
  assert.equal(r.overall, 'CANNOT_VERIFY');
  assert.ok(Object.values(r.checks).every((v) => v === 'CANNOT_VERIFY'));
});

test('getter issues GET only, rejects bad repo, and surfaces 5xx', async () => {
  const seen = [];
  const g = githubGetter({token: 't', repo: 'o/r', fetchImpl: async (u, o) => { seen.push([u, o.method]); return {status: 200, json: async () => ({})}; }});
  await g('/branches/main');
  assert.deepEqual(seen, [['https://api.github.com/repos/o/r/branches/main', 'GET']]);
  assert.throws(() => githubGetter({token: 't', repo: '../x'}), /INVALID_REPO/);
  const bad = githubGetter({token: 't', repo: 'o/r', fetchImpl: async () => ({status: 502, json: async () => ({})})});
  await assert.rejects(bad('/x'), /UPSTREAM_502/);
});

test('requiring only required-gate (without gate-integrity) fails: the gate could be neutered by its own PR', async () => {
  const onlyGate = {...fullyApplied, '/rules/branches/main': ok([{type: 'pull_request', parameters: {required_approving_review_count: 0}},
    {type: 'required_status_checks', parameters: {required_status_checks: [{context: 'required-gate', integration_id: 15368}]}},
    {type: 'non_fast_forward'}, {type: 'deletion'}])};
  assert.equal(evaluate(await collect(stub(onlyGate))).checks.main_requires_required_checks, 'FAIL');
});

test('drift alarm fires only for phases recorded as applied', async () => {
  const applied = evaluate(await collect(stub(fullyApplied)));
  assert.equal(driftVerdict(applied, ['A', 'B', 'C', 'D', 'E']).verdict, 'OK');
  const disabled = evaluate(await collect(stub({...fullyApplied, '/rules/branches/main': ok([]), '/branches/main': ok({protected: false}), '/rulesets': ok([])})));
  assert.equal(driftVerdict(disabled, []).verdict, 'OK', 'nothing applied yet: no alarm noise');
  const d = driftVerdict(disabled, ['A', 'B']);
  assert.equal(d.verdict, 'DRIFT'); assert.ok(d.drift.includes('main_requires_pull_request') && d.drift.includes('main_blocks_force_push'));
  assert.deepEqual(driftVerdict(applied, ['Z']).drift, ['UNKNOWN_PHASE_Z']);
});
