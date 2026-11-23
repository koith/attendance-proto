// AISEC-05/07 continuity contract: hardening must not stop automatic deploys or
// the daily backup, and the backup must never fall back to operating credentials.
// Static, no network, no secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseWorkflow} from '../../scripts/security/workflow_secret_inventory.mjs';
import {analyzePolicy, loadFiles, DEFAULT_POLICY} from '../../scripts/security/github_policy_impact.mjs';

const read = (f) => fs.readFileSync(`.github/workflows/${f}`, 'utf8');
const backup = read('sec-backup-capture.yml');

test('daily backup keeps its schedule, main-only guard, protected environment and no-approval automation', () => {
  assert.match(backup, /^\s+- cron: '47 16 \* \* \*'$/m);
  const job = parseWorkflow(backup, 'sec-backup-capture.yml').jobs.find((j) => j.id === 'sealed-capture');
  assert.equal(job.environment, 'production-backup');
  assert.match(job.if, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job.if, /github\.event_name == 'schedule'/);
  const policy = JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8'));
  assert.equal(policy.environments['production-backup'].required_reviewers, false, 'a reviewer would make every daily backup wait');
});

test('backup uses ONLY backup-scoped secrets (no fallback) and proves read-only before capture', () => {
  const names = [...backup.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(names)].sort(), ['BACKUP_AUTH_CONFIG_TOKEN', 'BACKUP_DB_READONLY_URL', 'BACKUP_STORAGE_SERVICE_KEY']);
  assert.doesNotMatch(backup, /\|\|\s*secrets\./, 'no fallback expression');
  const pre = backup.indexOf('bash scripts/security/backup_reader_preflight.sh');
  const cap = backup.indexOf('node scripts/security/capture.mjs');
  assert.ok(pre > 0 && cap > pre, 'read-only proof must run before capture');
  const preflight = fs.readFileSync('scripts/security/backup_reader_preflight.sh', 'utf8');
  assert.doesNotMatch(preflight, /BACKUP_(DB|AUTH)_DEDICATED|legacy/i, 'verification is unconditional');
});

test('policy has zero blocking impact on deploy/backup jobs and none of them become approval-gated', () => {
  const r = analyzePolicy(loadFiles(), JSON.parse(fs.readFileSync(DEFAULT_POLICY, 'utf8')));
  assert.deepEqual(r.blocking, []);
  for (const j of r.environment_jobs.filter((x) => ['deploy-server-payroll-edge.yml', 'p0-pages-deploy.yml', 'sec-backup-capture.yml'].includes(x.workflow)))
    assert.ok(j.reachable.some((s) => s.endsWith('@main')), `${j.workflow}#${j.job} still runs from main`);
});

test('automatic deploy workflows are byte-identical to main (hardening did not touch them)', () => {
  let base;
  try { base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {encoding: 'utf8'}).trim(); } catch { return; } // shallow/no remote: skip, CI has history
  for (const f of ['deploy-server-payroll-edge.yml', 'p0-pages-deploy.yml', 'publish-pages.yml', 'apps-script-deploy.yml', 'verified-pages-deployment-notification.yml']) {
    const before = execFileSync('git', ['show', `${base}:.github/workflows/${f}`], {encoding: 'utf8'});
    assert.equal(read(f), before, f);
  }
});
