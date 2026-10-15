import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/autonomous-development-agent.yml','utf8');
const runner=fs.readFileSync('scripts/autonomous_dev_agent.sh','utf8');
const step=workflow.split('          script: |\n').at(-1);
assert.ok(step&&step.includes('const bridgeMarker='),'Missing bridge-aware failure receipt');
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
  await handle(github,{runId:42,repo:{owner:'koith',repo:'attendance-proto'}},{env:{ISSUE_NUMBER:'802'}});
  return posted;
}
let posted=await simulate();
assert.equal(posted.length,1);
assert.equal(posted[0].issue_number,802);
assert.match(posted[0].body,/\[agent-run:42\]/);
assert.match(posted[0].body,/AI 자동 개발 또는 QA 절차가 완료되지/);
assert.ok(posted[0].body.includes('\n'),'Readable issue receipt needs real newlines');
assert.ok(!posted[0].body.includes('\\n'),'Must not publish literal backslash-n sequences');
posted=await simulate([trusted('[agent-pr-bridge:42]\n브랜치 푸시 완료')]);
assert.equal(posted.length,1);
assert.match(posted[0].body,/기능별 QA·브랜치 푸시까지 통과/);
assert.match(posted[0].body,/PR 생성·전체 CI·병합·운영 배포는 아직 완료되지/);
assert.doesNotMatch(posted[0].body,/AI 자동 개발 또는 QA 절차가 완료되지/);
posted=await simulate([untrusted('[agent-pr-bridge:42]')]);
assert.match(posted[0].body,/AI 자동 개발 또는 QA 절차가 완료되지/,'Forged marker cannot certify QA');
posted=await simulate([trusted('prefix [agent-pr-bridge:42] suffix')]);
assert.match(posted[0].body,/AI 자동 개발 또는 QA 절차가 완료되지/,'Embedded text cannot spoof receipt');
posted=await simulate([trusted('[agent-run:42]')]);
assert.equal(posted.length,0,'Already reported same run must be idempotent');
posted=await simulate([untrusted('[agent-run:42]')]);
assert.equal(posted.length,1,'Untrusted dedup comments cannot silence receipts');
posted=await simulate([trusted('[agent-pr-bridge:999]')]);
assert.match(posted[0].body,/AI 자동 개발 또는 QA 절차가 완료되지/,'Different run cannot be mistaken for this handoff');
assert.match(runner,/bridge_body="\$\(printf '%s\\n'/,'Bridge must post correctly separated lines');
assert.match(runner,/if ! gh issue comment "\$ISSUE_NUMBER" --body "\$bridge_body"; then/,'Failed issue receipt must be surfaced');
assert.doesNotMatch(runner,/gh issue comment[^\n]*\|\| true/,'A failed bridge marker must never be swallowed');
assert.match(workflow,/github\.event\.label\.name == 'agent-approved'/,'Agent requests must remain explicitly approved');
console.log('PASS autonomous bridge outcome classification, trusted marker, dedup and failure-propagation QA');
