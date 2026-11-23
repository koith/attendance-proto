// AISEC-05: owner apply/rollback tool against an in-memory fake GitHub API. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {client, snapshot, apply, rollback, plan, rulesetBody, DEFAULT_POLICY} from './github_policy_apply.mjs';
import {collect, evaluate} from './github_settings_probe.mjs';

const policy = () => JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
const REPO = 'koith/attendance-proto';

function fakeGitHub(initial) {
  const st = structuredClone(initial); let nextId = 100; const writes = [];
  const envView = (name) => { const e = st.envs[name]; return {name, protection_rules: e.protection_rules, deployment_branch_policy: e.deployment_branch_policy}; };
  const fetchImpl = async (url, {method, body}) => {
    const u = new URL(url); let p = u.pathname.replace(`/repos/${REPO}`, '') || '/'; const b = body ? JSON.parse(body) : null;
    if (method !== 'GET') writes.push(`${method} ${p}`);
    const res = (status, json) => ({status, json: async () => json});
    let m;
    if (p === '/' && method === 'GET') return res(200, {owner: {id: 48688331}});
    if (p === '/rulesets' && method === 'GET') return res(200, Object.values(st.rulesets).map(({id, name}) => ({id, name})));
    if (p === '/rulesets' && method === 'POST') { const id = nextId++; st.rulesets[id] = {id, ...b}; return res(201, st.rulesets[id]); }
    if ((m = p.match(/^\/rulesets\/(\d+)$/))) {
      const id = Number(m[1]); if (!st.rulesets[id]) return res(404, null);
      if (method === 'GET') return res(200, st.rulesets[id]);
      if (method === 'PUT') { st.rulesets[id] = {id, ...b}; return res(200, st.rulesets[id]); }
      if (method === 'DELETE') { delete st.rulesets[id]; return res(204, null); }
    }
    if (p === '/environments' && method === 'GET') return res(200, {environments: Object.keys(st.envs).map(envView)});
    if ((m = p.match(/^\/environments\/([^/]+)\/deployment-branch-policies(?:\/(\d+))?$/))) {
      const e = st.envs[decodeURIComponent(m[1])]; if (!e) return res(404, null);
      if (method === 'GET') return res(200, {branch_policies: e.branch_policies});
      if (!e.deployment_branch_policy?.custom_branch_policies) return res(404, null);
      if (method === 'POST') { e.branch_policies.push({id: nextId++, name: b.name, type: b.type}); return res(200, {}); }
      if (method === 'DELETE') { e.branch_policies = e.branch_policies.filter((x) => x.id !== Number(m[2])); return res(204, null); }
    }
    if ((m = p.match(/^\/environments\/([^/]+)$/))) {
      const name = decodeURIComponent(m[1]);
      if (method === 'GET') return st.envs[name] ? res(200, envView(name)) : res(404, null);
      if (method === 'DELETE') { delete st.envs[name]; return res(204, null); }
      if (method === 'PUT') {
        const rules = [];
        if (b.wait_timer) rules.push({type: 'wait_timer', wait_timer: b.wait_timer});
        if (b.reviewers?.length) rules.push({type: 'required_reviewers', prevent_self_review: b.prevent_self_review, reviewers: b.reviewers.map((r) => ({type: r.type, reviewer: {id: r.id}}))});
        const prev = st.envs[name];
        st.envs[name] = {protection_rules: rules, deployment_branch_policy: b.deployment_branch_policy,
          branch_policies: b.deployment_branch_policy?.custom_branch_policies ? prev?.branch_policies || [] : []};
        return res(200, envView(name));
      }
    }
    if ((m = p.match(/^\/commits\/([^/]+)\/check-runs$/))) {
      const name = u.searchParams.get('check_name');
      return res(200, {check_runs: (st.checkRuns[m[1]] || []).filter((c) => c.name === name)});
    }
    if ((m = p.match(/^\/commits\/([^/]+)\/status$/))) return res(200, {statuses: (st.statuses || {})[m[1]] || []});
    if (p === '/pulls') return res(200, st.pulls || []);
    if (p === '/rules/branches/main') {
      const rules = Object.values(st.rulesets).filter((r) => r.enforcement === 'active').flatMap((r) => r.rules);
      return res(200, rules);
    }
    if (p === '/branches/main') return res(200, {protected: Object.keys(st.rulesets).length > 0});
    if (p === '/branches/main/protection' || p === '/actions/permissions/workflow') return res(403, null);
    return res(404, null);
  };
  return {st, writes, gh: client({token: 'synthetic', repo: REPO, fetchImpl}), fetchImpl};
}
const CURRENT = {rulesets: {}, checkRuns: {}, pulls: [{merged_at: '2026-11-22T00:00:00Z', head: {sha: 'prhead'}}], envs: {
  production: {protection_rules: [], deployment_branch_policy: null, branch_policies: []},
  'production-backup': {protection_rules: [], deployment_branch_policy: null, branch_policies: []}}};

test('plan is offline and covers all phases; ruleset bodies are cumulative with no bypass', () => {
  const p = policy();
  assert.deepEqual(plan(p).map((x) => x.phase), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(rulesetBody(p, 'A').rules.map((r) => r.type), ['deletion', 'non_fast_forward']);
  assert.deepEqual(rulesetBody(p, 'C').rules.map((r) => r.type), ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']);
  assert.equal(rulesetBody(p, 'B').rules[2].parameters.required_approving_review_count, 0);
  assert.deepEqual(rulesetBody(p, 'C').bypass_actors, []);
});

test('writes are refused without exact confirm or with a stale/foreign snapshot (zero writes)', async () => {
  const f = fakeGitHub(CURRENT); const snap = await snapshot(f.gh, REPO);
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'A', snap, confirm: 'koith/other'}), /CONFIRM_REPO_MISMATCH/);
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'A', snap: {...snap, repository: 'x/y'}, confirm: REPO}), /SNAPSHOT_REPO_MISMATCH/);
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'A', snap, confirm: REPO, now: Date.now() + 2 * 86400000}), /SNAPSHOT_STALE/);
  assert.deepEqual(f.writes, []);
});

