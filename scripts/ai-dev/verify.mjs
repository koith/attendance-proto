import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {capture} from './process.mjs';
import {githubClient} from './github.mjs';
import {prepare,encode} from './checkpoint.mjs';
const [mode]=process.argv.slice(2);
const repository=process.env.GITHUB_REPOSITORY||'koith/attendance-proto';
const issue=Number(process.env.AI_DEV_ISSUE||1331);
const sha=capture('git',['rev-parse','HEAD']).trim();
const root=`https://github.com/${repository}`;
const run=(...args)=>capture(process.execPath,args);
const api=githubClient(repository);
let stage=mode,environment='isolated',target_url=`${root}/tree/${sha}`;
if(mode==='unit') {
 const tests=fs.readdirSync('scripts/ai-dev').filter(p=>p.endsWith('.test.mjs')).map(p=>'scripts/ai-dev/'+p);
 process.stdout.write(run('--test',...tests));
}else if(mode==='integration') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-resume-'));
 try{
  const input={task:'demo',event_id:'first',expected_revision:0,expected_sha:null,sha,branch:'main',state:'IN_PROGRESS',scope:'Resume after interruption',acceptance:'next_action preserved',next_action:'Run independent acceptance',failure:'session interrupted',proofs:[]};
  const c=prepare(input,[],{issue,trustedAuthors:[]},{headSha:sha});
  const snapshot={issue:{number:issue,title:'Isolated integration fixture',body:'Canonical instructions'},comments:[{body:encode(c.record),user:{login:repository.split('/')[0]}}]};
  const file=path.join(dir,'snapshot.json');fs.writeFileSync(file,JSON.stringify(snapshot));
  const result=JSON.parse(run('scripts/ai-dev/cli.mjs','resume',repository,String(issue),file));
  if(result.tasks.demo.next_action!==input.next_action||result.tasks.demo.failure!==input.failure||result.tasks.demo.completion!=='CANNOT_VERIFY')throw Error('FRESH_PROCESS_RESUME_FAILED');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}else if(mode==='deployment') {
 environment='repository';
 const ref=await api('/git/ref/heads/main');
 if(ref.object.sha!==sha)throw Error('STALE_MAIN_INSTALLATION');
 const file=await api(`/contents/AGENTS.md?ref=${sha}`);
 if(Buffer.from(file.content,'base64').toString('utf8')!==fs.readFileSync('AGENTS.md','utf8'))throw Error('MAIN_AGENTS_READBACK_MISMATCH');
 await import('./acceptance.mjs');await import('./checkpoint.mjs');
}else if(mode==='post-deploy') {
 environment='repository';stage='post_deploy';target_url=`${root}/issues/${issue}`;
 const result=JSON.parse(run('scripts/ai-dev/cli.mjs','resume',repository,String(issue)));
 if(result.issue!==issue||!result.definition?.trim()||!Object.keys(result.tasks).length||result.conversation_recovery!==false)throw Error('LIVE_ISSUE_RESUME_NOT_VERIFIED');
 fs.writeFileSync('live-resume.json',JSON.stringify(result,null,2)+'\n');
 const drill=JSON.parse(run('scripts/ai-dev/rehearsal.mjs',repository,String(issue)));
 if(drill.result!=='PASS')throw Error('LIVE_RECOVERY_REHEARSAL_FAILED');
 fs.writeFileSync('recovery-rehearsal.json',JSON.stringify(drill,null,2)+'\n');
}else throw Error('UNKNOWN_VERIFICATION_MODE');
if(!process.env.GITHUB_RUN_ID){console.log('LOCAL_QA_PASS; no live Actions receipt emitted');process.exit(0);}
const file='evidence.json',bundle=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,receipts:[]};
const receipt={version:1,repository,issue,check:mode,stage,scope:'automation',environment,target_url,sha,
 run_id:Number(process.env.GITHUB_RUN_ID),run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),at:new Date().toISOString(),status:'PASS'};
if(bundle.receipts.some(r=>r.check===mode))throw Error('DUPLICATE_MEASUREMENT');
bundle.receipts.push(receipt);fs.writeFileSync(file,JSON.stringify(bundle,null,2)+'\n');
console.log(JSON.stringify(receipt));
