#!/usr/bin/env node
// AISEC-07: static inventory and lifecycle-separation guard for GitHub Actions
// secrets. It only reads workflow YAML in the repository. It never reads,
// prints or requests a secret VALUE, and it never calls GitHub or any service.
//
// What code CAN prove: which secret NAME reaches which job/step, under which
// trigger and `if:` guard, and whether the job declares a GitHub environment.
// What code CANNOT prove: whether that environment has required reviewers, or
// whether an environment-scoped secret shadows the repository secret of the
// same name. Those stay CANNOT_VERIFY until a maintainer records settings
// evidence; this guard never turns them into PASS.
//
// Rules (fail-closed):
//   UNCLASSIFIED_SECRET          secret name missing from the class manifest
//   SECRET_IN_RUN_SCRIPT         ${{ secrets.X }} interpolated inside run:
//   PR_REACHABLE_WRITE_SECRET    write-class secret reachable on pull_request
//   UNGATED_PRODUCTION_WRITE     production write secret in a job without environment:
//   CREDENTIAL_FAMILY_MIX        production and QA write credentials in one job
//   BACKUP_CREDENTIAL_SHARED     secret used by a backup environment job is also used elsewhere
// Existing violations are frozen in a ratchet baseline. A NEW violation fails,
// and a baseline entry that no longer occurs also fails so the baseline shrinks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const DEFAULT_CLASSES = path.join(repoRoot, 'security', 'aisec07_secret_classes.json');
export const DEFAULT_BASELINE = path.join(repoRoot, 'security', 'aisec07_secret_policy_baseline.json');

const SECRET_RE = /secrets\.([A-Za-z_][A-Za-z0-9_]*)/g;
const PRESENCE_RE = /secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:!=|==)\s*''/g;
const PR_EVENTS = ['pull_request', 'pull_request_target'];

