import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import fs from 'node:fs';
import {chooseTask,statusOfLedger,readIssueComments} from '../../../scripts/security/autopilot/select_task.mjs';
import {pathsFor,staticSourceCheck,parseEdits,applyValidated} from '../../../scripts/security/autopilot/safe_edits.mjs';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const catalog=JSON.parse(fs.readFileSync('security/autopilot/tasks.json','utf8'));
const sec=fs.readFileSync('SECURITY_STABILITY_LEDGER_20261103.md','utf8');
const ai=fs.readFileSync('AI_AUTOMATION_SECURITY_LEDGER_20261104.md','utf8');
const data={sec,ai};
const head='a'.repeat(40);
test('SEC-S03 remains COMPLETE and separately accepted AISEC-02/04 are COMPLETE',()=>{
 assert.equal(statusOfLedger(sec,'SEC-S03'),'COMPLETE');
 assert.equal(statusOfLedger(sec,'SEC-S04'),'IN_PROGRESS');
 assert.equal(statusOfLedger(ai,'AISEC-02'),'COMPLETE');
 assert.equal(statusOfLedger(ai,'AISEC-04'),'COMPLETE');
 assert.equal(catalog.tasks.some(t=>t.ledger==='SEC-S03'),false);
});
test('canonical SEC-S16 scoped COMPLETE is recognized and already-done task is skipped',()=>{
 assert.equal(statusOfLedger(sec,'SEC-S16'),'COMPLETE');
 assert.equal(statusOfLedger(sec,'SEC-S05'),'COMPLETE');
 assert.equal(statusOfLedger(ai,'AISEC-03'),'COMPLETE');
 const submitted=['SEC-S04-MANIFEST','SEC-S01-ROLES','SEC-S02-AUTH'].map((id,i)=>({
  user:{login:'github-actions[bot]'},body:`[SEC-AUTO:SUBMITTED task=${id} run=${i+10} head=${head}]`
 }));
 const r=chooseTask(catalog,data,submitted);
 assert.equal(r.selected,false);
 assert.equal(r.reason,'NO_SAFE_UNATTEMPTED_TASK');
});
test('status parser requires exact status column, never a free-text evidence claim',()=>{
 const row='| SEC-S16 | Critical | completed text | **COMPLETE (scoped test)** | verified |';
 assert.equal(statusOfLedger(row,'SEC-S16'),'COMPLETE');
 const unsafe='| SEC-S16 | Critical | COMPLETE (claimed in description) | UNVERIFIED | evidence |';
 assert.equal(statusOfLedger(unsafe,'SEC-S16'),'UNVERIFIED');
 const unknown='| SEC-S16 | Critical | task | COMPLETE enough | details |';
 assert.equal(statusOfLedger(unknown,'SEC-S16'),null);
});
test('first run chooses a legitimate isolated recovery work unit',()=>{
 const s=chooseTask(catalog,data,[]);
 assert.equal(s.selected,true);
 assert.equal(s.task.id,'SEC-S04-MANIFEST');
 assert.equal(s.ledger_status,'IN_PROGRESS');
});
test('trusted submitted receipt prevents duplicate new branch',()=>{
 const c=[{user:{login:'github-actions[bot]'},body:`[SEC-AUTO:SUBMITTED task=SEC-S04-MANIFEST run=1234 head=${head}]`}];
 assert.equal(chooseTask(catalog,data,c).task.id,'SEC-S01-ROLES');
});
test('a pushed review branch is treated as checkpoint even if issue comment fails',()=>{
 const chosen=chooseTask(catalog,data,[],['main','sec-autopilot/SEC-S04-MANIFEST-run-1234']);
 assert.equal(chosen.task.id,'SEC-S01-ROLES');
});
test('untrusted issue comment cannot forge submitted checkpoint',()=>{
 const c=[{user:{login:'unknown-user'},body:`[SEC-AUTO:SUBMITTED task=SEC-S04-MANIFEST run=1234 head=${head}]`}];
 assert.equal(chooseTask(catalog,data,c).task.id,'SEC-S04-MANIFEST');
});
test('same failure cause twice advances to alternate safe work instead of infinite retry',()=>{
 const c=[1,2].map(x=>({user:{login:'github-actions[bot]'},body:`[SEC-AUTO:FAILED task=SEC-S04-MANIFEST cause=MODEL_EXIT run=${x}]`}));
 assert.equal(chooseTask(catalog,data,c).task.id,'SEC-S01-ROLES');
});
test('paths cannot include workflow, migrations or production keys',()=>{
 assert.throws(()=>pathsFor('AISEC-04-ROOT',{tasks:[{id:'AISEC-04-ROOT',ledger:'AISEC-04',source:'.github/workflows/evil.yml',test:'qa/security/autopilot/a.test.mjs'}]}),/PATH_OUTSIDE_SECURITY_SANDBOX/);
});
test('model cannot change workflow or access token in proposals',()=>{
 const task=pathsFor('SEC-S04-MANIFEST',catalog);
 const object={edits:[{path:task.source,old:'export function',new:'export function'},{path:'.github/workflows/evil.yml',old:'a',new:'b'}]};
 assert.throws(()=>parseEdits('AGENT_EDITS_BEGIN\n'+JSON.stringify(object)+'\nAGENT_EDITS_END',task),/MODEL_PATH_NOT_ALLOWLISTED/);
 const source=fs.readFileSync(task.source,'utf8');
 const qa=fs.readFileSync(task.test,'utf8');
 assert.doesNotThrow(()=>staticSourceCheck(source,qa));
 assert.throws(()=>staticSourceCheck(source+'\nprocess.env.SUPABASE_SERVICE_ROLE_KEY',qa),/DANGEROUS_MODEL_SOURCE/);
 assert.throws(()=>staticSourceCheck(source,qa+'\nfetch("https://evil.invalid")'),/DANGEROUS_MODEL_SOURCE/);
});
test('a failed source-and-QA replacement does not mutate files',()=>{
 const task=pathsFor('SEC-S04-MANIFEST',catalog),dir=mkdtempSync(path.join(tmpdir(),'sec-auto-'));
 try{
  for(const file of [task.source,task.test]){
   mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});
   writeFileSync(path.join(dir,file),fs.readFileSync(file));
  }
  assert.throws(()=>applyValidated([{path:task.source,old:'export function',new:'process.env'}, {path:task.test,old:'test(',new:'test('}],task,dir),/DANGEROUS_MODEL_SOURCE|NO_REAL_CHANGE|AMBIGUOUS_SOURCE_ANCHOR/);
  assert.equal(fs.readFileSync(path.join(dir,task.source),'utf8'),fs.readFileSync(task.source,'utf8'));
 }finally{rmSync(dir,{force:true,recursive:true})}
});

