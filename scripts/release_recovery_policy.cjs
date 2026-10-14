'use strict';
// Pure fail-closed policy for release retries. Never mutate operational data.
const MAX_ATTEMPTS = 5;
const name = (jobs, value) => jobs.find(j => j.name === value);
const failedAt = (job, stepName) => !!job && (job.steps || []).some(
  s => s.name === stepName && s.conclusion === 'failure');
function decideRecovery({conclusion, sha, mainSha, attempt, jobs, maxAttempts=MAX_ATTEMPTS}) {
  if (conclusion !== 'failure') return {action:'none',reason:'Not a failed release'};
  if (!/^[a-f0-9]{40}$/.test(sha||'') || sha !== mainSha)
    return {action:'terminal',reason:'Release commit is not current main; never redeploy stale SHA'};
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isInteger(maxAttempts) || maxAttempts < 1)
    return {action:'terminal',reason:'Invalid attempt information'};
  const gate=name(jobs,'P0 deployment gate');
  const build=name(jobs,'Build Pages artifact');
  const deploy=name(jobs,'Deploy GitHub Pages');
  if (gate?.conclusion !== 'success') return {action:'terminal',reason:'Predeploy QA failed; cannot retry deployment'};
  let safeRetry=false;
  if (build?.conclusion === 'failure' && deploy?.conclusion === 'skipped')
    safeRetry=true; // Pages was not published; safe to rebuild the artifact.
  if (build?.conclusion === 'success' && deploy?.conclusion === 'failure' &&
      failedAt(deploy,'Deploy only after P0 gate passed') &&
      !((deploy.steps||[]).some(s=>s.name==='Confirm immediate Sheet refresh after Pages deployment' && s.conclusion==='success')))
    safeRetry=true; // Failed at Pages publication step, before side effects.
  if (safeRetry) return attempt < maxAttempts
    ? {action:'retry',reason:'Retryable artifact/upload failure before operational writes'}
    : {action:'terminal',reason:'Deployment attempts exhausted: '+attempt+'/'+maxAttempts};
  // The Pages publish job can succeed while the independent same-run
  // read-only acceptance job detects incorrect public bytes/health.
  // This is a deployed frontend regression, not a retryable upload fault.
  const verifier=name(jobs,'Same-run Pages validation (final alert only after independent verification)');
  if (build?.conclusion==='success' && deploy?.conclusion==='success' &&
      verifier?.conclusion==='failure' &&
      ['Compare changed public files against actual published bytes',
       'Double-check live Pages version and guarded payroll endpoint'].some(n=>failedAt(verifier,n)))
    return {action:'rollback_candidate',reason:'Post-publish Pages bytes or health did not match tested release'};
  if (build?.conclusion==='success' && deploy?.conclusion==='failure' &&
      ['Validate live public deployment and payroll access boundary',
       'Exercise actual published mobile and desktop routes',
       'Verify public Pages recipe asset contains no manufacturing instructions'].some(n=>failedAt(deploy,n)))
    return {action:'rollback_candidate',reason:'Published frontend failed production acceptance'};
  return {action:'terminal',reason:'Deterministic QA, data sync, permissions, or unknown failure; unsafe to retry'};
}
// Independent verification can fail *after* Pages reports success.
// Only objective live-byte, protected HTTP or browser acceptance failures
// qualify; a setup/config failure must not automatically roll back.
function decideIndependentRecovery({pagesConclusion,verifierConclusion,sha,mainSha,failedSteps}) {
  if (!/^[a-f0-9]{40}$/.test(sha||'') || mainSha!==sha)
    return {action:'terminal',reason:'Superseded or invalid release SHA'};
  if (pagesConclusion!=='success' || verifierConclusion!=='failure')
    return {action:'terminal',reason:'No confirmed post-publish verifier failure'};
  const proven=[
    'Verify every changed public asset against live Pages bytes',
    'Validate actual Pages response, displayed version and protected API',
    'Check actual published mobile and desktop pages'
  ];
  if (!Array.isArray(failedSteps)||!failedSteps.some(step=>proven.includes(step)))
    return {action:'terminal',reason:'No proven live acceptance failure'};
  return {action:'rollback_candidate',reason:'Published release failed independent live acceptance'};
}
function isStaticOnlyRelease(files) {
  if (!Array.isArray(files) || !files.length || files.length>=300) return false;
  const publicAsset=/^[a-zA-Z0-9_-]+\.(?:html|js|css)$/;
  const harmless=/^(?:qa_[a-zA-Z0-9_-]+\.mjs|scripts\/[a-zA-Z0-9_/-]+\.(?:cjs|mjs|sh)|\.github\/workflows\/[a-zA-Z0-9_-]+\.yml|[A-Za-z0-9_-]+\.md)$/;
  return files.some(f=>publicAsset.test(f)) && files.every(f=>publicAsset.test(f)||harmless.test(f));
}
module.exports={MAX_ATTEMPTS,decideRecovery,decideIndependentRecovery,isStaticOnlyRelease};