test('phase C refuses until required-gate is green on main (prevents PR deadlock)', async () => {
  const f = fakeGitHub(CURRENT); const snap = await snapshot(f.gh, REPO);
  await apply(f.gh, {policy: policy(), phase: 'B', snap, confirm: REPO});
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'C', snap, confirm: REPO}), /NOT_YET_GREEN:required-gate/);
  f.st.checkRuns = {main: [{name: 'required-gate', conclusion: 'success', app: {id: 99}}]};
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'C', snap, confirm: REPO}), /NOT_YET_GREEN:required-gate/, 'only the GitHub Actions app counts');
  f.st.checkRuns = {main: [{name: 'required-gate', conclusion: 'success', app: {id: 15368}}]};
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'C', snap, confirm: REPO}), /NOT_YET_GREEN:gate-integrity/, 'integrity must be proven on a merged PR');
  f.st.checkRuns.prhead = [{name: 'gate-integrity', conclusion: 'success', app: {id: 15368}}];
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'C', snap, confirm: REPO}), /NOT_YET_GREEN:gate-integrity/, 'a check RUN does not count: it must be a commit status on the PR head');
  f.st.statuses = {prhead: [{context: 'gate-integrity', state: 'success', creator: {login: 'someone-else'}}]};
  await assert.rejects(apply(f.gh, {policy: policy(), phase: 'C', snap, confirm: REPO}), /NOT_YET_GREEN:gate-integrity/, 'only GitHub Actions may have posted it');
  f.st.statuses = {prhead: [{context: 'gate-integrity', state: 'success', creator: {login: 'github-actions[bot]'}}]};
  assert.match((await apply(f.gh, {policy: policy(), phase: 'C', snap, confirm: REPO}))[0], /RULESET UPDATED .*required_status_checks/);
});

test('A..E then probe PASS on policy checks, then rollback restores the exact starting state', async () => {
  const f = fakeGitHub(CURRENT); const snap = await snapshot(f.gh, REPO);
  f.st.checkRuns = {main: [{name: 'required-gate', conclusion: 'success', app: {id: 15368}}]};
  f.st.statuses = {prhead: [{context: 'gate-integrity', state: 'success', creator: {login: 'github-actions[bot]'}}]};
  for (const phase of ['A', 'B', 'C', 'D', 'E']) await apply(f.gh, {policy: policy(), phase, snap, confirm: REPO});
  assert.equal(Object.keys(f.st.rulesets).length, 1, 'phases update one ruleset, never duplicate');
  assert.deepEqual(f.st.envs.production.branch_policies.map((b) => b.name), ['main']);
  assert.equal(f.st.envs.production.protection_rules.length, 0, 'automation env keeps no reviewers');
  assert.equal(f.st.envs['production-backup'].protection_rules.length, 0, 'daily backup never waits');
  const pw = f.st.envs['production-write'].protection_rules.find((r) => r.type === 'required_reviewers');
  assert.equal(pw.prevent_self_review, false); assert.equal(pw.reviewers[0].reviewer.id, 48688331);
  // The read-only probe, pointed at the same fake, sees the policy as applied.
  const get = async (p) => { const r = await f.fetchImpl(`https://api.github.com/repos/${REPO}${p}`, {method: 'GET'}); return {status: r.status, body: r.status === 200 ? await r.json() : null}; };
  const report = evaluate(await collect(get));
  for (const k of ['main_requires_pull_request', 'main_requires_required_checks', 'main_blocks_force_push', 'main_blocks_deletion',
    'environment_production_matches_policy', 'environment_production-backup_matches_policy', 'environment_production-write_matches_policy'])
    assert.equal(report.checks[k], 'PASS', k);
  const log = await rollback(f.gh, {snap, repo: REPO, confirm: REPO, policy: policy()});
  assert.ok(log.some((l) => l.startsWith('RULESET DELETED')) && log.includes('ENVIRONMENT DELETED production-write'));
  assert.deepEqual({rulesets: f.st.rulesets, envs: f.st.envs}, {rulesets: CURRENT.rulesets, envs: CURRENT.envs});
});

test('rollback restores a pre-existing ruleset and environment reviewers instead of deleting them', async () => {
  const pre = structuredClone(CURRENT);
  pre.rulesets[7] = {id: 7, name: 'main-sole-owner-protection', target: 'branch', enforcement: 'active', conditions: {}, bypass_actors: [], rules: [{type: 'deletion'}]};
  pre.envs.production = {protection_rules: [{type: 'wait_timer', wait_timer: 5}], deployment_branch_policy: null, branch_policies: []};
  const f = fakeGitHub(pre); const snap = await snapshot(f.gh, REPO);
  for (const phase of ['B', 'D']) await apply(f.gh, {policy: policy(), phase, snap, confirm: REPO});
  assert.equal(f.st.envs.production.protection_rules[0].wait_timer, 5, 'apply preserves existing wait timer');
  await rollback(f.gh, {snap, repo: REPO, confirm: REPO, policy: policy()});
  assert.deepEqual(f.st.rulesets[7].rules, [{type: 'deletion'}]);
  assert.deepEqual(f.st.envs, pre.envs);
});
