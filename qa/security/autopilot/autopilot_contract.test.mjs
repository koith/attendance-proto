import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import fs from 'node:fs';
import {chooseTask,statusOfLedger} from '../../../scripts/security/autopilot/select_task.mjs';
import {pathsFor,staticSourceCheck,parseEdits,applyValidated} from '../../../scripts/security/autopilot/safe_edits.mjs';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const catalog=JSON.parse(fs.readFileSync('security/autopilot/tasks.json','utf8'));
const sec=fs.readFileSync('SECURITY_STABILITY_LEDGER_20261103.md','utf8');
const ai=fs.readFileSync('AI_AUTOMATION_SECURITY_LEDGER_20261104.md','utf8');
const data={sec,ai};
const head='a'.repeat(40);
test('original SEC-S03 COMPLETED and other 24 tasks preserved',()=>{
 assert.equal(statusOfLedger(sec,'SEC-S03'),'COMPLETE');
 assert.equal(statusOfLedger(sec,'SEC-S04'),'IN_PROGRESS');
 assert.equal(statusOfLedger(ai,'AISEC-04'),'IN_PROGRESS');
 assert.equal(catalog.tasks.some(t=>t.ledger==='SEC-S03'),false);
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

test('autopilot refuses any catalog that permits auto-merge',()=>{
 assert.equal(catalog.allow_auto_merge,false);
 assert.throws(()=>chooseTask({...catalog,allow_auto_merge:true},data,[]),/AUTOMERGE_POLICY_MUST_BE_FALSE/);
 assert.throws(()=>chooseTask({...catalog,allow_auto_merge:undefined},data,[]),/AUTOMERGE_POLICY_MUST_BE_FALSE/);
});
test('generated modules must not load bare builtins, packages or arbitrary repository source',()=>{
 const task=pathsFor('SEC-S04-MANIFEST',catalog);
 const source=fs.readFileSync(task.source,'utf8');
 const qa=fs.readFileSync(task.test,'utf8');
 assert.doesNotThrow(()=>staticSourceCheck(source,qa,task));
 for(const injected of [
  "import {readFileSync} from 'fs';",
  "import 'https';",
  "import x from 'dotenv';",
  "export {f} from 'node:fs/promises';",
  "import {f} from '../outside.mjs';"
 ]){
  assert.throws(()=>staticSourceCheck(source+'\n'+injected,qa,task),/UNAPPROVED_MODEL_MODULE|DANGEROUS_MODEL_SOURCE/);
  assert.throws(()=>staticSourceCheck(source,qa+'\n'+injected,task),/UNAPPROVED_MODEL_MODULE|DANGEROUS_MODEL_SOURCE/);
 }
 for(const injected of [
  "const m=import('fs');",
  "const m=import /* block comment */ ('https');",
  "const m=import// line comment\n('fs');",
  "const m=import(`dotenv`);",
  "const m=import /**/ (  'fs'  );"
 ]){
  assert.throws(()=>staticSourceCheck(source+'\n'+injected,qa,task),/DANGEROUS_MODEL_SOURCE/);
  assert.throws(()=>staticSourceCheck(source,qa+'\n'+injected,task),/DANGEROUS_MODEL_SOURCE/);
 }
 const unrelated=qa.replace("../../../scripts/security/autopilot/manifest_guard.mjs","../../../scripts/security/autopilot/role_catalog_guard.mjs");
 assert.throws(()=>staticSourceCheck(source,unrelated,task),/UNAPPROVED_MODEL_MODULE/);
});
