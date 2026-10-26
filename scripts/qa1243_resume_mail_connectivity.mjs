// A credential-free dispatcher: only the previously failed PR1361 live job.
// Does not repeat the 32 passing tests or treat a queued job as success.
const REPO={owner:'koith',repo:'attendance-proto'};
const RUN_ID=40070815610;
const CODE_SHA='668c01e5463dacdff14ac1c0c4e17bddcf03eb75';
const JOB_NAME='QA1243 isolated GAS POST connectivity (no mail)';
const allowed=new Set([
 'PROJECT_BACKLOG_20261017.md','.github/workflows/qa1243-existing-google-oauth-probe.yml',
 'scripts/qa1243_google_unattended_auth.mjs','qa/qa1243_google_unattended_auth.test.mjs',
 'scripts/qa1243_resume_mail_connectivity.mjs','qa/qa1243_resume_mail_connectivity.test.mjs'
]);
function safePath(path){return allowed.has(path)||path.startsWith('docs/');}

export async function resumeMailConnectivity(github) {
 const {data:pr}=await github.rest.pulls.get({...REPO,pull_number:1361});
 if(pr.state!=='open'||pr.head?.ref!=='qa1243/probe-pr-merge-gate'||pr.head?.repo?.full_name!=='koith/attendance-proto')
  throw Error('QA1243_RESUME_PR_REJECTED');
 const {data:run}=await github.rest.actions.getWorkflowRun({...REPO,run_id:RUN_ID});
 if(run.head_sha!==CODE_SHA||run.event!=='pull_request'||run.repository?.full_name!=='koith/attendance-proto'||
    run.path!=='.github/workflows/qa1243-google-mail-bridge.yml')throw Error('QA1243_RESUME_RUN_REJECTED');
 const {data:diff}=await github.rest.repos.compareCommits({...REPO,base:CODE_SHA,head:pr.head.sha,per_page:100});
 if(!['ahead','identical'].includes(diff.status)||!Array.isArray(diff.files)||diff.files.length>=300||
    diff.files.some(f=>!safePath(f.filename)||(f.previous_filename&&!safePath(f.previous_filename))))
  throw Error('QA1243_RESUME_RUNTIME_CHANGED');
 const {data:jobs}=await github.rest.actions.listJobsForWorkflowRun({...REPO,run_id:RUN_ID,per_page:100});
 const targets=jobs.jobs.filter(j=>j.name===JOB_NAME);
 if(targets.length!==1)throw Error('QA1243_RESUME_JOB_UNVERIFIED');
 const job=targets[0];
 if(job.status==='completed'&&job.conclusion==='success')return {runId:RUN_ID,jobId:job.id,state:'ALREADY_PASS'};
 if(job.status!=='completed')return {runId:RUN_ID,jobId:job.id,state:'ALREADY_RUNNING'};
 if(!['failure','cancelled','timed_out'].includes(job.conclusion))throw Error('QA1243_RESUME_JOB_UNVERIFIED');
 await github.rest.actions.reRunJobForWorkflowRun({...REPO,job_id:job.id});
 return {runId:RUN_ID,jobId:job.id,state:'REQUEUED_NOT_YET_VERIFIED'};
}
