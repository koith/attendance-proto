#!/usr/bin/env node
// AISEC-05: read-only evidence probe of the REAL GitHub repository settings
// that separate "code proposal -> PR -> merge -> production deploy".
// Uses only GET requests with the job's own read-scoped GITHUB_TOKEN.
// Never writes settings, never reads secret values, never prints reviewer
// identities (only counts/types). A 403/404 is recorded as CANNOT_VERIFY
// for that field; it is never converted into PASS.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REQUIRED_ENVIRONMENTS = ['production', 'production-backup'];

function verdict(ok, unknown) { return unknown ? 'CANNOT_VERIFY' : ok ? 'PASS' : 'FAIL'; }

export async function collect(get, {branch = 'main'} = {}) {
  const raw = {};
  const call = async (key, url) => { raw[key] = await get(url); return raw[key]; };
  const rules = await call('branch_rules', `/rules/branches/${branch}?per_page=100`);
  const br = await call('branch', `/branches/${branch}`);
  const classic = await call('classic_protection', `/branches/${branch}/protection`);
  const rulesets = await call('rulesets', '/rulesets?includes_parents=true&per_page=100');
  const envs = await call('environments', '/environments?per_page=100');
  const wfperm = await call('workflow_permissions', '/actions/permissions/workflow');
  const rulesetDetails = [];
  if (rulesets.status === 200 && Array.isArray(rulesets.body)) {
    for (const rs of rulesets.body.slice(0, 20)) {
      const d = await get(`/rulesets/${rs.id}`);
      rulesetDetails.push({id: rs.id, status: d.status, body: d.body});
    }
  }
  return {branch, raw, rulesetDetails};
}

