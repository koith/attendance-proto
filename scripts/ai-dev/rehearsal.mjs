import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {capture} from './process.mjs';
import {hash,history,prepare} from './checkpoint.mjs';
import {githubClient} from './github.mjs';
export function rehearse(snapshot,repository) {
 const context={issue:snapshot.issue.number,trustedAuthors:[repository.split('/')[0],'github-actions[bot]']};
 const prior=history(snapshot.comments,context);
 if(!Object.keys(prior).length)throw Error('NO_DURABLE_CHECKPOINT_TO_REHEARSE');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-interruption-'));
 try{
  const input=path.join(dir,'input.json'),saved=path.join(dir,'issue-only.json');
  fs.writeFileSync(input,JSON.stringify(snapshot));
  // A terminated writer leaves only GitHub's exported Issue/checkpoint state.
  // No conversation, in-memory task objects or previous CLI output are supplied.
  const child=spawnSync(process.execPath,['--input-type=module','-e',
   'import fs from "node:fs";fs.copyFileSync(process.argv[1],process.argv[2]);process.kill(process.pid,"SIGTERM");',input,saved],{stdio:'ignore',timeout:5000});
  if(child.signal!=='SIGTERM')throw Error('INTERRUPTION_NOT_OBSERVED');
  const recovered=JSON.parse(capture(process.execPath,['scripts/ai-dev/cli.mjs','resume',repository,String(context.issue),saved]));
  if(hash(recovered.definition)!==hash(snapshot.issue.body)||recovered.conversation_recovery!==false)throw Error('ISSUE_DEFINITION_NOT_RECOVERED');
  for(const [id,{latest}] of Object.entries(prior)){
   const task=recovered.tasks[id];
   for(const key of ['scope','acceptance','sha','failure','next_action','state','proofs'])
    if(JSON.stringify(task[key])!==JSON.stringify(latest.record[key]))throw Error('RECOVERY_FIELD_MISMATCH_'+key);
   if(task.completion!=='CANNOT_VERIFY')throw Error('INTERRUPTION_FALSE_COMPLETION');
   const r=latest.record;
   const input={...r,expected_revision:r.revision,expected_sha:r.sha};
   if(!prepare(input,snapshot.comments,context,{headSha:r.sha}).duplicate)throw Error('RESTART_DUPLICATED_EVENT');
  }
  return {version:1,issue:context.issue,source:snapshot.issue.html_url||`https://github.com/${repository}/issues/${context.issue}`,
   observed_at:new Date().toISOString(),result:'PASS',interruption:'SIGTERM',fresh_process:true,conversation_input:false,
   recovered_tasks:Object.fromEntries(Object.entries(recovered.tasks).map(([id,t])=>[id,{state:t.state,sha:t.sha,next_action:t.next_action,completion:t.completion}])),
   duplicate_effects:0,production_writes:0,note:'Fresh-process issue-only recovery rehearsal; no automatic ChatGPT queue restoration.'};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [repository,number]=process.argv.slice(2),n=Number(number),api=githubClient(repository);
 const snapshot={issue:await api(`/issues/${n}`),comments:await api.list(`/issues/${n}/comments`)};
 console.log(JSON.stringify(rehearse(snapshot,repository),null,2));
}