// ---------------------------------------------------------------- YAML-ish scan
function indentOf(line) { return line.length - line.trimStart().length; }
function isStructural(line) { const t = line.trim(); return t !== '' && !t.startsWith('#'); }
const KEY_RE = /^(\s*)(?:-\s+)?(["']?)([A-Za-z0-9_.-]+)\2\s*:(?:\s+(.*))?$/;

function blockEnd(lines, start, parentIndent) {
  let i = start + 1;
  for (; i < lines.length; i++) if (isStructural(lines[i]) && indentOf(lines[i]) <= parentIndent) break;
  return i;
}
function childKeys(lines, start, end) {
  let childIndent = -1; const out = [];
  for (let i = start; i < end; i++) {
    if (!isStructural(lines[i])) continue;
    const ind = indentOf(lines[i]);
    if (childIndent < 0) childIndent = ind;
    if (ind !== childIndent || lines[i].trimStart().startsWith('- ')) continue;
    const m = lines[i].match(KEY_RE);
    if (m) out.push({key: m[3], line: i, value: (m[4] || '').trim(), indent: ind});
  }
  return out;
}
function scalarValue(lines, entry) {
  const v = entry.value.replace(/\s+#.*$/, '');
  if (v && !/^[>|][-+]?$/.test(v)) return v.replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
  const end = blockEnd(lines, entry.line, entry.indent);
  return lines.slice(entry.line + 1, end).map((l) => l.trim()).join(' ')
    .replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
}
function secretsIn(text) {
  const presence = new Set([...text.matchAll(PRESENCE_RE)].map((m) => m[1]));
  const all = [...text.matchAll(SECRET_RE)].map((m) => m[1]);
  const exposed = all.filter((n) => !presence.has(n) || countOf(text, n) > countPresence(text, n));
  return {all: new Set(all), exposed: new Set(exposed)};
}
function countOf(text, name) { return [...text.matchAll(new RegExp(`secrets\\.${name}\\b`, 'g'))].length; }
function countPresence(text, name) { return [...text.matchAll(new RegExp(`secrets\\.${name}\\s*(?:!=|==)\\s*''`, 'g'))].length; }

function parseTriggers(lines, entry) {
  const v = entry.value.replace(/\s+#.*$/, '');
  if (v) return v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  return childKeys(lines, entry.line + 1, blockEnd(lines, entry.line, entry.indent)).map((k) => k.key);
}

function runBlockLines(lines, start, end) {
  const out = new Set();
  for (let i = start; i < end; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run\s*:\s*(.*)$/);
    if (!m) continue;
    const ind = indentOf(lines[i]) + (lines[i].trimStart().startsWith('- ') ? 2 : 0);
    if (m[2] && !/^[>|][-+]?\s*$/.test(m[2])) { out.add(i); continue; }
    const e = Math.min(blockEnd(lines, i, ind), end);
    for (let j = i + 1; j < e; j++) out.add(j);
  }
  return out;
}

function parseSteps(lines, entry) {
  const end = blockEnd(lines, entry.line, entry.indent);
  const steps = []; let itemIndent = -1;
  for (let i = entry.line + 1; i < end; i++) {
    if (!isStructural(lines[i])) continue;
    const t = lines[i].trimStart();
    if (itemIndent < 0 && t.startsWith('- ')) itemIndent = indentOf(lines[i]);
    if (t.startsWith('- ') && indentOf(lines[i]) === itemIndent) steps.push({start: i});
  }
  steps.forEach((s, k) => { s.end = k + 1 < steps.length ? steps[k + 1].start : end; });
  return steps.map((s, idx) => {
    // Re-base the first "- key:" line so its key is seen as a sibling.
    const keys = [];
    for (let i = s.start; i < s.end; i++) {
      if (!isStructural(lines[i])) continue;
      const ind = indentOf(lines[i]) + (i === s.start ? 2 : 0);
      if (ind !== itemIndent + 2) continue;
      const m = lines[i].match(KEY_RE);
      if (m) keys.push({key: m[3], line: i, value: (m[4] || '').trim(), indent: itemIndent + 2});
    }
    const nameK = keys.find((k) => k.key === 'name');
    const ifK = keys.find((k) => k.key === 'if');
    return {
      index: idx, start: s.start, end: s.end,
      name: nameK ? scalarValue(lines, nameK).replace(/^['"]|['"]$/g, '') : `step ${idx + 1}`,
      if: ifK ? scalarValue(lines, ifK) : null,
      ifLines: ifK ? [ifK.line, blockEnd(lines, ifK.line, ifK.indent)] : null,
    };
  });
}

export function parseWorkflow(text, file = 'workflow.yml') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const top = childKeys(lines, 0, lines.length);
  const onK = top.find((k) => k.key === 'on' || k.key === 'true');
  const triggers = onK ? parseTriggers(lines, onK) : [];
  const envK = top.find((k) => k.key === 'env');
  const wfEnvText = envK ? lines.slice(envK.line, blockEnd(lines, envK.line, envK.indent)).join('\n') : '';
  const jobsK = top.find((k) => k.key === 'jobs');
  const jobs = [];
  if (jobsK) {
    const jEnd = blockEnd(lines, jobsK.line, jobsK.indent);
    for (const jk of childKeys(lines, jobsK.line + 1, jEnd)) {
      const end = blockEnd(lines, jk.line, jk.indent);
      const keys = childKeys(lines, jk.line + 1, end);
      const ifK = keys.find((k) => k.key === 'if');
      const envirK = keys.find((k) => k.key === 'environment');
      let environment = null;
      if (envirK) {
        const inline = envirK.value.replace(/\s+#.*$/, '');
        if (inline) environment = inline.replace(/^['"]|['"]$/g, '');
        else {
          const nk = childKeys(lines, envirK.line + 1, blockEnd(lines, envirK.line, envirK.indent)).find((k) => k.key === 'name');
          environment = nk ? scalarValue(lines, nk).replace(/^['"]|['"]$/g, '') : '(unnamed)';
        }
      }
      const needsK = keys.find((k) => k.key === 'needs');
      let needs = [];
      if (needsK) {
        const inline = needsK.value.replace(/\s+#.*$/, '');
        needs = inline ? inline.replace(/^\[|\]$/g, '').split(',') :
          lines.slice(needsK.line + 1, blockEnd(lines, needsK.line, needsK.indent)).map((l) => l.trim().replace(/^-\s*/, ''));
        needs = needs.map((n) => n.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      }
      const stepsK = keys.find((k) => k.key === 'steps');
      const steps = stepsK ? parseSteps(lines, stepsK) : [];
      const runLines = runBlockLines(lines, jk.line + 1, end);
      const refs = [];
      const jobIfRange = ifK ? [ifK.line, blockEnd(lines, ifK.line, ifK.indent)] : null;
      for (let i = jk.line + 1; i < end; i++) {
        if (!lines[i].includes('secrets.')) continue;
        if (lines[i].trim().startsWith('#')) continue;
        const step = steps.find((s) => i >= s.start && i < s.end) || null;
        const inIf = (jobIfRange && i >= jobIfRange[0] && i < jobIfRange[1]) ||
          (step && step.ifLines && i >= step.ifLines[0] && i < step.ifLines[1]);
        const {all, exposed} = secretsIn(lines[i]);
        for (const name of all) refs.push({
          secret: name, line: i + 1, step: step ? step.name : null,
          stepIf: step ? step.if : null,
          exposed: !inIf && exposed.has(name),
          inRun: runLines.has(i),
        });
      }
      for (const {all, exposed} of [secretsIn(wfEnvText)]) {
        for (const name of all) refs.push({secret: name, line: envK.line + 1, step: null, stepIf: null,
          exposed: exposed.has(name), inRun: false, workflowEnv: true});
      }
      jobs.push({id: jk.key, if: ifK ? scalarValue(lines, ifK) : null, needs, environment, refs});
    }
  }
  return {file, triggers, jobs};
}

// ------------------------------------------------- three-valued `if:` evaluator
// Evaluates a GitHub expression in a worst-case same-repository pull_request
// context. Returns true | false | undefined (unknown). Only a definite `false`
// proves that a pull_request run cannot reach the guarded secret.
const U = undefined;
function tokenize(s) {
  const toks = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") { let j = i + 1, v = ''; while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") { v += "'"; j += 2; continue; } if (s[j] === "'") break; v += s[j++]; } toks.push({t: 'str', v}); i = j + 1; continue; }
    const two = s.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '<=', '>='].includes(two)) { toks.push({t: 'op', v: two}); i += 2; continue; }
    if ('()!,<>'.includes(c)) { toks.push({t: 'op', v: c}); i++; continue; }
    const m = s.slice(i).match(/^[A-Za-z0-9_.\-*\[\]]+/);
    if (!m) return null;
    toks.push({t: 'id', v: m[0]}); i += m[0].length;
  }
  return toks;
}
const NULL = Symbol('null');
function lookup(id, ctx) {
  if (id === 'true') return true; if (id === 'false') return false; if (id === 'null') return NULL;
  if (/^-?\d+(\.\d+)?$/.test(id)) return Number(id);
  if (Object.hasOwn(ctx.known, id)) return ctx.known[id];
  for (const p of ctx.nullPrefixes) if (id === p || id.startsWith(p + '.')) return NULL;
  return U;
}
function eq(a, b) {
  if (a === U || b === U) return U;
  if (a === NULL || b === NULL) return a === b;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
function truthy(v) { if (v === U) return U; if (v === NULL) return false; return Boolean(v) && v !== 0 && v !== ''; }
function not(v) { const t = truthy(v); return t === U ? U : !t; }
function and(a, b) { const x = truthy(a), y = truthy(b); if (x === false || y === false) return false; if (x === U || y === U) return U; return true; }
function or(a, b) { const x = truthy(a), y = truthy(b); if (x === true || y === true) return true; if (x === U || y === U) return U; return false; }

export function evaluateIf(expr, ctx) {
  if (expr == null || String(expr).trim() === '') return true;
  const toks = tokenize(String(expr).replace(/^\$\{\{\s*|\s*\}\}$/g, ''));
  if (!toks) return U;
  let p = 0;
  const peek = () => toks[p]; const take = () => toks[p++];
  function primary() {
    const t = take(); if (!t) throw Error('eof');
    if (t.t === 'str') return t.v;
    if (t.t === 'op' && t.v === '(') { const v = orE(); if (take()?.v !== ')') throw Error(')'); return v; }
    if (t.t === 'op' && t.v === '!') return not(primary());
    if (t.t === 'id' && peek()?.v === '(') {
      take(); const args = [];
      if (peek()?.v !== ')') { args.push(orE()); while (peek()?.v === ',') { take(); args.push(orE()); } }
      if (take()?.v !== ')') throw Error('call');
      const fn = t.v.toLowerCase();
      if (fn === 'always' || fn === 'success') return true;
      if (fn === 'failure' || fn === 'cancelled') return U;
      if (fn === 'contains' || fn === 'startswith' || fn === 'endswith') {
        const [a, b] = args; if (a === U || b === U) return U; if (a === NULL) return false;
        const A = String(a).toLowerCase(), B = String(b === NULL ? '' : b).toLowerCase();
        return fn === 'contains' ? A.includes(B) : fn === 'startswith' ? A.startsWith(B) : A.endsWith(B);
      }
      return U;
    }
    if (t.t === 'id') return lookup(t.v, ctx);
    throw Error('token');
  }
  function cmp() {
    let l = primary();
    while (peek()?.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(peek().v)) {
      const op = take().v, r = primary();
      if (op === '==') l = eq(l, r); else if (op === '!=') { const e = eq(l, r); l = e === U ? U : !e; } else l = U;
    }
    return l;
  }
  function andE() { let l = cmp(); while (peek()?.v === '&&') { take(); l = and(l, cmp()); } return l; }
  function orE() { let l = andE(); while (peek()?.v === '||') { take(); l = or(l, andE()); } return l; }
  try { const v = orE(); if (p !== toks.length) return U; return truthy(v); } catch { return U; }
}

export function pullRequestContext(eventName = 'pull_request') {
  return {
    known: {
      'github.event_name': eventName,
      'github.ref': 'refs/pull/1/merge',
      'github.ref_name': '1/merge',
      'github.base_ref': 'main',
      'github.repository': 'owner/repo',
      // Worst case: a same-repository branch (an AI agent or maintainer branch).
      'github.event.pull_request.head.repo.full_name': 'owner/repo',
      'github.event.pull_request.head.repo.fork': false,
    },
    nullPrefixes: ['inputs', 'github.event.inputs', 'github.event.head_commit', 'github.event.workflow_run',
      'github.event.issue', 'github.event.comment', 'github.event.schedule'],
  };
}

// ------------------------------------------------------------------- analysis
export function loadClasses(file = DEFAULT_CLASSES) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw.schema !== 1 || typeof raw.secrets !== 'object') throw Error('AISEC07_CLASSES_INVALID');
  for (const [name, c] of Object.entries(raw.secrets)) {
    if (!['production', 'qa', 'provider', 'notification'].includes(c.family) || typeof c.write !== 'boolean' ||
        typeof c.backup_only !== 'boolean' || typeof c.purpose !== 'string' || !c.purpose)
      throw Error(`AISEC07_CLASS_INVALID:${name}`);
  }
  return raw.secrets;
}

// A job whose `needs` contains a job that is definitely skipped is itself
// skipped, unless its own `if:` calls a status function (always(), failure(),
// cancelled()). This mirrors GitHub Actions dependency semantics.
const STATUS_FN = /\b(always|failure|cancelled)\s*\(/;
export function jobReachability(jobs, ctx) {
  const byId = new Map(jobs.map((j) => [j.id, j])); const memo = new Map();
  const visit = (id, stack = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const j = byId.get(id); if (!j || stack.has(id)) return undefined;
    stack.add(id);
    const own = evaluateIf(j.if, ctx);
    let r = own;
    if (own !== false && !(j.if && STATUS_FN.test(j.if))) {
      for (const n of j.needs || []) { if (visit(n, stack) === false) { r = false; break; } }
    }
    stack.delete(id); memo.set(id, r); return r;
  };
  for (const j of jobs) visit(j.id);
  return memo;
}

export function analyzeWorkflows(workflows, classes) {
  const violations = []; const inventory = {};
  const push = (v) => violations.push(v);
  const backupUse = new Map(); const otherUse = new Map();
  for (const wf of workflows) {
    const prEvents = wf.triggers.filter((t) => PR_EVENTS.includes(t));
    const reachByEvent = Object.fromEntries(prEvents.map((ev) => [ev, jobReachability(wf.jobs, pullRequestContext(ev))]));
    for (const job of wf.jobs) {
      const secretsInJob = new Map();
      for (const r of job.refs) {
        const cls = classes[r.secret];
        const inv = (inventory[r.secret] ||= {secret: r.secret, family: cls?.family || 'UNCLASSIFIED', write: cls?.write ?? null, uses: []});
        inv.uses.push({workflow: wf.file, job: job.id, environment: job.environment, step: r.step, exposed: r.exposed});
        if (!cls) { push({rule: 'UNCLASSIFIED_SECRET', workflow: wf.file, job: job.id, secret: r.secret}); continue; }
        if (r.inRun) push({rule: 'SECRET_IN_RUN_SCRIPT', workflow: wf.file, job: job.id, secret: r.secret});
        if (!r.exposed) continue;
        secretsInJob.set(r.secret, cls);
        const isBackupEnv = job.environment && /backup/i.test(job.environment);
        const bucket = isBackupEnv ? backupUse : otherUse;
        if (!bucket.has(r.secret)) bucket.set(r.secret, new Set());
        bucket.get(r.secret).add(`${wf.file}#${job.id}`);
        if (cls.write) {
          for (const ev of prEvents) {
            const ctx = pullRequestContext(ev);
            const reach = and(reachByEvent[ev].get(job.id), evaluateIf(r.stepIf, ctx));
            if (reach !== false) push({rule: 'PR_REACHABLE_WRITE_SECRET', workflow: wf.file, job: job.id, secret: r.secret, event: ev});
          }
        }
        if (cls.write && cls.family === 'production' && !job.environment)
          push({rule: 'UNGATED_PRODUCTION_WRITE', workflow: wf.file, job: job.id, secret: r.secret});
      }
      const fams = new Set([...secretsInJob.values()].filter((c) => c.write).map((c) => c.family));
      if (fams.has('production') && fams.has('qa'))
        push({rule: 'CREDENTIAL_FAMILY_MIX', workflow: wf.file, job: job.id, secret: '*'});
    }
  }
  for (const [secret, jobs] of backupUse) {
    if (otherUse.has(secret)) push({rule: 'BACKUP_CREDENTIAL_SHARED', workflow: '*', job: '*', secret,
      backup_jobs: [...jobs].sort(), other_jobs: [...otherUse.get(secret)].sort()});
  }
  for (const [secret, cls] of Object.entries(classes)) {
    if (cls.backup_only && otherUse.has(secret))
      push({rule: 'BACKUP_CREDENTIAL_SHARED', workflow: '*', job: '*', secret, other_jobs: [...otherUse.get(secret)].sort()});
  }
  return {violations: dedupe(violations), inventory};
}

export function violationKey(v) { return [v.rule, v.workflow, v.job, v.secret, v.event || ''].join('|'); }
function dedupe(list) {
  const seen = new Map(); for (const v of list) if (!seen.has(violationKey(v))) seen.set(violationKey(v), v);
  return [...seen.values()].sort((a, b) => violationKey(a).localeCompare(violationKey(b)));
}

export function compareBaseline(violations, baseline) {
  if (baseline.schema !== 1 || !Array.isArray(baseline.accepted_risks)) throw Error('AISEC07_BASELINE_INVALID');
  const NON_BASELINABLE = new Set(['UNCLASSIFIED_SECRET', 'SECRET_IN_RUN_SCRIPT', 'PR_REACHABLE_WRITE_SECRET']);
  const base = new Map();
  for (const e of baseline.accepted_risks) {
    if (NON_BASELINABLE.has(e.rule)) throw Error(`AISEC07_BASELINE_FORBIDDEN_RULE:${e.rule}`);
    if (typeof e.reason !== 'string' || e.reason.length < 10) throw Error(`AISEC07_BASELINE_REASON_REQUIRED:${violationKey(e)}`);
    base.set(violationKey(e), e);
  }
  const current = new Set(violations.map(violationKey));
  const fresh = violations.filter((v) => !base.has(violationKey(v)));
  const stale = [...base.values()].filter((e) => !current.has(violationKey(e)));
  return {fresh, stale, accepted: violations.length - fresh.length};
}

export function scanRepository({root = repoRoot, classesFile = DEFAULT_CLASSES} = {}) {
  const dir = path.join(root, '.github', 'workflows');
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  const workflows = files.map((f) => parseWorkflow(fs.readFileSync(path.join(dir, f), 'utf8'), f));
  return {workflows, ...analyzeWorkflows(workflows, loadClasses(classesFile))};
}

function main(argv) {
  const mode = argv[0] || '--check';
  const {workflows, violations, inventory} = scanRepository();
  if (mode === '--inventory') {
    const rows = Object.values(inventory).sort((a, b) => a.secret.localeCompare(b.secret)).map((r) => ({
      secret: r.secret, family: r.family, write: r.write,
      workflows: [...new Set(r.uses.map((u) => u.workflow))].length,
      jobs: [...new Set(r.uses.filter((u) => u.exposed).map((u) => `${u.workflow}#${u.job}`))].length,
      environment_gated_jobs: [...new Set(r.uses.filter((u) => u.exposed && u.environment).map((u) => `${u.workflow}#${u.job}`))].length,
    }));
    console.log(JSON.stringify({schema: 1, values_read: false, workflows_scanned: workflows.length, secrets: rows}, null, 2));
    return 0;
  }
  if (mode === '--violations') { console.log(JSON.stringify(violations, null, 2)); return 0; }
  const baseline = JSON.parse(fs.readFileSync(DEFAULT_BASELINE, 'utf8'));
  const {fresh, stale, accepted} = compareBaseline(violations, baseline);
  const summary = {schema: 1, values_read: false, workflows_scanned: workflows.length,
    secrets_seen: Object.keys(inventory).length, accepted_baseline: accepted,
    new_violations: fresh.length, stale_baseline: stale.length,
    settings_evidence: 'CANNOT_VERIFY (environment reviewers / environment-scoped secret shadowing are GitHub settings)'};
  console.log(JSON.stringify(summary));
  for (const v of fresh) console.error(`AISEC07_NEW_VIOLATION ${violationKey(v)}`);
  for (const v of stale) console.error(`AISEC07_STALE_BASELINE ${violationKey(v)} (remove it: the risk no longer occurs)`);
  return fresh.length || stale.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
