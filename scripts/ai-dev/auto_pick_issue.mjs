// Scheduled AI issue intake: only user-approved, existing, unchecked work.
// No operating writes, no auto approvals, no arbitrary task creation.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const CLAIM=/^\[AUTODEV:CLAIM backlog=([A-Z0-9-]+) issue=(\d+) run=(\d+) at=(\d{4}-\d\d-\d\dT[^\]]+)\]/;
const DAY=86400000;
const MAX_PAGES=4;
export function openBacklogIds(markdown){
 const rows=String(markdown||'').split(/\r?\n/), open=new Map();
 for(const row of rows){
  const m=row.match(/^\s*-\s*\[ \]\s+\*\*([A-Z][A-Z0-9-]{2,40})(?:\s+\((P[0-3])\))?/);
  if(m&&!open.has(m[1]))open.set(m[1],{id:m[1],priority:m[2]||'P3'});
 }
 return open;
}
export function backlogIsOpen(markdown,id){
 if(!/^[A-Z][A-Z0-9-]{2,40}$/.test(id))throw Error('INVALID_BACKLOG_ID');
 return openBacklogIds(markdown).has(id);
}
export function approvedCandidates(markdown,issues){
 const open=openBacklogIds(markdown), found=new Map();
 for(const issue of issues){
  if(!issue||!Number.isSafeInteger(issue.number)||issue.number<1||issue.state!=='open'||issue.pull_request)continue;
  if(!(issue.labels||[]).some(x=>x.name==='agent-approved'))continue;
  const id=String(issue.title||'').match(/^\[([A-Z][A-Z0-9-]{2,40})\]/)?.[1];
  if(!id||!open.has(id)||found.has(id))continue;
  found.set(id,{id,issue:issue.number,priority:open.get(id).priority});
 }
 return [...found.values()].sort((a,b)=>a.priority.localeCompare(b.priority)||a.issue-b.issue);
}
export function canSelect(candidate,issue,comments,branches,now=Date.now()){
 if(!issue||issue.number!==candidate.issue||issue.state!=='open'||issue.pull_request)return false;
 if(typeof issue.title!=='string'||!issue.title.startsWith('['+candidate.id+']'))return false;
 if(!(issue.labels||[]).some(x=>x.name==='agent-approved'))return false;
 if(!Array.isArray(comments)||!Array.isArray(branches))throw Error('UNTRUSTED_CHECKPOINTS');
 if(branches.some(b=>b.startsWith('agent/issue-'+candidate.issue+'-run-')))return false;
 const claims=comments.filter(c=>c.user?.login==='github-actions[bot]')
  .map(c=>String(c.body||'').match(CLAIM)).filter(m=>m&&m[1]===candidate.id&&Number(m[2])===candidate.issue)
  .map(m=>Date.parse(m[4])).filter(t=>Number.isFinite(t)&&t<=now);
 if(claims.some(t=>now-t<DAY))return false;
 // Bounded retries: a third attempt after cooldown may repair earlier failures.
 if(claims.filter(t=>now-t<7*DAY).length>=3)return false;
 return true;
}
export function pick(candidates,backlog,issues,comments,branches,now=Date.now()){
 for(const c of candidates){
  if(!backlogIsOpen(backlog,c.id))continue;
  if(canSelect(c,issues[c.issue],comments[c.issue]||[],branches,now))return c;
 }
 return null;
}
export async function chooseAndClaim({repo,token,run,backlog,fetchImpl=fetch,now=Date.now()}){
 if(repo!=='koith/attendance-proto'||!/^\d{1,15}$/.test(String(run)))throw Error('UNTRUSTED_REPOSITORY_RUN');
 if(!token)throw Error('MISSING_ISSUE_READ_TOKEN');
 const base='https://api.github.com/repos/'+repo;
 const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json',
  'content-type':'application/json','user-agent':'autodev-approved-backlog'};
 const api=async(path,method='GET',data)=>{
  const response=await fetchImpl(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),
   redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('BACKLOG_GITHUB_HTTP_'+response.status+'_'+path.split('?')[0].slice(0,72));
  return response.json();
 };
 const discovered=[];
 for(let page=1;page<=MAX_PAGES;page++){
  const rows=await api('/issues?state=open&labels=agent-approved&per_page=100&page='+page);
  if(!Array.isArray(rows))throw Error('INVALID_APPROVED_ISSUE_PAGE');
  discovered.push(...rows);
  if(rows.length<100)break;
  if(page===MAX_PAGES)throw Error('APPROVED_ISSUE_LIST_TRUNCATED');
 }
 const candidates=approvedCandidates(backlog,discovered);
 const issues={},comments={};
 for(const c of candidates){
  issues[c.issue]=await api('/issues/'+c.issue);
  const page=await api('/issues/'+c.issue+'/comments?per_page=100');
  if(!Array.isArray(page)||page.length>=100)throw Error('CLAIM_CHECKPOINT_HISTORY_UNBOUNDED');
  comments[c.issue]=page;
 }
 const branchRows=await api('/git/matching-refs/heads/agent/');
 if(!Array.isArray(branchRows)||branchRows.length>400)throw Error('UNTRUSTED_AGENT_BRANCH_REFS');
 const branches=branchRows.map(x=>String(x.ref||'').replace(/^refs\/heads\//,''));
 const task=pick(candidates,backlog,issues,comments,branches,now);
 if(!task)return {selected:false,reason:candidates.length?'ALL_MATCHES_COOLDOWN_OR_BRANCH_CONFLICT':'NO_APPROVED_OPEN_BACKLOG_ISSUES',
  discovered:discovered.length,matching:candidates.length};
 // A verified claim is mandatory before any AI runner starts. Never add approval labels.
 const body='[AUTODEV:CLAIM backlog='+task.id+' issue='+task.issue+' run='+run+' at='+new Date(now).toISOString()+']\n'+
 'code_scope=root-app-and-qa-only\noperating_write=false\naccepted_backlog_increment=0';
 const receipt=await api('/issues/'+task.issue+'/comments','POST',{body});
 if(!receipt.id)throw Error('CLAIM_RECEIPT_NOT_CONFIRMED');
 return {selected:true,id:task.id,issue:task.issue,discovered:discovered.length,matching:candidates.length};
}
async function main(){
 const e=process.env;
 const backlog=fs.readFileSync('PROJECT_BACKLOG_20261017.md','utf8');
 const result=await chooseAndClaim({repo:e.GITHUB_REPOSITORY,token:e.GITHUB_TOKEN,run:e.GITHUB_RUN_ID,backlog});
 if(!e.GITHUB_OUTPUT)throw Error('GITHUB_OUTPUT_MISSING');
 fs.appendFileSync(e.GITHUB_OUTPUT,'selected='+(result.selected?'true':'false')+'\nissue_number='+(result.issue||'')+'\n');
 const summary={selected:result.selected,issue:result.issue||null,task:result.id||null,
  reason:result.reason||null,discovered:result.discovered,matching:result.matching,
  accepted_tasks_increment:0};
 console.log('AUTODEV_REAL_BACKLOG_SELECTED '+JSON.stringify(summary));
 if(e.GITHUB_STEP_SUMMARY)fs.appendFileSync(e.GITHUB_STEP_SUMMARY,
 '### Automatic development intake\n'+
 (result.selected?'SELECTED '+result.id+' (#'+result.issue+')':'NO_WORK '+result.reason)+
 '\nApproved open issue count: '+result.discovered+
 '; unchecked ledger matches: '+result.matching+
 '; accepted completions: 0 (pending independent acceptance).\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('AUTODEV_SELECTION_FAILED '+String(e.message).slice(0,150));process.exitCode=1});
