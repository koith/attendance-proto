// AISEC-07 synthetic QA. Only fake secret NAMES; no values, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseWorkflow, analyzeWorkflows, compareBaseline, evaluateIf, pullRequestContext,
  scanRepository, loadClasses, DEFAULT_BASELINE, violationKey,
} from './workflow_secret_inventory.mjs';

const classes = {
  PROD_WRITE: {family: 'production', write: true, backup_only: false, purpose: 'synthetic prod write'},
  PROD_READ: {family: 'production', write: false, backup_only: false, purpose: 'synthetic prod read'},
  QA_WRITE: {family: 'qa', write: true, backup_only: false, purpose: 'synthetic qa write'},
  BACKUP_KEY: {family: 'production', write: true, backup_only: true, purpose: 'synthetic backup key'},
};
const run = (yaml, file = 'wf.yml') => analyzeWorkflows([parseWorkflow(yaml, file)], classes).violations;
const rules = (v) => v.map((x) => x.rule).sort();

test('evaluator: pull_request exclusion guards are definite false', () => {
  const pr = pullRequestContext();
  assert.equal(evaluateIf("github.event_name != 'pull_request'", pr), false);
  assert.equal(evaluateIf("github.ref == 'refs/heads/main'", pr), false);
  assert.equal(evaluateIf("github.event_name == 'push' && contains(github.event.head_commit.message, '[X]')", pr), false);
  assert.equal(evaluateIf("github.event_name == 'workflow_dispatch' && inputs.apply == true", pr), false);
  assert.equal(evaluateIf("contains(github.event.head_commit.message, '[DEPLOY]')", pr), false, 'no head_commit on pull_request');
  assert.equal(evaluateIf("github.event.workflow_run.conclusion == 'success'", pr), false);
});

test('evaluator: same-repo PR and unknown outputs are NOT treated as excluded', () => {
  const pr = pullRequestContext();
  assert.equal(evaluateIf("github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository", pr), true);
  assert.equal(evaluateIf("needs.a.outputs.go == 'true'", pr), undefined);
  assert.equal(evaluateIf('always()', pr), true);
  assert.equal(evaluateIf('', pr), true);
  assert.equal(evaluateIf("github.event_name == 'pull_request' ||| x", pr), undefined, 'unparsable is unknown, never false');
});

test('PR-reachable write secret fails; step guard excluding PR passes', () => {
  const bad = `on:\n  pull_request:\njobs:\n  a:\n    runs-on: x\n    environment: production\n    steps:\n      - name: deploy\n        env:\n          T: \${{ secrets.PROD_WRITE }}\n        run: echo ok\n`;
  assert.deepEqual(rules(run(bad)), ['PR_REACHABLE_WRITE_SECRET']);
  const good = bad.replace('      - name: deploy\n', "      - name: deploy\n        if: github.event_name != 'pull_request'\n");
  assert.deepEqual(run(good), []);
});

test('job depending on a PR-skipped job is unreachable unless it uses always()', () => {
  const base = `on: [pull_request, push]\njobs:\n  gate:\n    if: github.ref == 'refs/heads/main'\n    runs-on: x\n    steps:\n      - run: true\n  use:\n    needs: gate\n    IFLINE\n    environment: production\n    runs-on: x\n    env:\n      T: \${{ secrets.PROD_WRITE }}\n    steps:\n      - run: true\n`;
  assert.deepEqual(run(base.replace('IFLINE', "if: needs.gate.outputs.x == 'y'")), []);
  assert.deepEqual(rules(run(base.replace('IFLINE', 'if: always()'))), ['PR_REACHABLE_WRITE_SECRET']);
});