export function evaluate({branch, raw, rulesetDetails}) {
  const types = new Set();
  const params = {};
  if (raw.branch_rules.status === 200 && Array.isArray(raw.branch_rules.body)) {
    for (const r of raw.branch_rules.body) { types.add(r.type); if (r.parameters) params[r.type] = r.parameters; }
  }
  const classic = raw.classic_protection.status === 200 ? raw.classic_protection.body : null;
  const classicUnknown = raw.classic_protection.status !== 200 && raw.classic_protection.status !== 404;
  const rulesKnown = raw.branch_rules.status === 200;
  const branchProtectedFlag = raw.branch.status === 200 ? Boolean(raw.branch.body?.protected) : null;

  const prRequired = types.has('pull_request') || Boolean(classic?.required_pull_request_reviews);
  const approvals = Math.max(params.pull_request?.required_approving_review_count ?? 0,
    classic?.required_pull_request_reviews?.required_approving_review_count ?? 0);
  const statusChecks = types.has('required_status_checks') || Boolean(classic?.required_status_checks);
  const noForce = types.has('non_fast_forward') || classic?.allow_force_pushes?.enabled === false;
  const noDelete = types.has('deletion') || classic?.allow_deletions?.enabled === false;
  const enforceAdmins = classic ? Boolean(classic.enforce_admins?.enabled) : null;
  // Only a definite answer from both sources can yield FAIL; one opaque source
  // with nothing found in the other is CANNOT_VERIFY.
  // GET /branches/{b} `protected:false` is authoritative: no classic
  // protection and no ruleset applies, even when the classic endpoint is 403.
  const unknownBranch = !rulesKnown || (classicUnknown && branchProtectedFlag !== false && !prRequired);

  const activeRulesets = rulesetDetails.filter((d) => d.status === 200 && d.body?.enforcement === 'active')
    .map((d) => ({id: d.id, name: d.body.name, target: d.body.target,
      bypass_actor_count: Array.isArray(d.body.bypass_actors) ? d.body.bypass_actors.length : null,
      current_user_can_bypass: d.body.current_user_can_bypass ?? null}));

  const envList = raw.environments.status === 200 ? raw.environments.body?.environments || [] : null;
  const environments = REQUIRED_ENVIRONMENTS.map((name) => {
    if (!envList) return {name, verdict: 'CANNOT_VERIFY', http: raw.environments.status};
    const e = envList.find((x) => x.name === name);
    if (!e) return {name, exists: false, verdict: 'FAIL'};
    const rr = (e.protection_rules || []).find((p) => p.type === 'required_reviewers');
    const reviewerCount = rr ? (rr.reviewers || []).length : 0;
    return {name, exists: true,
      required_reviewers: reviewerCount, reviewer_types: rr ? [...new Set((rr.reviewers || []).map((x) => x.type))] : [],
      prevent_self_review: rr ? Boolean(rr.prevent_self_review) : false,
      wait_timer: (e.protection_rules || []).find((p) => p.type === 'wait_timer')?.wait_timer ?? 0,
      branch_policy: e.deployment_branch_policy || null,
      can_admins_bypass: e.can_admins_bypass ?? null,
      verdict: verdict(reviewerCount > 0, false)};
  });

  const wf = raw.workflow_permissions.status === 200 ? raw.workflow_permissions.body : null;
  const checks = {
    main_requires_pull_request: verdict(prRequired, unknownBranch && !prRequired),
    main_required_approvals_ge_1: verdict(approvals >= 1, unknownBranch && approvals < 1),
    main_required_status_checks: verdict(statusChecks, unknownBranch && !statusChecks),
    main_blocks_force_push: verdict(noForce, unknownBranch && !noForce),
    main_blocks_deletion: verdict(noDelete, unknownBranch && !noDelete),
    default_workflow_token_read_only: wf ? verdict(wf.default_workflow_permissions === 'read', false) : 'CANNOT_VERIFY',
    actions_cannot_approve_prs: wf ? verdict(wf.can_approve_pull_request_reviews === false, false) : 'CANNOT_VERIFY',
  };
  for (const e of environments) checks[`environment_${e.name}_required_reviewers`] = e.verdict;
  const values = Object.values(checks);
  const overall = values.includes('FAIL') ? 'FAIL' : values.includes('CANNOT_VERIFY') ? 'CANNOT_VERIFY' : 'PASS';
  return {
    schema: 1, task: 'AISEC-05', branch, overall, checks,
    http: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.status])),
    facts: {branch_protected_flag: branchProtectedFlag, rule_types: [...types].sort(),
      required_approving_review_count: approvals, enforce_admins: enforceAdmins,
      active_rulesets: activeRulesets, environments,
      default_workflow_permissions: wf?.default_workflow_permissions ?? null,
      can_approve_pull_request_reviews: wf?.can_approve_pull_request_reviews ?? null},
    values_read: false, writes: 0,
  };
}

export function githubGetter({token, repo, fetchImpl = fetch, api = 'https://api.github.com'}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo || '') || repo.includes('..')) throw Error('PROBE_INVALID_REPO');
  return async (p) => {
    const res = await fetchImpl(`${api}/repos/${repo}${p}`, {method: 'GET', headers: {
      authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28'}});
    let body = null; try { body = await res.json(); } catch { body = null; }
    if (res.status >= 500) throw Error(`PROBE_UPSTREAM_${res.status}`);
    return {status: res.status, body: res.status === 200 ? body : null};
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN; const repo = process.env.GITHUB_REPOSITORY;
  if (!token) throw Error('PROBE_TOKEN_MISSING');
  const report = evaluate(await collect(githubGetter({token, repo})));
  report.run = {sha: process.env.GITHUB_SHA || null, head_sha: process.env.PROBE_HEAD_SHA || null, run_id: process.env.GITHUB_RUN_ID || null,
    event: process.env.GITHUB_EVENT_NAME || null, at: new Date().toISOString()};
  const out = JSON.stringify(report, null, 2);
  console.log(out);
  if (process.env.PROBE_OUT) fs.writeFileSync(process.env.PROBE_OUT, out + '\n');
  console.log(`AISEC05_SETTINGS_VERDICT ${report.overall}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(String(e.message).slice(0, 200)); process.exitCode = 1; });
}
