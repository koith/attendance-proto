#!/usr/bin/env node
// AISEC-05: static impact analysis of security/github_policy/sole_owner_policy.json
// against EVERY workflow, before any setting is changed. Read-only; no network.
//
// Blocking (exit 1 with --check):
//   REQUIRED_GATE_INVALID     the required check would not run on every PR
//   MAIN_PUSH_IN_WORKFLOW     a workflow writes to main directly (PR rule would break it)
//   WOULD_WAIT_FOR_APPROVAL   an automatic job (push/schedule/workflow_run/PR/issue) uses
//                             an environment that the policy gives required reviewers
//   UNKNOWN_ENVIRONMENT       a job uses an environment the policy does not define
// Informational (expected behaviour change of a main-only deployment branch policy):
//   WOULD_REJECT_OFF_MAIN     a job in a main-only environment is reachable from a non-main ref
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseWorkflow, jobReachability} from './workflow_secret_inventory.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const DEFAULT_POLICY = path.join(repoRoot, 'security', 'github_policy', 'sole_owner_policy.json');

export function eventContext(event, ref) {
  const known = {'github.event_name': event, 'github.ref': ref, 'github.repository': 'owner/repo',
    'github.ref_name': ref.replace(/^refs\/(heads|pull)\//, '')};
  // The payload of the triggering event itself is UNKNOWN (never null).
  const own = {workflow_run: ['github.event.workflow_run'], issues: ['github.event.issue'],
    issue_comment: ['github.event.issue', 'github.event.comment'], schedule: ['github.event.schedule']}[event] || [];
  const nullPrefixes = ['github.event.workflow_run', 'github.event.issue', 'github.event.comment', 'github.event.schedule']
    .filter((p) => !own.includes(p));
  if (event === 'pull_request') {
    known['github.event.pull_request.head.repo.full_name'] = 'owner/repo';
    nullPrefixes.push('inputs', 'github.event.inputs', 'github.event.head_commit');
  } else if (event === 'push') nullPrefixes.push('inputs', 'github.event.inputs', 'github.event.pull_request');
  else if (event === 'workflow_dispatch') nullPrefixes.push('github.event.head_commit', 'github.event.pull_request');
  else nullPrefixes.push('inputs', 'github.event.inputs', 'github.event.pull_request', 'github.event.head_commit');
  return {known, nullPrefixes};
}

// Events whose runs start without a person approving that specific run.
const AUTOMATIC = ['push', 'schedule', 'workflow_run', 'pull_request', 'issues', 'issue_comment', 'merge_group'];
// Events that GitHub always runs on the default branch.
const DEFAULT_BRANCH_ONLY = ['schedule', 'workflow_run', 'issues', 'issue_comment'];

export function prTriggerUnfiltered(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const onIdx = lines.findIndex((l) => /^(["']?)on\1\s*:/.test(l));
  if (onIdx < 0) return false;
  const inline = lines[onIdx].replace(/^(["']?)on\1\s*:\s*/, '').replace(/\s+#.*$/, '');
  if (inline) return /(^|[\s,[])pull_request($|[\s,\]])/.test(inline);
  for (let i = onIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' || l.trim().startsWith('#')) continue;
    if (!/^\s/.test(l)) break;
    const m = l.match(/^(\s+)pull_request\s*:\s*(.*)$/);
    if (!m) continue;
    if (m[2] && !/^(\{\s*\}|null|~)?\s*(#.*)?$/.test(m[2])) return false;
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j];
      if (n.trim() === '' || n.trim().startsWith('#')) continue;
      const ind = n.length - n.trimStart().length;
      if (ind <= m[1].length) return true;
      if (/^\s+(paths|paths-ignore|branches|branches-ignore)\s*:/.test(n)) return false;
      if (/^\s+types\s*:/.test(n) && !/opened/.test(n) ) return false;
    }
    return true;
  }
  return false;
}

const MAIN_WRITE_PATTERNS = [
  /git\s+push\b[^\n]*(\s|:|\/)(main|refs\/heads\/main)(\s|$|["'])/,
  /git\s+push\b[^\n]*\bHEAD:main\b/,
  /createOrUpdateFileContents|repos\.createOrUpdateFile|deleteFile\(/,
  /git\.(updateRef|createRef)\([^)]*heads\/main/,
  /\bgh\s+api\b[^\n]*-X\s*(PUT|PATCH|POST)[^\n]*\/contents\//,
];

export function analyzePolicy(files, policy) {
  const blocking = []; const info = []; const envUse = [];
  const gate = policy.required_check;
  const gateFile = files.find((f) => f.name === gate.workflow);
  if (!gateFile) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: 'workflow missing', workflow: gate.workflow});
  else {
    const wf = parseWorkflow(gateFile.text, gateFile.name);
    const job = wf.jobs.find((j) => j.id === gate.job);
    const nameOk = new RegExp(`^\\s{4}name:\\s*['"]?${gate.context}['"]?\\s*$`, 'm').test(gateFile.text);
    if (!prTriggerUnfiltered(gateFile.text)) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: 'pull_request trigger is filtered or absent', workflow: gate.workflow});
    if (!job) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: 'job missing', workflow: gate.workflow});
    else {
      if (job.if) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: 'job-level if can skip the check', workflow: gate.workflow});
      if (job.needs.length) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: 'job depends on other jobs', workflow: gate.workflow});
      if (job.refs.length) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: 'required gate must not use secrets', workflow: gate.workflow});
    }
    if (!nameOk) blocking.push({rule: 'REQUIRED_GATE_INVALID', reason: `job name must equal check context ${gate.context}`, workflow: gate.workflow});
  }
  for (const f of files) {
    const hit = MAIN_WRITE_PATTERNS.find((re) => re.test(f.text));
    if (hit) blocking.push({rule: 'MAIN_PUSH_IN_WORKFLOW', workflow: f.name, pattern: hit.source.slice(0, 40)});
    const wf = parseWorkflow(f.text, f.name);
    const envJobs = wf.jobs.filter((j) => j.environment);
    if (!envJobs.length) continue;
    const scenarios = [];
    for (const t of wf.triggers) {
      if (DEFAULT_BRANCH_ONLY.includes(t)) scenarios.push({event: t, ref: 'refs/heads/main', offMain: false});
      else if (t === 'pull_request') scenarios.push({event: t, ref: 'refs/pull/1/merge', offMain: true});
      else if (t === 'push' || t === 'workflow_dispatch' || t === 'merge_group') {
        scenarios.push({event: t, ref: 'refs/heads/main', offMain: false});
        scenarios.push({event: t, ref: 'refs/heads/feature', offMain: true});
      }
    }
    const reach = scenarios.map((s) => ({...s, map: jobReachability(wf.jobs, eventContext(s.event, s.ref))}));
    for (const job of envJobs) {
      const env = policy.environments[job.environment];
      const reachable = reach.filter((s) => s.map.get(job.id) !== false).map((s) => `${s.event}@${s.ref.replace('refs/heads/', '').replace('refs/pull/1/merge', 'pr')}`);
      envUse.push({workflow: f.name, job: job.id, environment: job.environment, reachable});
      if (!env) { blocking.push({rule: 'UNKNOWN_ENVIRONMENT', workflow: f.name, job: job.id, environment: job.environment}); continue; }
      if (env.unchanged) continue;
      if (env.required_reviewers) {
        const auto = reach.filter((s) => AUTOMATIC.includes(s.event) && s.map.get(job.id) !== false);
        if (auto.length) blocking.push({rule: 'WOULD_WAIT_FOR_APPROVAL', workflow: f.name, job: job.id, environment: job.environment,
          events: [...new Set(auto.map((s) => s.event))]});
      }
      if ((env.deployment_branches || []).length) {
        const off = reach.filter((s) => s.offMain && s.map.get(job.id) !== false);
        if (off.length) info.push({rule: 'WOULD_REJECT_OFF_MAIN', workflow: f.name, job: job.id, environment: job.environment,
          events: [...new Set(off.map((s) => s.event))]});
      }
    }
  }
  return {blocking, info, environment_jobs: envUse};
}

export function loadFiles(root = repoRoot) {
  const dir = path.join(root, '.github', 'workflows');
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
    .map((name) => ({name, text: fs.readFileSync(path.join(dir, name), 'utf8')}));
}

function main(argv) {
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
  const files = loadFiles();
  const r = analyzePolicy(files, policy);
  const summary = {schema: 1, task: 'AISEC-05', workflows: files.length, blocking: r.blocking.length,
    would_reject_off_main: r.info.length, environment_jobs: r.environment_jobs.length, settings_changed: 0};
  if (argv.includes('--report')) console.log(JSON.stringify({...summary, ...r}, null, 2));
  else console.log(JSON.stringify(summary));
  for (const b of r.blocking) console.error('AISEC05_POLICY_BLOCKING ' + JSON.stringify(b));
  return r.blocking.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