test('read-class secret on PR, presence checks and comments are not exposures', () => {
  const y = `on:\n  pull_request:\njobs:\n  a:\n    runs-on: x\n    env:\n      R: \${{ secrets.PROD_READ }}\n      HAS: \${{ secrets.PROD_WRITE != '' }}\n    # T: \${{ secrets.PROD_WRITE }}\n    steps:\n      - if: secrets.PROD_WRITE != ''\n        run: true\n      - if: \${{ secrets.PROD_WRITE }}\n        run: true\n`;
  assert.deepEqual(run(y), []);
});

test('unclassified secret and secret interpolated in run: always fail', () => {
  const y = `on: push\njobs:\n  a:\n    runs-on: x\n    environment: production\n    steps:\n      - run: |\n          curl -H "x: \${{ secrets.PROD_WRITE }}" example\n      - env:\n          N: \${{ secrets.BRAND_NEW }}\n        run: true\n`;
  assert.deepEqual(rules(run(y)), ['SECRET_IN_RUN_SCRIPT', 'UNCLASSIFIED_SECRET']);
});

test('production write without environment, family mix, and backup sharing are detected', () => {
  const y = `on: push\njobs:\n  mix:\n    runs-on: x\n    env:\n      A: \${{ secrets.PROD_WRITE }}\n      B: \${{ secrets.QA_WRITE }}\n    steps:\n      - run: true\n  backup:\n    runs-on: x\n    environment: production-backup\n    env:\n      K: \${{ secrets.BACKUP_KEY }}\n      A: \${{ secrets.PROD_WRITE }}\n    steps:\n      - run: true\n  other:\n    runs-on: x\n    environment:\n      name: production\n    env:\n      K: \${{ secrets.BACKUP_KEY }}\n    steps:\n      - run: true\n`;
  const v = run(y);
  assert.deepEqual(rules(v), ['BACKUP_CREDENTIAL_SHARED', 'BACKUP_CREDENTIAL_SHARED', 'CREDENTIAL_FAMILY_MIX', 'UNGATED_PRODUCTION_WRITE']);
  assert.ok(v.some((x) => x.rule === 'UNGATED_PRODUCTION_WRITE' && x.job === 'mix'));
});

test('workflow-level env applies to every job', () => {
  const y = `on: pull_request\nenv:\n  T: \${{ secrets.PROD_WRITE }}\njobs:\n  a:\n    environment: production\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(rules(run(y)), ['PR_REACHABLE_WRITE_SECRET']);
});

test('baseline ratchet: new violation fails, stale entry fails, forbidden rules cannot be accepted', () => {
  const v = [{rule: 'UNGATED_PRODUCTION_WRITE', workflow: 'w', job: 'j', secret: 'S'}];
  const ok = {schema: 1, accepted_risks: [{...v[0], reason: 'pre-existing risk'}]};
  assert.deepEqual(compareBaseline(v, ok), {fresh: [], stale: [], accepted: 1});
  assert.equal(compareBaseline([...v, {...v[0], job: 'k'}], ok).fresh.length, 1);
  assert.equal(compareBaseline([], ok).stale.length, 1);
  assert.throws(() => compareBaseline(v, {schema: 1, accepted_risks: [{...v[0], rule: 'PR_REACHABLE_WRITE_SECRET', reason: 'nope nope nope'}]}), /FORBIDDEN_RULE/);
  assert.throws(() => compareBaseline(v, {schema: 1, accepted_risks: [{...v[0], reason: ''}]}), /REASON_REQUIRED/);
});

test('repository: every referenced secret is classified and only the frozen baseline remains', () => {
  const {violations, inventory} = scanRepository();
  const cls = loadClasses();
  for (const name of Object.keys(inventory)) assert.ok(cls[name], `unclassified ${name}`);
  const baseline = JSON.parse(fs.readFileSync(DEFAULT_BASELINE, 'utf8'));
  const {fresh, stale} = compareBaseline(violations, baseline);
  assert.deepEqual(fresh.map(violationKey), []);
  assert.deepEqual(stale.map(violationKey), []);
  assert.ok(!violations.some((x) => x.rule === 'PR_REACHABLE_WRITE_SECRET'));
});
