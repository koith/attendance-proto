// AISEC-05 synthetic QA: stubbed GET responses only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {collect, evaluate, githubGetter} from './github_settings_probe.mjs';

const stub = (map) => async (p) => { for (const [k, v] of Object.entries(map)) if (p.startsWith(k)) return v; return {status: 404, body: null}; };
const ok = (body) => ({status: 200, body});
const envs = (list) => ok({environments: list});
const reviewed = (name) => ({name, protection_rules: [{type: 'required_reviewers', prevent_self_review: true, reviewers: [{type: 'User', reviewer: {login: 'hidden'}}]}]});

test('fully protected repository is PASS and never leaks reviewer identities', async () => {
  const r = evaluate(await collect(stub({
    '/rules/branches/main': ok([{type: 'pull_request', parameters: {required_approving_review_count: 1}}, {type: 'required_status_checks'}, {type: 'non_fast_forward'}, {type: 'deletion'}]),
    '/branches/main/protection': {status: 403, body: null},
    '/branches/main': ok({protected: true}),
    '/rulesets/7': ok({name: 'main', enforcement: 'active', target: 'branch', bypass_actors: [], current_user_can_bypass: 'never'}),
    '/rulesets': ok([{id: 7}]),
    '/environments': envs([reviewed('production'), reviewed('production-backup')]),
    '/actions/permissions/workflow': ok({default_workflow_permissions: 'read', can_approve_pull_request_reviews: false}),
  })));
  assert.equal(r.overall, 'PASS');
  assert.ok(!JSON.stringify(r).includes('hidden'));
  assert.equal(r.facts.active_rulesets[0].bypass_actor_count, 0);
});

test('unprotected main and environment without reviewers are FAIL', async () => {
  const r = evaluate(await collect(stub({
    '/rules/branches/main': ok([]), '/branches/main/protection': {status: 404, body: null},
    '/branches/main': ok({protected: false}), '/rulesets': ok([]),
    '/environments': envs([{name: 'production', protection_rules: []}]),
    '/actions/permissions/workflow': ok({default_workflow_permissions: 'write', can_approve_pull_request_reviews: true}),
  })));
  assert.equal(r.overall, 'FAIL');
  assert.equal(r.checks.main_requires_pull_request, 'FAIL');
  assert.equal(r.checks['environment_production_required_reviewers'], 'FAIL');
  assert.equal(r.checks['environment_production-backup_required_reviewers'], 'FAIL');
  assert.equal(r.checks.default_workflow_token_read_only, 'FAIL');
});

test('opaque 403 responses are CANNOT_VERIFY, never PASS', async () => {
  const deny = {status: 403, body: null};
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
