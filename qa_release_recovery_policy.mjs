import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {MAX_ATTEMPTS,decideRecovery,isStaticOnlyRelease}=require('./scripts/release_recovery_policy.cjs');
const sha='a'.repeat(40),other='b'.repeat(40);
const job=(name,conclusion,step,stepConclusion='failure')=>({name,conclusion,steps:step?[{name:step,conclusion:stepConclusion}]:[]});
const base={sha,mainSha:sha,attempt:1,conclusion:'failure',jobs:[
  job('P0 deployment gate','success'),job('Build Pages artifact','success'),
  job('Deploy GitHub Pages','failure','Deploy only after P0 gate passed')
]};
assert.equal(MAX_ATTEMPTS,5);
assert.equal(decideRecovery(base).action,'retry');
assert.equal(decideRecovery({...base,attempt:4}).action,'retry');
assert.equal(decideRecovery({...base,attempt:5}).action,'terminal');
assert.equal(decideRecovery({...base,mainSha:other}).action,'terminal');
assert.equal(decideRecovery({...base,jobs:[job('P0 deployment gate','failure'),job('Build Pages artifact','skipped'),job('Deploy GitHub Pages','skipped')]}).action,'terminal');
assert.equal(decideRecovery({...base,jobs:[job('P0 deployment gate','success'),job('Build Pages artifact','failure'),job('Deploy GitHub Pages','skipped')]}).action,'retry');
assert.equal(decideRecovery({...base,jobs:[job('P0 deployment gate','success'),job('Build Pages artifact','success'),job('Deploy GitHub Pages','failure','Confirm immediate Sheet refresh after Pages deployment')]}).action,'terminal');
assert.equal(decideRecovery({...base,jobs:[job('P0 deployment gate','success'),job('Build Pages artifact','success'),job('Deploy GitHub Pages','failure','Exercise actual published mobile and desktop routes')]}).action,'rollback_candidate');
// Mock the actual GitHub job/step conclusions without changing or failing
// production. Successful publication followed by a bad public asset/health
// must go through a guarded rollback, not an upload rerun or false success.
const verifierName='Same-run Pages validation (final alert only after independent verification)';
const afterPublish=(step)=>({...base,jobs:[
  job('P0 deployment gate','success'),
  job('Build Pages artifact','success'),
  job('Deploy GitHub Pages','success'),
  job(verifierName,'failure',step)
]});
assert.equal(decideRecovery(afterPublish('Compare changed public files against actual published bytes')).action,'rollback_candidate');
assert.equal(decideRecovery(afterPublish('Double-check live Pages version and guarded payroll endpoint')).action,'rollback_candidate');
assert.equal(decideRecovery(afterPublish('Resolve merged request changes for live verification')).action,'terminal',
  'Unknown post-publish failure is not a confirmed frontend regression');
assert.equal(decideRecovery({...afterPublish('Compare changed public files against actual published bytes'),mainSha:other}).action,'terminal',
  'Newer main must block stale rollback');
assert.equal(decideRecovery({...afterPublish('Compare changed public files against actual published bytes'),jobs:[
  job('P0 deployment gate','failure'),
  job('Build Pages artifact','success'),
  job('Deploy GitHub Pages','success'),
  job(verifierName,'failure','Compare changed public files against actual published bytes')
]}).action,'terminal','A failing release QA gate must never authorize recovery');
assert.equal(decideRecovery({...base,conclusion:'success'}).action,'none');
assert.equal(decideRecovery({...base,attempt:0}).action,'terminal');
assert.equal(isStaticOnlyRelease(['index.html','qa_foo.mjs']),true);
assert.equal(isStaticOnlyRelease(['.github/workflows/p0-pages-deploy.yml']),false);
assert.equal(isStaticOnlyRelease(['index.html','supabase/migrations/any.sql']),false);
assert.equal(isStaticOnlyRelease(['index.html','supabase/functions/edge.ts']),false);
assert.equal(isStaticOnlyRelease(['index.html','nested/unknown.js']),false);
assert.equal(isStaticOnlyRelease([]),false);
assert.equal(isStaticOnlyRelease(new Array(300).fill('index.html')),false);
console.log('PASS fail-closed recovery policy (retry limits, QA/data guards, rollback eligibility)');
