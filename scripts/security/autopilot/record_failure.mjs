// Convergent per-task/cause failure counter; each run updates one bot-owned
// status note instead of appending another Issue #1492 comment.
import {upsertNote} from '../../issue_state_note.mjs';
import {pathToFileURL} from 'node:url';
export function validateFailure(e) {
  if(e.GITHUB_REPOSITORY!=='koith/attendance-proto' ||
     !/^(?:SEC-S\d\d|AISEC-\d\d)-[A-Z0-9-]{3,40}$/.test(e.SEC_AUTO_TASK||'') ||
     !/^(DEVELOP_FAILED|QA_FAILED|PUBLISH_FAILED)$/.test(e.FAILURE_CAUSE||'') ||
     !/^\d{1,15}$/.test(e.GITHUB_RUN_ID||'') || !e.GITHUB_TOKEN) {
    throw Error('INVALID_SECURITY_FAILURE_CONTEXT');
  }
  return {
    repo:e.GITHUB_REPOSITORY, issue:1492, token:e.GITHUB_TOKEN, run:e.GITHUB_RUN_ID,
    key:'SEC_FAIL_'+e.SEC_AUTO_TASK+'_'+e.FAILURE_CAUSE, countAttempts:true,
    fields:{
      status:'FAILED', cause:e.FAILURE_CAUSE,
      task:e.SEC_AUTO_TASK, no_operating_writes:'true',
      evidence:'https://github.com/'+e.GITHUB_REPOSITORY+'/actions/runs/'+e.GITHUB_RUN_ID
    }
  };
}
async function main() {
  const result=await upsertNote(validateFailure(process.env));
  console.log('SEC_AUTO_FAILURE_STATE '+JSON.stringify({result:result.result,attempts:result.attempts}));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(e=>{console.error('SEC_AUTO_FAILURE_STATE_ERROR '+String(e.message).slice(0,100));process.exitCode=1;});
}
