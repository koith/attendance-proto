// AISEC-05 synthetic QA for the policy impact analyzer. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analyzePolicy, loadFiles, prTriggerUnfiltered, DEFAULT_POLICY} from './github_policy_impact.mjs';

const policy = () => JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
const gate = `name: g\non:\n  pull_request:\n  merge_group:\njobs:\n  required-gate:\n    name: required-gate\n    runs-on: x\n    steps:\n      - run: true\n`;
const rules = (r) => r.blocking.map((b) => b.rule).sort();

test('required gate must run on every PR with no filter, if, needs or secrets', () => {
  assert.equal(prTriggerUnfiltered(gate), true);
  assert.equal(prTriggerUnfiltered('on: [push, pull_request]\n'), true);
  assert.equal(prTriggerUnfiltered("on:\n  pull_request:\n    paths:\n      - 'a'\n"), false);
  assert.equal(prTriggerUnfiltered("on:\n  pull_request:\n    branches: [main]\n"), false);
  assert.equal(prTriggerUnfiltered('on:\n  push:\n'), false);
  const ok = analyzePolicy([{name: 'pr-required-gate.yml', text: gate}], policy());
  assert.deepEqual(ok.blocking, []);
  for (const bad of [gate.replace('  pull_request:\n', "  pull_request:\n    paths: ['x']\n"),
    gate.replace('    name: required-gate\n', "    name: required-gate\n    if: github.actor == 'x'\n"),
    gate.replace('    name: required-gate\n', '    name: something-else\n'),
    gate.replace('      - run: true\n', '      - env:\n          T: ${{ secrets.X }}\n        run: true\n')]) {
    assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: bad}], policy())), ['REQUIRED_GATE_INVALID']);
  }
  assert.deepEqual(rules(analyzePolicy([], policy())), ['REQUIRED_GATE_INVALID']);
});

test('direct writes to main in a workflow are blocking', () => {
  for (const run of ['git push origin main', 'git push origin HEAD:main', 'gh api -X PUT repos/o/r/contents/a.md']) {
    const wf = `on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: ${run}\n`;
    assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'w.yml', text: wf}], policy())), ['MAIN_PUSH_IN_WORKFLOW']);
  }
  const review = `on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: git push -u origin "$branch"\n`;
  assert.deepEqual(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'w.yml', text: review}], policy()).blocking, []);
});

test('reviewers on an environment used by an automatic job are blocking; manual-only is fine', () => {
  const p = policy(); p.environments.production.required_reviewers = true;
  const sched = `on:\n  schedule:\n    - cron: '0 0 * * *'\n  workflow_dispatch:\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 's.yml', text: sched}], p)), ['WOULD_WAIT_FOR_APPROVAL']);
  const manual = `on:\n  workflow_dispatch:\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'm.yml', text: manual}], p).blocking, []);
  const wr = `on:\n  workflow_run:\n    workflows: [x]\n    types: [completed]\njobs:\n  a:\n    if: github.event.workflow_run.conclusion == 'success'\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'r.yml', text: wr}], p)), ['WOULD_WAIT_FOR_APPROVAL'], 'own event payload is unknown, not null');
});

test('main-only branch policy reports off-main reachable jobs; unknown environments block', () => {
  const pr = `on:\n  pull_request:\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  const r = analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'p.yml', text: pr}], policy());
  assert.deepEqual(r.info.map((x) => x.rule), ['WOULD_REJECT_OFF_MAIN']);
  const guarded = pr.replace('    environment', "    if: github.ref == 'refs/heads/main'\n    environment");
  assert.deepEqual(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'p.yml', text: guarded}], policy()).info, []);
  assert.deepEqual(rules(analyzePolicy([{name: 'pr-required-gate.yml', text: gate}, {name: 'u.yml', text: pr.replace('production', 'staging')}], policy())), ['UNKNOWN_ENVIRONMENT']);
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
