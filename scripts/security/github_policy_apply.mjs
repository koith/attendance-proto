#!/usr/bin/env node
// AISEC-05 owner-run tool for the sole-owner GitHub policy. NEVER run by CI or
// agents: it changes repository settings and therefore needs explicit owner
// approval and the owner's own admin token (GITHUB_ADMIN_TOKEN, never committed).
//
//   node scripts/security/github_policy_apply.mjs plan                          (offline, default)
//   node scripts/security/github_policy_apply.mjs snapshot --out snap.json      (GET only)
//   node scripts/security/github_policy_apply.mjs apply --phase A --snapshot snap.json --confirm koith/attendance-proto
//   node scripts/security/github_policy_apply.mjs rollback --snapshot snap.json --confirm koith/attendance-proto
//
// Safety: every write requires --confirm <exact repo> and a fresh snapshot of
// the same repo; each write is re-read and verified; phase C refuses unless the
// required-gate check already SUCCEEDED on main (otherwise every PR deadlocks);
// rollback restores the snapshot exactly (ruleset deleted or restored,
// environment protection, branch policies, and environments it created).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_POLICY = path.resolve(here, '..', '..', 'security', 'github_policy', 'sole_owner_policy.json');
const SNAPSHOT_MAX_AGE_MS = 24 * 3600 * 1000;
const ENV_NAMES = ['production', 'production-backup', 'production-write'];

export function rulesetBody(policy, phase) {
  const ph = policy.phases[phase];
  if (!ph?.rules) throw Error(`POLICY_PHASE_HAS_NO_RULES:${phase}`);
  const rs = policy.ruleset;
  return {name: rs.name, target: rs.target, enforcement: rs.enforcement, conditions: rs.conditions,
    bypass_actors: rs.bypass_actors, rules: ph.rules.map((r) => rs.rules[r])};
}

export function plan(policy) {
  const repo = policy.repository; const out = [];
  for (const [id, ph] of Object.entries(policy.phases)) {
    if (ph.rules) out.push({phase: id, title: ph.title, calls: [`POST|PUT /repos/${repo}/rulesets  (name=${policy.ruleset.name}, rules=${ph.rules.join(',')}, bypass_actors=[])`]});
    else out.push({phase: id, title: ph.title, calls: ph.environments.flatMap((e) => {
      const spec = policy.environments[e];
      return [`PUT /repos/${repo}/environments/${e}  (deployment_branch_policy=custom${spec.required_reviewers ? ', reviewers=[owner], prevent_self_review=false' : ', reviewers preserved from snapshot'})`,
        `POST /repos/${repo}/environments/${e}/deployment-branch-policies  {name:"main",type:"branch"}`];
    })});
  }
  return out;
}

