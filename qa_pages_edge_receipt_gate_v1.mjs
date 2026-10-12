import assert from 'node:assert/strict';
import fs from 'node:fs';

const yaml=fs.readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
const start='      - name: Require matching production Edge deployment receipt for changed Edge source';
const finish='      - name: Verify production Edge receipt gate behavior';
const section=yaml.slice(yaml.indexOf(start),yaml.indexOf(finish));
assert.ok(section.startsWith(start),'production Edge Pages guard must exist before its unit tests');
assert.ok(yaml.indexOf(finish)<yaml.indexOf('      - name: boot-syntax-regression'),'gate unit tests must run before boot gate');
assert.match(section,/if: github\.event_name == 'push'/);
assert.match(section,/compareCommits/,'commit delta must be checked');
assert.match(section,/server-sync-sheet\//,'canonical Edge source must trigger gate');
assert.match(section,/edge\/server-sync-sheet-deploy/,'matching runtime receipt required');
assert.match(section,/getCombinedStatusForRef/,'use GitHub commit status, not unrelated old deployment');
const marker='          script: |\n';
assert.ok(section.includes(marker),'inline GitHub script must be present');
const script=section.slice(section.indexOf(marker)+marker.length)
  .split('\n').filter(Boolean).map(line=>line.startsWith('            ')?line.slice(12):line).join('\n');
const invoke=new Function('github','context','core','return (async()=>{\n'+script+'\n})()');
const make=(files,statuses=[])=>{
  let statusReads=0;
  const github={rest:{repos:{
    async compareCommits(){return {data:{files:files.map(filename=>({filename}))}};},
    async getCombinedStatusForRef(){statusReads++;return {data:{statuses}};}
  }}};
  const context={repo:{owner:'test-owner',repo:'test-repo'},sha:'b'.repeat(40),payload:{before:'a'.repeat(40)}};
  const core={info:()=>{}};
  return {github,context,core,reads:()=>statusReads};
};
const frontend=make(['index.html'],[{context:'edge/server-sync-sheet-deploy',state:'failure'}]);
await invoke(frontend.github,frontend.context,frontend.core);
assert.equal(frontend.reads(),0,'frontend-only release cannot be blocked by an unrelated Edge failure');
const success=make(['supabase/functions/server-sync-sheet/index.ts'],[{context:'edge/server-sync-sheet-deploy',state:'success',target_url:'https://github.test/job'}]);
await invoke(success.github,success.context,success.core);
assert.equal(success.reads(),1,'canonical server-source changes must await their own deployment receipt');
const failed=make(['supabase/functions/server-sync-sheet/index.ts'],[{context:'edge/server-sync-sheet-deploy',state:'failure'}]);
await assert.rejects(invoke(failed.github,failed.context,failed.core),/Pages release blocked/);
const errored=make(['supabase/functions/server-sync-sheet/engine.mjs'],[{context:'edge/server-sync-sheet-deploy',state:'error'}]);
await assert.rejects(invoke(errored.github,errored.context,errored.core),/Pages release blocked/);
const missingBefore=make(['index.html']);missingBefore.context.payload.before='';
await assert.rejects(invoke(missingBefore.github,missingBefore.context,missingBefore.core),/push.before missing/);
const truncated=make(Array.from({length:300},(_,i)=>'file'+i));
await assert.rejects(invoke(truncated.github,truncated.context,truncated.core),/diff truncated/);
console.log('PASS deploy receipt gate: frontend-only, matching success, failure, error, missing base, truncated diff');
