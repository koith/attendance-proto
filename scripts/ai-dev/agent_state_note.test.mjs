import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputForAgent} from './agent_state_note.mjs';
const env={GITHUB_REPOSITORY:'koith/attendance-proto',GITHUB_TOKEN:'fixture',GITHUB_RUN_ID:'123',
 ISSUE_NUMBER:'1055',CAPTURE_RESULT:'success',DEVELOP_RESULT:'failure',QA_RESULT:'skipped',PUBLISH_RESULT:'skipped',
 AGENT_STATE:'PR_OPEN',AGENT_HEAD:'a'.repeat(40),AGENT_BRANCH:'agent/issue-1055-run-123'};
test('agent failure is one updated task note and never a new comment per failed run',()=>{
 const x=inputForAgent(env,'failure');assert.equal(x.key,'AGENT_FAIL_1055');
 assert.equal(x.fields.develop_result,'failure');assert.equal(x.countAttempts,true);
 assert.doesNotMatch(JSON.stringify(x.fields),/fixture|PRIVATE_KEY/);
});
test('agent handoff is SHA, issue and run bound',()=>{
 const x=inputForAgent(env,'handoff');assert.equal(x.key,'AGENT_HANDOFF_1055');
 assert.equal(x.countAttempts,false);
 assert.throws(()=>inputForAgent({...env,AGENT_BRANCH:'main'},'handoff'),/INVALID_AGENT_HANDOFF/);
 assert.throws(()=>inputForAgent({...env,AGENT_STATE:'DEPLOYED'},'handoff'),/INVALID_AGENT_HANDOFF/);
});
