import assert from 'node:assert/strict';
import fs from 'node:fs';

// The previous agent-pr-bridge Issue marker was retired. Development now
// produces a patch, independent secretless QA accepts it, the separate WRITE
// publisher opens a review PR, and the fail-closed reporter records failures.
const workflow=fs.readFileSync('.github/workflows/autonomous-development-agent.yml','utf8');
const runner=fs.readFileSync('scripts/autonomous_dev_agent.sh','utf8');
const secretlessQa=fs.readFileSync('scripts/security/run_secretless_agent_qa.sh','utf8');

const section=(name,next)=>{
 const start=workflow.indexOf('  '+name+':\n');
 assert.ok(start>=0,'Missing '+name+' job');
 const end=next?workflow.indexOf('  '+next+':\n',start+1):-1;
 return workflow.slice(start,end>=0?end:undefined);
};
const develop=section('develop','qa');
const qa=section('qa','publish');
const publish=section('publish','report-failure');
const failure=section('report-failure');

assert.match(workflow,/github\.event\.label\.name == 'agent-approved'/,
 'Unapproved Issue label must not trigger generated patch publication');
assert.match(develop,/copilot-requests: write/);
assert.match(develop,/persist-credentials: false/);
assert.match(develop,/name: agent-validated-patch/);
assert.doesNotMatch(runner,/gh auth setup-git|gh pr create|git push -u origin/,
 'Model/development shell must not be able to push or create PRs');

assert.match(qa,/needs: develop/);
assert.match(qa,/if: needs\.develop\.result == 'success'/);
assert.match(qa,/bash scripts\/security\/run_secretless_agent_qa\.sh/);
assert.match(qa,/name: agent-qa-passed-patch/);
assert.match(secretlessQa,/QA_SECRET_PRESENT:/,
 'Independent QA rejects provider and GitHub WRITE credentials');

assert.match(publish,/needs: qa/);
assert.match(publish,/if: needs\.qa\.result == 'success'/,
 'Publishing must not run when QA fails or is skipped');
assert.match(publish,/contents: write/);
assert.match(publish,/pull-requests: write/);
assert.match(publish,/node scripts\/security\/validate_agent_publish_patch\.mjs/);
assert.match(publish,/gh auth setup-git[\s\S]*git push -u origin "\$branch"/);
assert.match(publish,/gh pr create --base main --head "\$branch"/);
assert.match(publish,/Requires human review, CI and separate release approval/,
 'PR publication must never claim operating deployment success');
assert.doesNotMatch(publish,/gh pr merge|gh workflow run .*deploy/,
 'Publisher must not merge or deploy');

const needed=['capture-intake','develop','qa','publish'];
function failureEscalation(job){
 const header=job.match(/^    if:\s*(.*)$/m)?.[1]||'';
 return /^always\(\)\s*&&\s*\(/.test(header) &&
  needed.every(x=>header.includes("needs."+x+".result == 'failure'"));
}
assert.ok(failureEscalation(failure),
 'Failure report must run for all four failed stages, including skipped upstream jobs');
assert.match(failure,/needs: \[capture-intake, develop, qa, publish\]/);
assert.ok(!failureEscalation(failure.replace("needs.qa.result == 'failure'",'false')),
 'Mutation proof: omission of QA failure must be rejected');
assert.ok(!failureEscalation(failure.replace('if: always() &&','if:')),
 'Mutation proof: report must run even when a dependency failed');

const source=failure.split('          script: |\n')[1];
assert.ok(source,'Missing dedicated Issue failure reporter');
const script=source.split('\n').map(line=>line.startsWith('            ')?line.slice(12):line).join('\n');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handle=new AsyncFunction('github','context','process',script);
async function simulate(resultValues,issue='802'){
 const posted=[];
 const github={rest:{issues:{createComment:async value=>{posted.push(value);return {id:1}}}}};
 const env={ISSUE_NUMBER:issue,CAPTURE_RESULT:'success',DEVELOP_RESULT:'success',
  QA_RESULT:'failure',PUBLISH_RESULT:'skipped',...resultValues};
 await handle(github,{runId:42,repo:{owner:'koith',repo:'attendance-proto'}},{env});
 return posted;
}
const posted=await simulate({});
assert.equal(posted.length,1);
assert.equal(posted[0].issue_number,802);
assert.match(posted[0].body,/\[agent-run:42\]/);
assert.match(posted[0].body,/AI 자동 개발 또는 승인\/PR 게시가 미완료입니다/);
for(const label of ['capture=success','develop=success','qa=failure','publish=skipped'])
 assert.ok(posted[0].body.includes(label),'Missing result evidence: '+label);
assert.ok(posted[0].body.includes('\n'),'Receipt must contain real line breaks');
assert.ok(!posted[0].body.includes('\\n'),'Receipt must not contain literal slash-n');
assert.doesNotMatch(posted[0].body,/실서비스 배포 성공|PAGES_VERIFIED_SUCCESS/,
 'Failure receipt must never claim a production release');
const second=await simulate({CAPTURE_RESULT:'failure',DEVELOP_RESULT:'skipped',QA_RESULT:'skipped'});
assert.match(second[0].body,/capture=failure/,'Capture rejection cannot be disguised as completed');
await assert.rejects(simulate({},'INVALID'),/INVALID_ISSUE_NUMBER/,
 'Reporter refuses malformed Issue identifiers');
console.log('PASS autonomous agent separated QA/publisher and fail-closed Issue reporting');
