// AISEC-05 synthetic attack QA for the merge-gate integrity check. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessGateIntegrity, approvalState, DEFAULT_POLICY} from './gate_integrity.mjs';

const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
const OWNER = 'koith'; const LABEL = policy.gate_integrity.approval_label;
const human = (at = '2026-11-22T10:00:00Z') => ({event: 'labeled', label: {name: LABEL}, actor: {login: OWNER}, performed_via_github_app: null, created_at: at});
const run = (o) => assessGateIntegrity({owner: OWNER, policy, action: 'opened', ...o});
const rules = (r) => r.reasons.map((x) => x.rule).sort();
const f = (filename, extra = {}) => ({filename, status: 'modified', ...extra});

test('ordinary PR not touching the gate passes with no approval', () => {
  const r = run({files: [f('index.html'), f('scripts/foo.mjs')]});
  assert.equal(r.verdict, 'PASS'); assert.equal(r.approval_required, false);
});

test('neutering the gate, its policy or guards is blocked without owner approval', () => {
  for (const p of ['.github/workflows/pr-required-gate.yml', '.github/workflows/pr-gate-integrity.yml', 'scripts/security/gate_integrity.mjs',
    'security/github_policy/sole_owner_policy.json', 'security/aisec07_secret_policy_baseline.json', 'scripts/security/workflow_secret_inventory.mjs']) {
    const r = run({files: [f(p)]});
    assert.equal(r.verdict, 'BLOCK', p); assert.deepEqual(rules(r), ['PROTECTED_PATH_NEEDS_OWNER_APPROVAL']);
  }
  const renamed = run({files: [f('docs/x.yml', {status: 'renamed', previous_filename: '.github/workflows/pr-required-gate.yml'})]});
  assert.equal(renamed.verdict, 'BLOCK', 'renaming the gate away is a change to it');
  const deleted = run({files: [f('.github/workflows/pr-gate-integrity.yml', {status: 'removed'})]});
  assert.equal(deleted.verdict, 'BLOCK');
});

test('owner approval in the UI unlocks; app/AI-connector or non-owner labels never do', () => {
  const files = [f('.github/workflows/pr-required-gate.yml')];
  assert.equal(run({files, labels: [LABEL], labelEvents: [human()]}).verdict, 'PASS');
  assert.equal(run({files, labels: [LABEL], labelEvents: [{...human(), performed_via_github_app: {slug: 'claude'}}]}).verdict, 'BLOCK');
  assert.equal(run({files, labels: [LABEL], labelEvents: [{...human(), actor: {login: 'attacker'}}]}).verdict, 'BLOCK');
  assert.equal(run({files, labels: [], labelEvents: [human()]}).verdict, 'BLOCK', 'label must still be present');
  assert.equal(run({files, labels: [LABEL], labelEvents: [human(), {...human(), event: 'unlabeled'}, {...human(), actor: {login: 'bot'}}]}).verdict, 'BLOCK', 'latest label event decides');
  assert.equal(approvalState([], ['other'], LABEL, OWNER).approved, false);
});

test('a new push to protected paths revokes approval (approve-then-swap attack)', () => {
  const r = run({files: [f('.github/workflows/pr-required-gate.yml')], labels: [LABEL], labelEvents: [human()], action: 'synchronize'});
  assert.equal(r.verdict, 'BLOCK'); assert.equal(r.remove_label, true);
  const unrelated = run({files: [f('index.html')], labels: [LABEL], labelEvents: [human()], action: 'synchronize'});
  assert.equal(unrelated.remove_label, false, 'pushes that do not touch protected paths keep the label');
});

test('a second workflow emitting a required context name is a hard block even when approved', () => {
  const spoof = `on: pull_request\njobs:\n  x:\n    name: required-gate\n    runs-on: x\n    steps:\n      - run: true\n`;
  const r = run({files: [f('.github/workflows/evil.yml', {status: 'added'})], headWorkflows: {'.github/workflows/evil.yml': spoof}, labels: [LABEL], labelEvents: [human()]});
  assert.equal(r.verdict, 'BLOCK'); assert.ok(rules(r).includes('REQUIRED_CONTEXT_SPOOF'));
  const viaId = `on: pull_request\njobs:\n  gate-integrity:\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.ok(rules(run({files: [f('.github/workflows/e2.yml')], headWorkflows: {'.github/workflows/e2.yml': viaId}})).includes('REQUIRED_CONTEXT_SPOOF'));
  const lookalike = `on: pull_request\njobs:\n  x:\n    name: required-gates-docs\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.equal(run({files: [f('.github/workflows/ok.yml')], headWorkflows: {'.github/workflows/ok.yml': lookalike}}).verdict, 'PASS', 'no false positive on longer names');
});

test('new pull_request_target workflows and dynamic PR job names need approval; unreadable data blocks', () => {
  const prt = `on:\n  pull_request_target:\njobs:\n  x:\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.equal(run({files: [f('.github/workflows/t.yml', {status: 'added'})], headWorkflows: {'.github/workflows/t.yml': prt}}).verdict, 'BLOCK');
  const dyn = `on:\n  pull_request:\njobs:\n  x:\n    name: \${{ matrix.n }}\n    runs-on: x\n    steps:\n      - run: true\n`;
  assert.deepEqual(rules(run({files: [f('.github/workflows/d.yml')], headWorkflows: {'.github/workflows/d.yml': dyn}})), ['DYNAMIC_JOB_NAME_ON_PR']);
  assert.equal(run({files: [f('.github/workflows/d.yml')], headWorkflows: {'.github/workflows/d.yml': dyn}, labels: [LABEL], labelEvents: [human()]}).verdict, 'PASS');
  assert.deepEqual(rules(run({files: null})), ['FILE_LIST_UNVERIFIED']);
  assert.deepEqual(rules(run({files: [f('.github/workflows/z.yml')], headWorkflows: {'.github/workflows/z.yml': null}})), ['FILE_LIST_UNVERIFIED']);
});

test('the real canonical gate workflows do not trip the spoof rule', () => {
  const headWorkflows = Object.fromEntries(['pr-required-gate.yml', 'pr-gate-integrity.yml'].map((n) => [`.github/workflows/${n}`, fs.readFileSync(`.github/workflows/${n}`, 'utf8')]));
  const r = run({files: Object.keys(headWorkflows).map((p) => f(p)), headWorkflows, labels: [LABEL], labelEvents: [human()]});
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.reasons));
});

test('a changed workflow that can write statuses/checks could forge the required status: needs owner approval', () => {
  for (const perm of ['statuses: write', 'checks: write', 'write-all']) {
    const wf = `on: pull_request\npermissions:\n  ${perm.includes(':') ? perm : perm}\njobs:\n  x:\n    runs-on: x\n    steps:\n      - run: true\n`;
    assert.deepEqual(rules(run({files: [f('.github/workflows/w.yml')], headWorkflows: {'.github/workflows/w.yml': wf}})), ['TOKEN_CAN_FORGE_STATUS'], perm);
  }
});
