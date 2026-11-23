// AISEC-05 synthetic QA for the policy impact analyzer. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzePolicy, loadFiles, prTriggerUnfiltered, DEFAULT_POLICY} from './github_policy_impact.mjs';

const policy = () => JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
const gate = `name: g\non:\n  pull_request:\n  merge_group:\njobs:\n  required-gate:\n    name: required-gate\n    runs-on: x\n    steps:\n      - run: true\n`;
const integ = `name: i\npermissions:\n  statuses: write\non:\n  pull_request_target:\n    types: [opened, synchronize, reopened, labeled, unlabeled, edited]\njobs:\n  gate-integrity:\n    name: gate-integrity-judge\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: \${{ github.event.pull_request.base.sha }}\n      - run: node scripts/security/gate_integrity.mjs\n`;
const INTEG = {name: 'pr-gate-integrity.yml', text: integ};
const rules = (r) => r.blocking.map((b) => b.rule).sort();

test('required gate must run on every PR with no filter, if, needs or secrets', () => {
  assert.equal(prTriggerUnfiltered(gate), true);
  assert.equal(prTriggerUnfiltered('on: [push, pull_request]\n'), true);
  assert.equal(prTriggerUnfiltered("on:\n  pull_request:\n    paths:\n      - 'a'\n"), false);
  assert.equal(prTriggerUnfiltered("on:\n  pull_request:\n    branches: [main]\n"), false);
  assert.equal(prTriggerUnfiltered('on:\n  push:\n'), false);
  const ok = analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG], policy());
  assert.deepEqual(ok.blocking, []);
  for (const bad of [gate.replace('  pull_request:\n', "  pull_request:\n    paths: ['x']\n"),
    gate.replace('    name: required-gate\n', "    name: required-gate\n    if: github.actor == 'x'\n"),
    gate.replace('    name: required-gate\n', '    name: something-else\n'),
    gate.replace('      - run: true\n', '      - env:\n          T: ${{ secrets.X }}\n        run: true\n')]) {
    assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: bad}, INTEG], policy())), ['REQUIRED_GATE_INVALID']);
  }
  assert.deepEqual(rules(analyzePolicy([], policy())), ['REQUIRED_GATE_INVALID', 'REQUIRED_GATE_INVALID']);
});

test('direct writes to main in a workflow are blocking', () => {
  for (const run of ['git push origin main', 'git push origin HEAD:main', 'gh api -X PUT repos/o/r/contents/a.md']) {
    const wf = `on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: ${run}\n`;
    assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'w.yml', text: wf}], policy())), ['MAIN_PUSH_IN_WORKFLOW']);
  }
  const review = `on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: git push -u origin "$branch"\n`;
  assert.deepEqual(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'w.yml', text: review}], policy()).blocking, []);
});

test('reviewers on an environment used by an automatic job are blocking; manual-only is fine', () => {
  const p = policy(); p.environments.production.required_reviewers = true;
  const sched = `on:\n  schedule:\n    - cron: '0 0 * * *'\n  workflow_dispatch:\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 's.yml', text: sched}], p)), ['WOULD_WAIT_FOR_APPROVAL']);
  const manual = `on:\n  workflow_dispatch:\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'm.yml', text: manual}], p).blocking, []);
  const wr = `on:\n  workflow_run:\n    workflows: [x]\n    types: [completed]\njobs:\n  a:\n    if: github.event.workflow_run.conclusion == 'success'\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'r.yml', text: wr}], p)), ['WOULD_WAIT_FOR_APPROVAL'], 'own event payload is unknown, not null');
});

test('main-only branch policy reports off-main reachable jobs; unknown environments block', () => {
  const pr = `on:\n  pull_request:\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  const r = analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'p.yml', text: pr}], policy());
  assert.deepEqual(r.info.map((x) => x.rule), ['WOULD_REJECT_OFF_MAIN']);
  const guarded = pr.replace('    environment', "    if: github.ref == 'refs/heads/main'\n    environment");
  assert.deepEqual(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'p.yml', text: guarded}], policy()).info, []);
  assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, INTEG, {name: 'u.yml', text: pr.replace('production', 'staging')}], policy())), ['UNKNOWN_ENVIRONMENT']);
});

test('repository: sole-owner policy has zero blocking impact and zero off-main rejections', () => {
  const r = analyzePolicy(loadFiles(), policy());
  assert.deepEqual(r.blocking, []);
  assert.deepEqual(r.info, []);
  assert.ok(r.environment_jobs.some((j) => j.workflow === 'sec-backup-capture.yml' && j.environment === 'production-backup'));
});

test('repository what-if: reviewers on production or production-backup would stall automation', () => {
  for (const env of ['production', 'production-backup']) {
    const p = policy(); p.environments[env].required_reviewers = true;
    const r = analyzePolicy(loadFiles(), p);
    assert.ok(r.blocking.length > 0 && r.blocking.every((b) => b.rule === 'WOULD_WAIT_FOR_APPROVAL'), env);
  }
});

test('gate-integrity must run on pull_request_target incl. synchronize, and never check out PR head code', () => {
  const both = (i) => analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'pr-gate-integrity.yml', text: i}], policy());
  assert.deepEqual(both(integ).blocking, []);
  assert.deepEqual(rules(both(integ.replace('opened, synchronize, ', 'opened, '))), ['REQUIRED_GATE_INVALID'], 'without synchronize a new push is never re-judged');
  assert.deepEqual(rules(both(integ.replace('pull_request_target:', 'pull_request:'))), ['REQUIRED_GATE_INVALID'], 'pull_request would run the PR version of the check');
  assert.deepEqual(rules(both(integ.replace('base.sha', 'head.sha'))), ['PULL_REQUEST_TARGET_RUNS_PR_CODE']);
  assert.deepEqual(rules(both(integ.replace('  statuses: write\n', ''))), ['REQUIRED_GATE_INVALID'], 'must be able to post the head-sha status');
  assert.deepEqual(rules(both(integ.replace('      - run: node', '      - env:\n          T: ${{ secrets.X }}\n        run: node'))), ['REQUIRED_GATE_INVALID']);
});
