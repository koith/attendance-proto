// Existing original-backlog issue selector for scheduled AI code development.
// The queue is intentionally finite, explicitly issue-bound and NO operating writes.
// A run may propose code/QA only; never grant production acceptance or release.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const candidates=Object.freeze([
 {id:'QA-06',issue:1055},
 {id:'MTG-11',issue:1175},
 {id:'MTG-07',issue:1118},
 {id:'MTG-12',issue:1069},
 {id:'MTG-13',issue:1170}
]);
const claim=/^\[AUTODEV:CLAIM backlog=([A-Z0-9-]+) issue=(\d+) run=(\d+) at=(\d{4}-\d\d-\d\dT[^\]]+)\]/;
export function backlogIsOpen(text,id){
 if(!/^[A-Z0-9-]+$/.test(id))throw Error('INVALID_BACKLOG_ID');
 return new RegExp('^\\s*- \\[ \\] \\*\\*'+id.replace(/-/g,'\\-')+'\\b','m').test(text);
}
export function canSelect(candidate,issue,comments,branches,now=Date.now()){
 if(!issue||issue.number!==candidate.issue||issue.state!=='open'||issue.pull_request)return false;
 if(typeof issue.title!=='string'||!issue.title.includes(candidate.id))return false;
 if(!Array.isArray(comments)||!Array.isArray(branches))throw Error('UNTRUSTED_CHECKPOINTS');
 if(branches.some(b=>b.startsWith('agent/issue-'+candidate.issue+'-run-')))return false;
 const claims=comments.filter(c=>c.user?.login==='github-actions[bot]')
  .map(c=>String(c.body||'').match(claim)).filter(m=>m&&m[1]===candidate.id&&Number(m[2])===candidate.issue)
  .map(m=>Date.parse(m[4])).filter(t=>Number.isFinite(t)&&t<=now);
 // A separately approved issue is already eligible for the GitHub issues:labeled
 // trigger; never start a competing scheduled run before a bot claim exists.
 if((issue.labels||[]).some(x=>x.name==='agent-approved')&&!claims.length)return false;
 if(claims.some(t=>now-t<24*3600e3))return false;
 if(claims.filter(t=>now-t<7*24*3600e3).length>=2)return false;
 return true;
}
export function pick(catalog,backlog,issues,comments,branches,now=Date.now()){
 for(const candidate of catalog){
  if(!backlogIsOpen(backlog,candidate.id))continue;
  if(canSelect(candidate,issues[candidate.issue],comments[candidate.issue]||[],branches,now))return candidate;
 }
 return null;
}
function safeToken(token){if(!token)throw Error('MISSING_ISSUE_READ_TOKEN')}
export async function chooseAndClaim({repo,token,run,backlog,fetchImpl=fetch,now=Date.now()}){
 if(repo!=='koith/attendance-proto'||!/^\d{1,15}$/.test(String(run)))throw Error('UNTRUSTED_REPOSITORY_RUN');
 safeToken(token);
 const base='https://api.github.com/repos/'+repo;
 const headers={'authorization':'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'backlog-real-autodev'};
 const api=async(path,method='GET',data)=>{
  const result=await fetchImpl(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw Error('BACKLOG_GITHUB_HTTP_'+result.status+'_'+path.split('?')[0].slice(0,72));
  return result.json();
 };
 // Read exact known issue records only; never grab arbitrary new enhancement requests.
 const issues={},comments={};
 for(const candidate of candidates){
  if(!backlogIsOpen(backlog,candidate.id))continue;
  const i=await api('/issues/'+candidate.issue);
  issues[candidate.issue]=i;
  const page=await api('/issues/'+candidate.issue+'/comments?per_page=100');
  if(!Array.isArray(page)||page.length>=100)throw Error('CLAIM_CHECKPOINT_HISTORY_UNBOUNDED');
  comments[candidate.issue]=page;
 }
 const ref=await api('/git/matching-refs/heads/agent/');
 if(!Array.isArray(ref)||ref.length>400)throw Error('UNTRUSTED_AGENT_BRANCH_REFS');
 const branches=ref.map(x=>String(x.ref||'').replace(/^refs\/heads\//,''));
 const task=pick(candidates,backlog,issues,comments,branches,now);
 if(!task)return {selected:false,reason:'NO_SAFE_UNATTEMPTED_BACKLOG'};
 // Claim before providing an executable issue ID. A failed write never dispatches.
 const body='[AUTODEV:CLAIM backlog='+task.id+' issue='+task.issue+' run='+run+' at='+new Date(now).toISOString()+']\n'+
  'code_scope=root-app-and-qa-only\noperating_write=false\naccepted_backlog_increment=0';
 const result=await api('/issues/'+task.issue+'/comments','POST',{body});
 if(!result.id)throw Error('CLAIM_RECEIPT_NOT_CONFIRMED');
 const labels=new Set((issues[task.issue].labels||[]).map(x=>x.name));
 if(!labels.has('agent-approved'))await api('/issues/'+task.issue+'/labels','POST',{labels:['agent-approved']});
 return {selected:true,issue:task.issue,id:task.id};
}
async function main(){
 const e=process.env;
 const backlog=fs.readFileSync('PROJECT_BACKLOG_20261017.md','utf8');
 const selected=await chooseAndClaim({repo:e.GITHUB_REPOSITORY,token:e.GITHUB_TOKEN,run:e.GITHUB_RUN_ID,backlog});
 if(!e.GITHUB_OUTPUT)throw Error('GITHUB_OUTPUT_MISSING');
 fs.appendFileSync(e.GITHUB_OUTPUT,'selected='+(selected.selected?'true':'false')+'\nissue_number='+(selected.issue||'')+'\n');
 console.log('AUTODEV_REAL_BACKLOG_SELECTED '+JSON.stringify({selected:selected.selected,task:selected.id||null,issue:selected.issue||null,reason:selected.reason||null}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('AUTODEV_SELECTION_FAILED '+String(e.message).slice(0,130));process.exitCode=1});
