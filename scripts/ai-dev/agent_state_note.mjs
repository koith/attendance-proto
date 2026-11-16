// Bounded, non-sensitive status for automated code proposal handoff/failure.
import {upsertNote} from '../issue_state_note.mjs';
import {pathToFileURL} from 'node:url';
export function inputForAgent(e,mode) {
 const issue=Number(e.ISSUE_NUMBER),run=String(e.GITHUB_RUN_ID||'');
 if(e.GITHUB_REPOSITORY!=='koith/attendance-proto'||
    !Number.isSafeInteger(issue)||issue<1||issue>99999999||
    !/^\d{1,15}$/.test(run)||!e.GITHUB_TOKEN)throw Error('INVALID_AGENT_NOTE_CONTEXT');
 const evidence='https://github.com/'+e.GITHUB_REPOSITORY+'/actions/runs/'+run;
 if(mode==='failure') {
  const data={};
  for(const name of ['CAPTURE_RESULT','DEVELOP_RESULT','QA_RESULT','PUBLISH_RESULT']) {
    const state=String(e[name]||'unknown');
    if(!/^(success|failure|cancelled|skipped|unknown)$/.test(state))throw Error('INVALID_AGENT_RESULT');
    data[name.toLowerCase()]=state;
  }
  return {repo:e.GITHUB_REPOSITORY,issue,token:e.GITHUB_TOKEN,run,
    key:'AGENT_FAIL_'+issue,countAttempts:true,
    fields:{status:'INCOMPLETE',evidence,accepted_tasks_increment:'0',...data}};
 }
 if(mode==='handoff') {
  if(!['PR_OPEN','BRIDGE_REQUIRED'].includes(e.AGENT_STATE)|| 
     !/^[a-f0-9]{40}$/.test(e.AGENT_HEAD||'')||
     e.AGENT_BRANCH!=='agent/issue-'+issue+'-run-'+run)throw Error('INVALID_AGENT_HANDOFF');
  return {repo:e.GITHUB_REPOSITORY,issue,token:e.GITHUB_TOKEN,run,
    key:'AGENT_HANDOFF_'+issue,countAttempts:false,
    fields:{status:e.AGENT_STATE,head:e.AGENT_HEAD,branch:e.AGENT_BRANCH,
      evidence,operating_changes:'false',accepted_tasks_increment:'0'}};
 }
 throw Error('INVALID_AGENT_NOTE_MODE');
}
async function main() {
 const mode=process.argv[2];
 const e=process.env;
 if(mode==='failure' && !/^\d{1,8}$/.test(String(e.ISSUE_NUMBER||''))) {
  console.log('AGENT_NOTE_SKIPPED_NO_APPROVED_ISSUE');return;
 }
 const result=await upsertNote(inputForAgent(e,mode));
 console.log('AGENT_NOTE '+JSON.stringify({mode,result:result.result,attempts:result.attempts||0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('AGENT_NOTE_ERROR '+String(e.message).slice(0,120));process.exitCode=1;});
