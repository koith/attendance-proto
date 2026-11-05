import assert from 'node:assert/strict';
import fs from 'node:fs';

// Historical name retained because release CI invokes this contract. The prior
// agent-pr-bridge comment has been replaced by separate agent / QA / publisher
// jobs. The final report-failure job must remain idempotent on Actions re-runs,
// including attempts to spoof markers through ordinary issue comments.
const workflow=fs.readFileSync('.github/workflows/autonomous-development-agent.yml','utf8');
const runner=fs.readFileSync('scripts/autonomous_dev_agent.sh','utf8');
const failureJob=workflow.split('\n  report-failure:\n')[1]||'';
assert.match(failureJob,/needs: \[capture-intake, develop, qa, publish\]/,
  'Failure report covers all four independent stages');
assert.match(failureJob,/if: always\(\) && \(needs\.capture-intake\.result == 'failure'/,
  'Report only when an upstream job failed, including skipped dependent jobs');
assert.match(failureJob,/permissions:\s*\n\s*issues: write\s*\n\s*contents: read/,
  'Failure receipt can comment, not push or deploy');
assert.doesNotMatch(failureJob,/contents: write|pull-requests: write/,
  'Failure reporter must not receive code-write privileges');
const step=failureJob.split('          script: |\n')[1]||'';
assert.ok(step.includes("const marker='[agent-run:'"),'Missing run-scoped failure receipt');
assert.match(step,/github\.paginate\(github\.rest\.issues\.listComments/,
  'Re-run must check existing trusted receipt before commenting');
const script=step.split('\n').map(line=>line.startsWith('            ')?line.slice(12):line).join('\n');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handle=new AsyncFunction('github','context','process',script);
const trusted=body=>({user:{login:'github-actions[bot]'},body});
const untrusted=body=>({user:{login:'untrusted-author'},body});
async function simulate(comments=[]){
  const posted=[];
  const github={
    paginate:async()=>comments,
    rest:{issues:{
      listComments:()=>null,
      createComment:async payload=>{posted.push(payload);return {id:1};}
    }}
  };
  const context={runId:42,repo:{owner:'koith',repo:'attendance-proto'}};
  const env={
    ISSUE_NUMBER:'802',
    CAPTURE_RESULT:'success',
    DEVELOP_RESULT:'failure',
    QA_RESULT:'skipped',
    PUBLISH_RESULT:'skipped'
  };
  await handle(github,context,{env});
  return posted;
}
let posted=await simulate();
assert.equal(posted.length,1,'Failure posts exactly one receipt');
assert.equal(posted[0].issue_number,802);
assert.match(posted[0].body,/^\[agent-run:42\]\n/);
assert.match(posted[0].body,/AI 자동 개발 또는 승인\/PR 게시가 미완료/);
assert.match(posted[0].body,/서비스 배포 성공을 의미하지 않습니다/);
for(const status of ['capture=success','develop=failure','qa=skipped','publish=skipped'])
  assert.ok(posted[0].body.includes(status),'Missing actual upstream state: '+status);
assert.ok(posted[0].body.includes('\n'),'Readable receipt needs actual newlines');
assert.ok(!posted[0].body.includes('\\n'),'Do not publish literal backslash-n sequences');

// The github-actions author is provided by the GitHub API, never by comment text.
// Only an exact same-run marker at the beginning of a trusted bot comment dedups.
posted=await simulate([trusted('[agent-run:42]\nExisting final receipt')]);
assert.equal(posted.length,0,'Trusted identical run must be idempotent');
posted=await simulate([trusted('[agent-run:42]')]);
assert.equal(posted.length,0,'Exact marker-only previous receipt is sufficient');
posted=await simulate([untrusted('[agent-run:42]\nFake bot text')]);
assert.equal(posted.length,1,'Untrusted duplicate marker cannot silence failure');
posted=await simulate([trusted('prefix [agent-run:42] suffix')]);
assert.equal(posted.length,1,'Embedded same-run marker cannot spoof an existing receipt');
posted=await simulate([trusted('[agent-run:420]\nDifferent run')]);
assert.equal(posted.length,1,'Different run number is not the same receipt');
posted=await simulate([trusted('[agent-run:42]suffix')]);
assert.equal(posted.length,1,'Marker prefix without newline is not accepted');
assert.doesNotMatch(runner,/gh auth setup-git|git push -u origin|gh pr create/,
  'Untrusted coding agent cannot directly publish or mint PRs');
assert.match(workflow,/github\.event\.label\.name == 'agent-approved'/,
  'Only an explicitly approved task can be attempted');
assert.match(workflow,/name: agent-qa-passed-patch/,
  'Independent no-secret QA artifact remains the only publisher input');
console.log('PASS split agent reporter: strict failure-only status, trusted dedup, spoof rejection, no credentials');
