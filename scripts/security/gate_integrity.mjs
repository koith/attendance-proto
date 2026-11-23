#!/usr/bin/env node
// AISEC-05: integrity of the required merge gate itself.
//
// A `pull_request` workflow runs the PR's OWN version of itself, so a PR can
// neuter `required-gate` and still pass it. This check runs from
// `pull_request_target`, i.e. the BASE branch's code and policy, and treats
// every byte of the PR as data: it never checks out or executes PR code.
//
//   PROTECTED_PATH_NEEDS_OWNER_APPROVAL  PR changes the gate, its policy or
//       its guards (or adds a pull_request_target workflow) without a current
//       owner approval label applied by a human in the GitHub UI (an app /
//       AI connector acting with the owner's token does NOT count; any new
//       push to protected paths revokes the approval).
//   REQUIRED_CONTEXT_SPOOF  a changed workflow other than the canonical one
//       can emit a check named like a required context (never approvable).
//   DYNAMIC_JOB_NAME_ON_PR  a changed PR workflow builds a job name from an
//       expression (could forge a context); needs owner approval.
//   FILE_LIST_UNVERIFIED    the changed-file list could not be fully read.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_POLICY = path.resolve(here, '..', '..', 'security', 'github_policy', 'sole_owner_policy.json');

const isProtected = (file, list) => list.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
const isWorkflow = (f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f);

export function approvalState(labelEvents, labels, label, owner) {
  if (!labels.includes(label)) return {approved: false, why: 'label absent'};
  const ev = labelEvents.filter((e) => (e.event === 'labeled' || e.event === 'unlabeled') && e.label?.name === label);
  const last = ev.at(-1);
  if (!last || last.event !== 'labeled') return {approved: false, why: 'no labeled event'};
  if (last.actor?.login !== owner) return {approved: false, why: 'label not applied by owner'};
  if (last.performed_via_github_app) return {approved: false, why: 'label applied via an app (AI connector), not the owner in the UI'};
  return {approved: true, at: last.created_at};
}

