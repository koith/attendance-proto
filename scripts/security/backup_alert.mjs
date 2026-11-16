// One operator-visible backup alert, updated on each failed protected run.
// No backup material, credentials, or employee data is read here.
import {upsertNote} from '../issue_state_note.mjs';
import {pathToFileURL} from 'node:url';
export function alertInput(e) {
  if(e.GITHUB_REPOSITORY!=='koith/attendance-proto' ||
     !['failure','cancelled'].includes(e.BACKUP_RESULT) ||
     !/^\d{1,15}$/.test(e.GITHUB_RUN_ID || '') || !e.GITHUB_TOKEN) {
    throw Error('INVALID_BACKUP_ALERT_CONTEXT');
  }
  return {
    repo:e.GITHUB_REPOSITORY,token:e.GITHUB_TOKEN,issue:1492,
    key:'SEC_D5_BACKUP_ALERT',run:e.GITHUB_RUN_ID,countAttempts:true,
    fields:{
      status:'BACKUP_NOT_COMPLETED',result:e.BACKUP_RESULT,
      evidence:'https://github.com/'+e.GITHUB_REPOSITORY+'/actions/runs/'+e.GITHUB_RUN_ID,
      no_operating_writes:'true'
    }
  };
}
async function main() {
  const result=await upsertNote(alertInput(process.env));
  console.log('BACKUP_ALERT_STATE '+JSON.stringify({result:result.result,attempts:result.attempts}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(e=>{console.error('BACKUP_ALERT_ERROR '+String(e.message).slice(0,100));process.exitCode=1;});
}
