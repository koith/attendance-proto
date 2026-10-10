import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const statePath=process.env.WORK_STATE_FILE||'.automation/work-state.json';
const maxAttempts=Number(process.env.MAX_ATTEMPTS||3);
const command=process.env.WORKER_COMMAND;
if(!command)throw Error('WORKER_COMMAND required: point to an authorized AI worker wrapper');
const load=()=>JSON.parse(fs.readFileSync(statePath,'utf8'));
const save=s=>{fs.mkdirSync(statePath.slice(0,statePath.lastIndexOf('/'))||'.',{recursive:true});fs.writeFileSync(statePath,JSON.stringify(s,null,2)+'\n')};
let state=load();
for(let iteration=0;iteration<Number(process.env.MAX_STEPS||20);iteration++){
 const task=state.tasks.find(t=>t.status!=='done');
 if(!task){console.log('ALL_COMPLETE');process.exit(0)}
 if(task.status==='blocked')throw Error('BLOCKED: '+task.id);
 const pending=task.checks.filter(c=>!task.evidence[c]);
 if(!pending.length){console.error('Independent validation required: '+task.id);process.exit(2)}
 const check=pending[0];state.attempts??={};
 const key=task.id+':'+check,count=state.attempts[key]||0;
 if(count>=maxAttempts){task.status='blocked';task.block={reason:'Retry limit',alternatives:'Worker attempts exhausted; human review required',check};save(state);process.exit(3)}
 state.attempts[key]=count+1;save(state);
 const r=spawnSync(command,{shell:true,encoding:'utf8',timeout:Number(process.env.WORKER_TIMEOUT_MS||900000),env:{...process.env,WORK_TASK_ID:task.id,WORK_CHECK_ID:check,WORK_ATTEMPT:String(count+1)},maxBuffer:1024*1024});
 state=load();
 if(r.status!==0){state.history.push({at:new Date().toISOString(),action:'worker-failed',details:{key,attempt:count+1,exit:r.status,error:(r.stderr||r.error?.message||'').slice(0,1000)}});save(state);continue}
 if(!state.tasks.find(t=>t.id===task.id).evidence[check]){state.history.push({at:new Date().toISOString(),action:'unverified-worker-result',details:{key,attempt:count+1}});save(state)}
}
console.error('MAX_STEPS reached; work remains pending');process.exit(4);