export function client({token, repo, fetchImpl = fetch, api = 'https://api.github.com'}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo || '') || repo.includes('..')) throw Error('INVALID_REPO');
  const call = async (method, p, body) => {
    const res = await fetchImpl(`${api}${p.startsWith('/repos/') || p.startsWith('/users/') ? '' : `/repos/${repo}`}${p}`, {method,
      headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        ...(body ? {'content-type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
    let json = null; try { json = await res.json(); } catch { json = null; }
    return {status: res.status, body: json};
  };
  return {get: (p) => call('GET', p), put: (p, b) => call('PUT', p, b), post: (p, b) => call('POST', p, b), del: (p) => call('DELETE', p)};
}

function must(r, what, ok = [200]) { if (!ok.includes(r.status)) throw Error(`${what}_HTTP_${r.status}`); return r.body; }

export async function snapshot(gh, repo, now = Date.now()) {
  const list = must(await gh.get('/rulesets?per_page=100'), 'RULESETS_LIST');
  const rulesets = [];
  for (const r of list) rulesets.push(must(await gh.get(`/rulesets/${r.id}`), 'RULESET_GET'));
  const envs = must(await gh.get('/environments?per_page=100'), 'ENVIRONMENTS_LIST').environments || [];
  const environments = {};
  for (const e of envs.filter((x) => ENV_NAMES.includes(x.name))) {
    const custom = e.deployment_branch_policy?.custom_branch_policies
      ? must(await gh.get(`/environments/${encodeURIComponent(e.name)}/deployment-branch-policies?per_page=100`), 'BRANCH_POLICIES').branch_policies || []
      : [];
    const rr = (e.protection_rules || []).find((p) => p.type === 'required_reviewers');
    environments[e.name] = {
      wait_timer: (e.protection_rules || []).find((p) => p.type === 'wait_timer')?.wait_timer ?? 0,
      prevent_self_review: rr ? Boolean(rr.prevent_self_review) : false,
      reviewers: rr ? (rr.reviewers || []).map((x) => ({type: x.type, id: x.reviewer?.id})) : [],
      deployment_branch_policy: e.deployment_branch_policy || null,
      custom_branch_policies: custom.map((b) => ({name: b.name, type: b.type || 'branch'})),
    };
  }
  return {schema: 1, repository: repo, taken_at: new Date(now).toISOString(),
    rulesets: rulesets.map((r) => ({id: r.id, name: r.name, target: r.target, enforcement: r.enforcement,
      conditions: r.conditions, bypass_actors: r.bypass_actors, rules: r.rules})), environments};
}

function guard({snap, repo, confirm, now}) {
  if (confirm !== repo) throw Error('CONFIRM_REPO_MISMATCH');
  if (!snap || snap.repository !== repo) throw Error('SNAPSHOT_REPO_MISMATCH');
  if (now - Date.parse(snap.taken_at) > SNAPSHOT_MAX_AGE_MS) throw Error('SNAPSHOT_STALE_TAKE_A_NEW_ONE');
}

async function putEnvironment(gh, name, spec) {
  const body = {wait_timer: spec.wait_timer ?? 0, prevent_self_review: Boolean(spec.prevent_self_review),
    reviewers: spec.reviewers?.length ? spec.reviewers : null, deployment_branch_policy: spec.deployment_branch_policy ?? null};
  must(await gh.put(`/environments/${encodeURIComponent(name)}`, body), 'ENVIRONMENT_PUT');
}
async function setBranchPolicies(gh, name, wanted) {
  const cur = must(await gh.get(`/environments/${encodeURIComponent(name)}/deployment-branch-policies?per_page=100`), 'BRANCH_POLICIES').branch_policies || [];
  for (const b of cur) if (!wanted.some((w) => w.name === b.name)) must(await gh.del(`/environments/${encodeURIComponent(name)}/deployment-branch-policies/${b.id}`), 'BRANCH_POLICY_DELETE', [204]);
  for (const w of wanted) if (!cur.some((b) => b.name === w.name)) must(await gh.post(`/environments/${encodeURIComponent(name)}/deployment-branch-policies`, w), 'BRANCH_POLICY_CREATE', [200, 201]);
}

export async function apply(gh, {policy, phase, snap, confirm, now = Date.now()}) {
  const repo = policy.repository; guard({snap, repo, confirm, now});
  const ph = policy.phases[phase]; if (!ph) throw Error(`UNKNOWN_PHASE:${phase}`);
  const log = [];
  if (ph.rules) {
    if (ph.rules.includes('required_status_checks')) {
      // Every required context must already be reporting green from GitHub
      // Actions, or requiring it would deadlock every PR.
      const green = (runs, c) => (runs?.check_runs || []).some((r) => r.conclusion === 'success' && r.app?.id === c.integration_id);
      const merged = (must(await gh.get('/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=10'), 'PULLS') || []).filter((x) => x.merged_at);
      for (const c of policy.required_checks) {
        let ok = c.trigger === 'pull_request' &&
          green(must(await gh.get(`/commits/main/check-runs?check_name=${encodeURIComponent(c.context)}&per_page=20`), 'CHECK_RUNS'), c);
        for (const pr of merged) {
          if (ok) break;
          ok = c.kind === 'commit_status'
            ? (must(await gh.get(`/commits/${pr.head.sha}/status`), 'COMBINED_STATUS').statuses || [])
              .some((x) => x.context === c.context && x.state === 'success' && x.creator?.login === 'github-actions[bot]')
            : green(must(await gh.get(`/commits/${pr.head.sha}/check-runs?check_name=${encodeURIComponent(c.context)}&per_page=20`), 'CHECK_RUNS'), c);
        }
        if (!ok) throw Error(`REQUIRED_CHECK_NOT_YET_GREEN:${c.context}_MERGE_IT_FIRST`);
      }
    }
    const body = rulesetBody(policy, phase);
    const list = must(await gh.get('/rulesets?per_page=100'), 'RULESETS_LIST');
    const existing = list.find((r) => r.name === body.name);
    const r = existing ? await gh.put(`/rulesets/${existing.id}`, body) : await gh.post('/rulesets', body);
    const saved = must(r, 'RULESET_WRITE', [200, 201]);
    const back = must(await gh.get(`/rulesets/${saved.id}`), 'RULESET_READBACK');
    const types = (back.rules || []).map((x) => x.type).sort();
    if (JSON.stringify(types) !== JSON.stringify([...ph.rules].sort()) || back.enforcement !== 'active' || (back.bypass_actors || []).length)
      throw Error('RULESET_READBACK_MISMATCH');
    log.push(`RULESET ${existing ? 'UPDATED' : 'CREATED'} id=${saved.id} rules=${types.join(',')}`);
  }
  for (const name of ph.environments || []) {
    const spec = policy.environments[name]; const prev = snap.environments[name];
    let reviewers = prev?.reviewers || []; let prevent = prev?.prevent_self_review ?? false;
    if (spec.required_reviewers) {
      const owner = must(await gh.get(`/repos/${repo}`), 'REPO_GET').owner;
      reviewers = [{type: 'User', id: owner.id}]; prevent = false; // sole owner must be able to approve
    }
    await putEnvironment(gh, name, {wait_timer: prev?.wait_timer ?? 0, prevent_self_review: prevent, reviewers,
      deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}});
    await setBranchPolicies(gh, name, spec.deployment_branches.map((b) => ({name: b, type: 'branch'})));
    const back = must(await gh.get(`/environments/${encodeURIComponent(name)}`), 'ENVIRONMENT_READBACK');
    const pol = must(await gh.get(`/environments/${encodeURIComponent(name)}/deployment-branch-policies?per_page=100`), 'BRANCH_POLICIES').branch_policies || [];
    const rr = (back.protection_rules || []).find((p) => p.type === 'required_reviewers');
    if (!back.deployment_branch_policy?.custom_branch_policies || pol.map((b) => b.name).join(',') !== spec.deployment_branches.join(',') ||
        Boolean(rr && (rr.reviewers || []).length) !== Boolean(reviewers.length))
      throw Error(`ENVIRONMENT_READBACK_MISMATCH:${name}`);
    log.push(`ENVIRONMENT ${name} main-only reviewers=${reviewers.length}`);
  }
  return log;
}

export async function rollback(gh, {snap, repo, confirm, policy, now = Date.now()}) {
  if (confirm !== repo) throw Error('CONFIRM_REPO_MISMATCH');
  if (!snap || snap.repository !== repo) throw Error('SNAPSHOT_REPO_MISMATCH');
  const log = [];
  const list = must(await gh.get('/rulesets?per_page=100'), 'RULESETS_LIST');
  for (const r of list.filter((x) => x.name === policy.ruleset.name)) {
    const before = snap.rulesets.find((s) => s.id === r.id || s.name === r.name);
    if (!before) { must(await gh.del(`/rulesets/${r.id}`), 'RULESET_DELETE', [204]); log.push(`RULESET DELETED id=${r.id}`); }
    else {
      const {id, ...body} = before;
      must(await gh.put(`/rulesets/${r.id}`, body), 'RULESET_RESTORE'); log.push(`RULESET RESTORED id=${r.id}`);
    }
  }
  const envs = must(await gh.get('/environments?per_page=100'), 'ENVIRONMENTS_LIST').environments || [];
  for (const name of ENV_NAMES) {
    const exists = envs.some((e) => e.name === name); const before = snap.environments[name];
    if (!exists) continue;
    if (!before) { must(await gh.del(`/environments/${encodeURIComponent(name)}`), 'ENVIRONMENT_DELETE', [204]); log.push(`ENVIRONMENT DELETED ${name}`); continue; }
    if (before.deployment_branch_policy?.custom_branch_policies) {
      await putEnvironment(gh, name, before);
      await setBranchPolicies(gh, name, before.custom_branch_policies);
    } else {
      // Clear custom branch policies first, then restore the original (null / protected) policy.
      const cur = must(await gh.get(`/environments/${encodeURIComponent(name)}`), 'ENVIRONMENT_GET');
      if (cur.deployment_branch_policy?.custom_branch_policies) await setBranchPolicies(gh, name, []);
      await putEnvironment(gh, name, before);
    }
    log.push(`ENVIRONMENT RESTORED ${name}`);
  }
  return log;
}

function arg(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }
async function main(argv) {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
  const cmd = argv[0] || 'plan';
  if (cmd === 'plan') { console.log(JSON.stringify({repository: policy.repository, settings_changed: 0, phases: plan(policy)}, null, 2)); return; }
  const token = process.env.GITHUB_ADMIN_TOKEN; if (!token) throw Error('GITHUB_ADMIN_TOKEN_REQUIRED_OWNER_ONLY');
  if (process.env.CI || process.env.GITHUB_ACTIONS) throw Error('REFUSING_TO_CHANGE_SETTINGS_FROM_CI');
  const gh = client({token, repo: policy.repository});
  if (cmd === 'snapshot') {
    const out = arg(argv, '--out'); if (!out) throw Error('OUT_REQUIRED');
    fs.writeFileSync(out, JSON.stringify(await snapshot(gh, policy.repository), null, 2) + '\n', {flag: 'wx', mode: 0o600});
    console.log(`SNAPSHOT_WRITTEN ${out}`); return;
  }
  const snap = JSON.parse(fs.readFileSync(arg(argv, '--snapshot') || '', 'utf8'));
  const confirm = arg(argv, '--confirm');
  const log = cmd === 'apply' ? await apply(gh, {policy, phase: arg(argv, '--phase'), snap, confirm})
    : cmd === 'rollback' ? await rollback(gh, {snap, repo: policy.repository, confirm, policy}) : (() => { throw Error('UNKNOWN_COMMAND'); })();
  for (const l of log) console.log(l);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(String(e.message).slice(0, 200)); process.exitCode = 1; });
}
