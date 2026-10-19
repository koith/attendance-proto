import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const wrapper=path.resolve('tools/deploy_apps_script_with_retry.sh');
assert.match(fs.readFileSync(wrapper,'utf8'),/updateContent failed/);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-gas-retry-'));
try {
  fs.writeFileSync(path.join(root,'sleep'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  function scenario(name,failure,failures,expected,success){
    const state=path.join(root,name+'.state'),mock=path.join(root,name+'.sh');
    fs.writeFileSync(mock,[
      '#!/bin/sh',
      'n=$(cat "$1" 2>/dev/null || echo 0)',
      'n=$((n+1))',
      'echo "$n" > "$1"',
      'if [ "$n" -le '+failures+' ]; then',
      "  echo '"+failure+"' >&2",
      '  exit 1',
      'fi',
      'echo "deployment succeeded"',
      'exit 0'
    ].join('\n')+'\n',{mode:0o755});
    const res=spawnSync('bash',[wrapper,mock,state],{
      cwd:process.cwd(),env:{...process.env,PATH:root+':'+process.env.PATH},encoding:'utf8'
    });
    assert.equal(res.status,success?0:1,name+': '+res.stderr);
    assert.equal(Number(fs.readFileSync(state,'utf8')),expected,name+' attempts');
    if(success)assert.match(res.stdout,/deployment succeeded/);
  }
  scenario('transient-503','Error: updateContent failed 503 service unavailable',2,3,true);
  scenario('transient-429','Error: updateContent failed 429 quota',1,2,true);
  scenario('bad-auth','Error: updateContent failed 401 forbidden',1,1,false);
  scenario('bad-source','Error: updateContent failed 400 invalid input',1,1,false);
  scenario('unsafe-post','Error: createVersion failed 503 unavailable',1,1,false);
  scenario('unsafe-update','Error: updateDeployment failed 503 unavailable',1,1,false);
  scenario('permanent-503','Error: updateContent failed 503 service unavailable',5,3,false);
  console.log('PASS Apps Script deploy 429/503 retry and cap; auth and non-idempotent deployment failures never retried');
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