export function assessGateIntegrity({files, headWorkflows = {}, labels = [], labelEvents = [], owner, policy, action}) {
  const gi = policy.gate_integrity;
  const contexts = policy.required_checks.map((c) => c.context);
  const canonical = Object.fromEntries(policy.required_checks.map((c) => [c.context, `.github/workflows/${c.workflow}`]));
  const reasons = []; const needsApproval = [];
  if (!Array.isArray(files) || files.length >= 3000) return {verdict: 'BLOCK', reasons: [{rule: 'FILE_LIST_UNVERIFIED'}], remove_label: false};
  for (const f of files) {
    for (const name of [f.filename, f.previous_filename].filter(Boolean)) {
      if (isProtected(name, gi.protected_paths)) needsApproval.push({rule: 'PROTECTED_PATH_NEEDS_OWNER_APPROVAL', path: name});
    }
  }
  for (const [file, text] of Object.entries(headWorkflows)) {
    if (text == null) { reasons.push({rule: 'FILE_LIST_UNVERIFIED', path: file}); continue; }
    for (const ctx of contexts) {
      if (canonical[ctx] === file) continue;
      // Conservative literal match: any mention of a required context in a
      // non-canonical workflow (job id, name, matrix value...) is a spoof risk.
      if (new RegExp(`(^|[^A-Za-z0-9_-])${ctx.replace(/[-]/g, '\\-')}($|[^A-Za-z0-9_-])`, 'm').test(text))
        reasons.push({rule: 'REQUIRED_CONTEXT_SPOOF', path: file, context: ctx});
    }
    if (/^\s*pull_request_target\s*:|on:\s*\[[^\]]*pull_request_target/m.test(text) && !Object.values(canonical).includes(file))
      needsApproval.push({rule: 'PROTECTED_PATH_NEEDS_OWNER_APPROVAL', path: file, detail: 'adds or changes a pull_request_target workflow'});
    if (/\b(statuses|checks)\s*:\s*write\b|\bwrite-all\b/.test(text) && !Object.values(canonical).includes(file))
      needsApproval.push({rule: 'TOKEN_CAN_FORGE_STATUS', path: file});
    if (/^\s*pull_request\s*:|on:\s*\[[^\]]*pull_request[,\]\s]/m.test(text) && /^ {4}name:[^\n]*\$\{\{/m.test(text) && !Object.values(canonical).includes(file))
      needsApproval.push({rule: 'DYNAMIC_JOB_NAME_ON_PR', path: file});
  }
  const touchedProtected = needsApproval.some((n) => n.rule === 'PROTECTED_PATH_NEEDS_OWNER_APPROVAL' && !n.detail);
  // A new push to protected paths always revokes an earlier approval.
  const removeLabel = action === 'synchronize' && touchedProtected && labels.includes(gi.approval_label);
  const approval = removeLabel ? {approved: false, why: 'new push after approval'} : approvalState(labelEvents, labels, gi.approval_label, owner);
  if (needsApproval.length && !approval.approved) reasons.push(...needsApproval.map((n) => ({...n, approval: approval.why})));
  const verdict = reasons.length ? 'BLOCK' : 'PASS';
  return {verdict, reasons, approval_required: needsApproval.length > 0, approved: approval.approved && needsApproval.length > 0, remove_label: removeLabel};
}

async function gh(token, repo, method, p, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${p}`, {method, headers: {authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(body ? {'content-type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined});
  if (res.status >= 500) throw Error(`GATE_INTEGRITY_UPSTREAM_${res.status}`);
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return {status: res.status, body: json};
}
async function pages(token, repo, p, max = 30) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const r = await gh(token, repo, 'GET', `${p}${p.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (r.status !== 200 || !Array.isArray(r.body)) return null;
    out.push(...r.body); if (r.body.length < 100) return out;
  }
  return null;
}

async function main() {
  const {GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: num, EVENT_ACTION: action = '', GATE_ADVISORY: advisory = ''} = process.env;
  if (!token || !/^\d+$/.test(num || '') || !/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw Error('GATE_INTEGRITY_BAD_ENV');
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8')); // BASE checkout: trusted
  const pr = (await gh(token, repo, 'GET', `/pulls/${num}`)).body;
  const owner = (await gh(token, repo, 'GET', '')).body?.owner?.login;
  if (!pr?.head?.sha || !owner) throw Error('GATE_INTEGRITY_PR_UNREADABLE');
  const files = await pages(token, repo, `/pulls/${num}/files`);
  const headWorkflows = {};
  for (const f of files || []) {
    if (!isWorkflow(f.filename) || f.status === 'removed') continue;
    const c = await gh(token, repo, 'GET', `/contents/${f.filename.split('/').map(encodeURIComponent).join('/')}?ref=${pr.head.sha}`);
    headWorkflows[f.filename] = c.status === 200 && c.body?.encoding === 'base64' ? Buffer.from(c.body.content, 'base64').toString('utf8') : null;
  }
  const labelEvents = (await pages(token, repo, `/issues/${num}/events`)) || [];
  const labels = (pr.labels || []).map((l) => l.name);
  const r = assessGateIntegrity({files, headWorkflows, labels, labelEvents, owner, policy, action});
  if (r.remove_label && !advisory) {
    await gh(token, repo, 'DELETE', `/issues/${num}/labels/${encodeURIComponent(policy.gate_integrity.approval_label)}`);
    console.log('GATE_APPROVAL_REVOKED new push to protected paths; owner must re-approve');
  }
  // A pull_request_target job's own check run is attached to the BASE sha and
  // can never satisfy a required check on the PR. Report the verdict as a
  // commit status on the exact PR HEAD sha instead (the ruleset requires it).
  const dry = process.env.GATE_DRYRUN_STATUS_CONTEXT || '';
  const context = advisory ? (/^[a-z-]+-dryrun$/.test(dry) ? dry : '') : policy.gate_integrity.status_context;
  if (context) {
    const runUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`;
    const st = await gh(token, repo, 'POST', `/statuses/${pr.head.sha}`, {state: r.verdict === 'PASS' ? 'success' : 'failure', context,
      description: (r.verdict === 'PASS' ? 'Gate/policy integrity verified by base-branch code' : `Blocked: ${r.reasons.map((x) => x.rule).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`).slice(0, 140),
      target_url: runUrl});
    if (st.status !== 201) throw Error(`GATE_INTEGRITY_STATUS_POST_HTTP_${st.status}`);
    console.log(`GATE_INTEGRITY_STATUS_POSTED context=${context} sha=${pr.head.sha} state=${r.verdict === 'PASS' ? 'success' : 'failure'}`);
  }
  console.log(JSON.stringify({schema: 1, pr: Number(num), head_sha: pr.head.sha, advisory: Boolean(advisory), ...r}));
  console.log(`GATE_INTEGRITY_VERDICT ${r.verdict}`);
  if (r.verdict !== 'PASS' && !advisory) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(String(e.message).slice(0, 200)); process.exitCode = 1; });
}
