import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=p=>fs.readFileSync(p,'utf8');
const deploy=read('.github/workflows/p0-pages-deploy.yml');
const verifier=read('.github/workflows/verified-pages-deployment-notification.yml');
const parity=read('qa_release_changed_assets_live.mjs');

// Environment files written by GitHub Actions are NOT visible in the same shell step.
assert.match(deploy,
  /CHANGED_RELEASE_FILES="\$\(cat \/tmp\/release-request-files\.json\)" node qa_release_changed_assets_live\.mjs/,
  'Same-run Pages acceptance must pass the selected files to the actual SHA256 process');
assert.match(verifier,
  /CHANGED_RELEASE_FILES="\$\(cat \/tmp\/changed-release-files\.json\)" node qa_release_changed_assets_live\.mjs/,
  'Independent verification must pass its request files to the actual SHA256 process');
for(const [name,text] of [['Pages',deploy],['independent',verifier]]){
  assert.doesNotMatch(text,/echo "CHANGED_RELEASE_FILES=.*>> "\$GITHUB_ENV"/,
    name+' must not silently defer changed files to the next step');
}
assert.match(parity,/files\.length>0/,
  'Missing and empty release request file selection must fail closed');
assert.match(parity,/assert\.equal\(actual,expected/,
  'Each selected asset must still compare actual and expected SHA256 digests');

// These invalid inputs must fail before ANY live HTTP request.
for(const [name,raw] of [
  ['missing',undefined],['empty',''],['empty list','[]'],
  ['invalid object','{}'],['null','null'],['mixed paths','["index.html",3]'],
  ['invalid JSON','[']
]){
  const env={...process.env,DEPLOY_SHA:'a'.repeat(40)};
  if(raw===undefined)delete env.CHANGED_RELEASE_FILES;
  else env.CHANGED_RELEASE_FILES=raw;
  const result=spawnSync(process.execPath,['qa_release_changed_assets_live.mjs'],
    {encoding:'utf8',env,timeout:5000});
  assert.notEqual(result.status,0,'Invalid '+name+' selection cannot pass QA');
  assert.ok((result.stderr||'').length>0,'Invalid '+name+' selection should explain failure');
}
console.log('PASS release assets fail closed for absent/empty/invalid lists; both Actions use same-step file selection');
