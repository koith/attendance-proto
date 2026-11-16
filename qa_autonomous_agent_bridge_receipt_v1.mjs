import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inputForAgent} from './scripts/ai-dev/agent_state_note.mjs';
import {upsertNote,marker} from './scripts/issue_state_note.mjs';

// Historical filename retained for release CI. New contract protects the
// same approval/permission boundary but uses one bot-owned status note per issue.
const workflow=fs.readFileSync('.github/workflows/autonomous-development-agent.yml','utf8');
const runner=fs.readFileSync('scripts/autonomous_dev_agent.sh','utf8');
const failureJob=workflow.split('\n  report-failure:\n')[1]||'';
assert.match(failureJob,/needs: \[capture-intake, develop, qa, publish\]/);
assert.match(failureJob,/if: always\(\) && \(needs\.capture-intake\.result == 'failure'/);
assert.match(failureJob,/permissions:\s*\n\s*issues: write\s*\n\s*contents: read/);
assert.doesNotMatch(failureJob,/contents: write|pull-requests: write/);
assert.match(failureJob,/node scripts\/ai-dev\/agent_state_note\.mjs failure/);
assert.doesNotMatch(failureJob,/gh issue comment|createComment/);

const env={GITHUB_REPOSITORY:'koith/attendance-proto',GITHUB_TOKEN:'synthetic-only',
 GITHUB_RUN_ID:'42',ISSUE_NUMBER:'802',CAPTURE_RESULT:'success',
 DEVELOP_RESULT:'failure',QA_RESULT:'skipped',PUBLISH_RESULT:'skipped'};
const input=inputForAgent(env,'failure');
assert.equal(input.issue,802);
assert.equal(input.key,'AGENT_FAIL_802');
assert.equal(input.countAttempts,true);
assert.equal(input.fields.accepted_tasks_increment,'0');
assert.equal(input.fields.develop_result,'failure');
assert.doesNotMatch(JSON.stringify(input.fields),/synthetic-only|SUPABASE_SERVICE_ROLE_KEY/);

const comments=[],calls=[];
const fake=async(url,opts)=>{
 const p=new URL(url),m=opts.method||'GET';
 calls.push({path:p.pathname,method:m});
 if(m==='GET')return{ok:true,status:200,json:async()=>comments};
 if(m==='POST'){
  const body=JSON.parse(opts.body).body;
  comments.push({id:11,body,user:{login:'github-actions[bot]'}});
  return{ok:true,status:201,json:async()=>({id:11})};
 }
 if(m==='PATCH'){
  assert.equal(Number(p.pathname.split('/').at(-1)),11);
  comments.find(x=>x.id===11).body=JSON.parse(opts.body).body;
  return{ok:true,status:200,json:async()=>({id:11})};
 }
 throw Error('UNEXPECTED_ISSUE_API');
};
const created=await upsertNote({...input,fetchImpl:fake});
assert.equal(created.result,'CREATED');
assert.match(comments[0].body,/attempts=1/);
assert.match(comments[0].body,/develop_result=failure/);
const repeated=await upsertNote({...input,fetchImpl:fake});
assert.equal(repeated.result,'UNCHANGED');
assert.equal(calls.filter(x=>x.method==='POST').length,1);
const updated=await upsertNote({...input,run:'43',fetchImpl:fake});
assert.equal(updated.result,'UPDATED');
assert.match(comments[0].body,/attempts=2/);
assert.equal(comments.length,1);
assert.equal(calls.filter(x=>x.method==='PATCH').length,1);

// A human-authored imitation never silences the real bot status.
const spoofBody=marker('AGENT_FAIL_802')+'\nattempts=999\nlast_run=44';
const spoof=async(url,opts)=>{
 if((opts.method||'GET')==='GET')return{ok:true,status:200,json:async()=>[
  {id:55,body:spoofBody,user:{login:'untrusted-author'}}
 ]};
 if(opts.method==='POST')return{ok:true,status:201,json:async()=>({id:56})};
 throw Error('UNEXPECTED_API');
};
const fresh=await upsertNote({...input,run:'44',fetchImpl:spoof});
assert.equal(fresh.result,'CREATED');
assert.equal(fresh.attempts,1);
assert.doesNotMatch(runner,/gh auth setup-git|git push -u origin|gh pr create/);
assert.match(workflow,/github\.event\.label\.name == 'agent-approved'/);
assert.match(workflow,/name: agent-qa-passed-patch/);
console.log('PASS agent reporter: bounded state, re-run idempotency, spoof rejection, read-only QA');