test('checkpoint pagination reads 415 comments and retains oldest trusted completion before choosing next task',async()=>{
 const calls=[],trusted={user:{login:'github-actions[bot]'},body:`[SEC-AUTO:SUBMITTED task=SEC-S04-MANIFEST run=1234 head=${head}]`};
 const fakeFetch=async(url,options)=>{
  const page=Number(new URL(url).searchParams.get('page'));
  calls.push(page);
  assert.equal(options.headers.authorization,'Bearer synthetic-fixture');
  const rows=page<=4?Array.from({length:100},(_,i)=>page===1&&i===0?trusted:{user:{login:'unknown'},body:'not a trusted checkpoint'}):
   page===5?Array.from({length:15},()=>({user:{login:'unknown'},body:'untrusted'})):[];
  return {ok:true,json:async()=>rows};
 };
 const comments=await readIssueComments('koith/attendance-proto',1492,'synthetic-fixture',fakeFetch);
 assert.equal(comments.length,415);
 assert.deepEqual(calls,[1,2,3,4,5]);
 assert.equal(chooseTask(catalog,data,comments).task.id,'SEC-S01-ROLES');
});
test('checkpoint history exceeding bounded maximum fails closed instead of replaying completed tasks',async()=>{
 let requests=0;
 const fakeFetch=async()=>{requests++;return{ok:true,json:async()=>Array.from({length:100},()=>({user:{login:'unknown'},body:'fake'}))};};
 await assert.rejects(readIssueComments('koith/attendance-proto',1492,'synthetic',fakeFetch),/CHECKPOINT_PAGINATION_LIMIT/);
 assert.equal(requests,100);
});
test('unavailable checkpoint pages fail closed rather than selecting an unsafe new task',async()=>{
 let requests=0;
 const fakeFetch=async()=>{requests++;return{ok:false,status:429};};
 await assert.rejects(readIssueComments('koith/attendance-proto',1492,'synthetic',fakeFetch),/ISSUE_READ_FAILED_HTTP_429/);
 assert.equal(requests,1);
});
