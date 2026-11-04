// A separate, TRUSTED host-side parser. The LLM cannot change this file or
// workflows. No model-written code executes until independent secretless QA.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const startMarker='AGENT_EDITS_BEGIN',endMarker='AGENT_EDITS_END';
export function pathsFor(id,catalog){
 const t=catalog.tasks.find(x=>x.id===id);
 if(!t||!/^SEC-S\d\d(?:-[A-Z]+)?$|^AISEC-\d\d(?:-[A-Z]+)?$/.test(t.ledger))throw Error('UNRECOGNIZED_TASK');
 const p=/^scripts\/security\/autopilot\/[a-z0-9_]+\.mjs$/;
 const q=/^qa\/security\/autopilot\/[a-z0-9_]+\.test\.mjs$/;
 if(!p.test(t.source)||!q.test(t.test))throw Error('PATH_OUTSIDE_SECURITY_SANDBOX');
 return t;
}
const unsafe=/\b(?:process|globalThis|Deno|eval|require|fetch|XMLHttpRequest|WebSocket|Buffer|child_process|worker_threads|node:fs|node:net|node:http|node:https|import\s*\(|__proto__|constructor\s*\[|prototype\s*\[|github\.com|supabase\.co|BEGIN\s+PRIVATE\s+KEY)\b/i;
export function staticSourceCheck(source,qa){
 for(const [type,c] of [['source',source],['qa',qa]]){
  if(typeof c!=='string'||c.length>21000||c.length<40||unsafe.test(c)||(c.includes('Function(')||c.includes('new Function'))||/https?:\/\//.test(c)||/\b(?:secret|password|authorization)\s*[:=]/i.test(c))throw Error('DANGEROUS_MODEL_SOURCE_'+type);
  if(/(^|\n)\s*(?:import|export\s+\*\s+from)\s+.*(?:node:|['"]https?:)/m.test(c.replace(/from\s+['"]node:(?:assert|test|crypto)['"]/g,'from "allowed"')))throw Error('UNAPPROVED_IMPORT_'+type);
 }
 if(!/export\s+function\s+\w+/.test(source)||!/throw\s+(?:new\s+)?Error/.test(source))throw Error('SOURCE_NOT_STRICT_FAIL_CLOSED');
 if((qa.match(/\btest\(/g)||[]).length<2||!/assert\./.test(qa)||!/assert\.throws/.test(qa))throw Error('INSUFFICIENT_NEGATIVE_QA');
}
export function parseEdits(text,task){
 if(typeof text!=='string'||text.length>140000)throw Error('PROVIDER_OUTPUT_INVALID');
 const p=text.lastIndexOf(startMarker),e=text.indexOf(endMarker,p+startMarker.length);
 if(p<0||e<0)throw Error('MODEL_STRUCTURED_EDITS_MISSING');
 const raw=text.slice(p+startMarker.length,e);
 const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
 if(a<0||b<a)throw Error('MODEL_JSON_ABSENT');
 let data;
 try{data=JSON.parse(raw.slice(a,b+1))}catch{throw Error('MODEL_JSON_INVALID')}
 if(!Array.isArray(data.edits)||data.edits.length!==2)throw Error('MODEL_MUST_EDIT_SOURCE_AND_TEST');
 const paths=new Set(data.edits.map(x=>x?.path));
 if(paths.size!==2||!paths.has(task.source)||!paths.has(task.test))throw Error('MODEL_PATH_NOT_ALLOWLISTED');
 return data.edits;
}
export function applyValidated(edits,task,root){
 const changed=[];
 for(const e of edits){
  if(typeof e.old!=='string'||typeof e.new!=='string'||!e.old.length||e.new.length>21000||e.new.length<2)throw Error('REPLACEMENT_INVALID');
  const full=root+'/'+e.path;
  const st=fs.lstatSync(full);
  if(!st.isFile()||st.isSymbolicLink())throw Error('SYMLINK_OR_NONFILE_FORBIDDEN');
  const before=fs.readFileSync(full,'utf8');
  const pos=before.indexOf(e.old);
  if(pos<0||before.indexOf(e.old,pos+e.old.length)!==-1)throw Error('AMBIGUOUS_SOURCE_ANCHOR');
  const after=before.slice(0,pos)+e.new+before.slice(pos+e.old.length);
  if(after===before)throw Error('NO_REAL_CHANGE');
  changed.push({path:e.path,after});
 }
 const source=changed.find(x=>x.path===task.source).after;
 const qa=changed.find(x=>x.path===task.test).after;
 staticSourceCheck(source,qa);
 for(const x of changed)fs.writeFileSync(root+'/'+x.path,x.after,{flag:'w'});
 return changed.map(x=>x.path);
}
export function verifyStaged(task,root){
 const names=execFileSync('git',['diff','--cached','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
 if(names.length!==2||!names.includes(task.source)||!names.includes(task.test))throw Error('STAGED_FILE_ALLOWLIST_VIOLATION');
 const raw=execFileSync('git',['diff','--cached','--raw'],{cwd:root,encoding:'utf8'}).trim().split('\n');
 if(raw.some(line=>!/^:100644 100644 [a-f0-9]{7,40} [a-f0-9]{7,40} M\s+/.test(line)))throw Error('UNSAFE_FILE_MODE_OR_OPERATION');
 staticSourceCheck(fs.readFileSync(root+'/'+task.source,'utf8'),fs.readFileSync(root+'/'+task.test,'utf8'));
 if(execFileSync('git',['diff','--cached','--check'],{cwd:root,encoding:'utf8'}).trim())throw Error('PATCH_WHITESPACE_ERRORS');
 return names;
}
async function main(){
 const [,,mode,taskId,proposalPath]=process.argv;
 const root=process.cwd();
 const catalog=JSON.parse(fs.readFileSync('security/autopilot/tasks.json','utf8'));
 const task=pathsFor(taskId,catalog);
 if(mode==='apply'){
  const proposal=fs.readFileSync(proposalPath,'utf8');
  applyValidated(parseEdits(proposal,task),task,root);
  console.log('SEC_AUTO_PROPOSAL_VALIDATED task='+taskId);
 }else if(mode==='verify'){
  const names=verifyStaged(task,root);
  console.log('SEC_AUTO_PATCH_VERIFIED task='+taskId+' files='+names.length);
 }else throw Error('INVALID_SECURITY_AUTOPILOT_MODE');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('SEC_AUTO_VALIDATION_FAILED cause='+String(e.message).slice(0,110));process.exitCode=1});
