// Read-only deterministic selection. Ledger verdicts are authoritative; issue
// comments provide idempotent subtask checkpoints, never security completion.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const file='security/autopilot/tasks.json';
const safe=/^[A-Z0-9-]{4,45}$/;
export function statusOfLedger(content,id){
  for(const line of content.split('\n')){
    if(!line.startsWith('|'))continue;
    const cells=line.split('|').slice(1,-1).map(x=>x.trim());
    if(cells[0]!==id)continue;
    const status=cells.slice(1).find(x=>/^(COMPLETE|IN_PROGRESS|NOT_STARTED|UNVERIFIED|FAILED_PATH)$/.test(x));
    return status||null;
  }
  return null;
}
export function chooseTask(catalog,ledgers,comments,liveBranches=[]){
  if(catalog.schema!==1||catalog.master_issue!==1492||!Array.isArray(catalog.tasks))throw Error('INVALID_TASK_CATALOG');
  const delivered=new Set(), failures=new Map();
  for(const comment of comments){
    const author=comment.user?.login;
    if(!['github-actions[bot]','koith'].includes(author))continue;
    const msg=String(comment.body||'');
    const submitted=msg.match(/^\[SEC-AUTO:SUBMITTED task=([A-Z0-9-]+) run=([0-9]+) head=([a-f0-9]{40})\]/m);
    if(submitted)delivered.add(submitted[1]);
    const failed=msg.match(/^\[SEC-AUTO:FAILED task=([A-Z0-9-]+) cause=([A-Z_]+) run=[0-9]+\]/m);
    if(failed){const byCause=failures.get(failed[1])||new Map();byCause.set(failed[2],(byCause.get(failed[2])||0)+1);failures.set(failed[1],byCause);}
  }
  const tasks=[...catalog.tasks].sort((a,b)=>a.priority-b.priority);
  for(const t of tasks){
    if(!safe.test(t.id)||!/^(?:SEC-S\d\d|AISEC-\d\d)$/.test(t.ledger))throw Error('INVALID_TASK_IDENTIFIER');
    if(!/^scripts\/security\/autopilot\/[a-z0-9_]+\.mjs$/.test(t.source)||!/^qa\/security\/autopilot\/[a-z0-9_]+\.test\.mjs$/.test(t.test))throw Error('TASK_PATH_OUTSIDE_ISOLATION');
    const ledger=t.ledger.startsWith('AISEC')?ledgers.ai:ledgers.sec;
    const status=statusOfLedger(ledger,t.ledger);
    if(!status)throw Error('LEDGER_TASK_NOT_FOUND:'+t.ledger);
    if(status==='COMPLETE'||delivered.has(t.id)||liveBranches.some(x=>x.startsWith('sec-autopilot/'+t.id+'-run-')))continue;
    const exhausted=[...(failures.get(t.id)?.values()||[])].some(n=>n>=catalog.max_identical_cause_retries);
    if(exhausted)continue;
    return {selected:true,task:t,ledger_status:status,prior_failures:[...(failures.get(t.id)?.values()||[])].reduce((a,b)=>a+b,0)};
  }
  return {selected:false,reason:'NO_SAFE_UNATTEMPTED_TASK'};
}
async function readIssueComments(repo,issue,token){
 const comments=[];
 for(let page=1;page<=4;page++){
  const response=await fetch('https://api.github.com/repos/'+repo+'/issues/'+issue+'/comments?per_page=100&page='+page,{
   headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','user-agent':'sec-recovery-autopilot'},
   signal:AbortSignal.timeout(15000),redirect:'error'
  });
  if(!response.ok)throw Error('ISSUE_READ_FAILED_HTTP_'+response.status);
  const pageRows=await response.json();
  if(!Array.isArray(pageRows))throw Error('INVALID_ISSUE_RESPONSE');
  comments.push(...pageRows);
  if(pageRows.length<100)return comments;
 }
 throw Error('CHECKPOINT_PAGINATION_LIMIT');
}
async function readPublishedBranches(repo,token){
  // A repository can have thousands of historical branches. Search only the
  // dedicated prefix, never paginate the unrelated general branches.
  const response=await fetch('https://api.github.com/repos/'+repo+'/git/matching-refs/heads/sec-autopilot/',{
    headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','user-agent':'sec-recovery-autopilot'},
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('AUTOPILOT_BRANCH_PREFIX_READ_HTTP_'+response.status);
  const rows=await response.json();
  if(!Array.isArray(rows)||rows.length>500)throw Error('UNEXPECTED_AUTOPILOT_BRANCH_REFS');
  return rows.map(x=>String(x.ref||'').replace(/^refs\/heads\//,''));
}
async function main(){
 const repo=process.env.GITHUB_REPOSITORY;
 const token=process.env.GITHUB_TOKEN;
 if(repo!=='koith/attendance-proto'||!token)throw Error('MISSING_RESTRICTED_MAIN_CONTEXT');
 const catalog=JSON.parse(fs.readFileSync(file,'utf8'));
 const ledgers={sec:fs.readFileSync(catalog.source_ledgers[0],'utf8'),ai:fs.readFileSync(catalog.source_ledgers[1],'utf8')};
 const comments=await readIssueComments(repo,catalog.master_issue,token);
 const branches=await readPublishedBranches(repo,token);
 const chosen=chooseTask(catalog,ledgers,comments,branches);
 const fields=chosen.selected?{
  selected:'true',task:chosen.task.id,ledger:chosen.task.ledger,source:chosen.task.source,test:chosen.task.test,
  prior_failures:String(chosen.prior_failures)
 }:{selected:'false',task:'none',ledger:'none',source:'none',test:'none',prior_failures:'0'};
 for(const [k,v] of Object.entries(fields)){
  if(!/^[a-z_]+$/.test(k)||!/^[-A-Za-z0-9_/.]+$/.test(v))throw Error('UNSAFE_OUTPUT');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,k+'='+v+'\n');
 }
 console.log('SEC_AUTO_PLAN task='+fields.task+' selected='+fields.selected+' prior_failures='+fields.prior_failures);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('SEC_AUTO_PLAN_FAILED cause='+String(e.message).slice(0,90));process.exitCode=1});
