import test from 'node:test';
import assert from 'node:assert/strict';
import {resumeMailConnectivity} from '../scripts/qa1243_resume_mail_connectivity.mjs';
function fixture({head='668c01e5463dacdff14ac1c0c4e17bddcf03eb75',files=['PROJECT_BACKLOG_20261017.md'],conclusion='failure',branch='qa1243/probe-pr-merge-gate'}={}) {
 const writes=[];
 const github={rest:{
  pulls:{get:async()=>({data:{state:'open',head:{ref:branch,sha:'a'.repeat(40),repo:{full_name:'koith/attendance-proto'}}}})},
  repos:{compareCommits:async()=>({data:{status:'ahead',files:files.map(filename=>({filename}))}})},
  actions:{
   getWorkflowRun:async()=>({data:{head_sha:head,event:'pull_request',repository:{full_name:'koith/attendance-proto'},path:'.github/workflows/qa1243-google-mail-bridge.yml'}}),
   listJobsForWorkflowRun:async()=>({data:{jobs:[{id:120803702272,name:'QA1243 isolated GAS POST connectivity (no mail)',status:'completed',conclusion}]}}),
   reRunJobForWorkflowRun:async args=>{writes.push(args);return {};}
  }
 }};
 return {github,writes};
}
test('only the known failed live job is requeued, never declared passed',async()=>{
 const f=fixture();const r=await resumeMailConnectivity(f.github);
 assert.equal(r.state,'REQUEUED_NOT_YET_VERIFIED');assert.equal(f.writes.length,1);
 assert.deepEqual(f.writes[0],{owner:'koith',repo:'attendance-proto',job_id:120803702272});
});
test('changed tested code cannot reuse the old live job',async()=>{
 for(const files of [['gas/qa1243-auth-mail/Code.gs'],['supabase/functions/qa1243-google-mail-bridge/core.mjs']]){
  const f=fixture({files});await assert.rejects(resumeMailConnectivity(f.github),/RUNTIME_CHANGED/);assert.equal(f.writes.length,0);
 }
});
test('another PR branch or run head fails without rerun',async()=>{
 for(const options of [{branch:'untrusted'},{head:'f'.repeat(40)}]){
  const f=fixture(options);await assert.rejects(resumeMailConnectivity(f.github),/REJECTED/);assert.equal(f.writes.length,0);
 }
});
test('successful live check is reused without rerunning it',async()=>{
 const f=fixture({conclusion:'success'});const r=await resumeMailConnectivity(f.github);
 assert.equal(r.state,'ALREADY_PASS');assert.equal(f.writes.length,0);
});
