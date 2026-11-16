// Trusted GitHub Actions publish stage: safe review PR creation or connector bridge.
// Never merges or marks security tasks complete. No production credentials/data.
import {pathToFileURL} from 'node:url';
import {upsertNote} from '../../issue_state_note.mjs';

const shaPattern=/^[a-f0-9]{40}$/;
const taskPattern=/^(?:SEC-S\d\d|AISEC-\d\d)-[A-Z0-9-]{3,40}$/;
export function validateContext({repo,task,branch,head,run}) {
 if(repo!=='koith/attendance-proto'||!taskPattern.test(task||'')||!/^\d{1,15}$/.test(String(run))||!shaPattern.test(head||''))throw Error('INVALID_HANDOFF_CONTEXT');
 if(branch!=='sec-autopilot/'+task+'-run-'+run)throw Error('BRANCH_RUN_BINDING_MISMATCH');
}
export async function ensureReviewPR(context,fetchImpl=fetch) {
 validateContext(context);
 const {repo,task,branch,head,run,token}=context;
 if(!token)throw Error('MISSING_PUBLISH_TOKEN');
 const base='https://api.github.com/repos/'+repo;
 const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'sec-recovery-autopilot'};
 const call=async(path,options={})=>{
  const response=await fetchImpl(base+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(15000)});
  let value=null;try{value=await response.json()}catch{}
  return {status:response.status,data:value};
 };
 const remote=await call('/git/ref/heads/'+branch);
 if(remote.status!==200||!shaPattern.test(remote.data?.object?.sha||'')||remote.data.object.sha!==head)throw Error('PUBLISHED_BRANCH_SHA_MISMATCH');
 const existing=async()=>{
  const p=await call('/pulls?state=open&head=koith%3A'+encodeURIComponent(branch)+'&base=main&per_page=100');
  if(p.status!==200||!Array.isArray(p.data))throw Error('PR_EXISTENCE_CHECK_FAILED');
  return p.data.find(x=>x.head?.sha===head&&x.base?.ref==='main')||null;
 };
 let pr=await existing(),result='PR_OPEN';
 if(!pr){
  const body={title:'security(autopilot): '+task+' isolated regression',head:branch,base:'main',draft:false,
   body:'Review-only synthetic security QA proposal. Task '+task+', source run '+run+', immutable head '+head+'. Do not treat PR as operating-security completion. Merge only after independent CI and exact diff/permissions review.'};
  const attempt=await call('/pulls',{method:'POST',body:JSON.stringify(body)});
  if(attempt.status===201&&attempt.data?.number&&attempt.data.head?.sha===head)pr=attempt.data;
  else if([403,422].includes(attempt.status)){
   pr=await existing();
   if(!pr)result='BRIDGE_REQUIRED';
  }else throw Error('PR_CREATION_UNEXPECTED_STATUS_'+attempt.status);
 }
 // Update one bot-owned per-task status note. The PR and run URL are the audit trail.
 const note=await upsertNote({repo,issue:1492,token,
   key:'SEC_HANDOFF_'+task,run,fetchImpl,
   fields:{status:result,task,branch,head,pr_number:String(pr?.number||0),
     evidence:pr?.html_url||'https://github.com/'+repo+'/actions/runs/'+run,
     operating_changes:'false',reason:pr?'NONE':'GITHUB_ACTIONS_PR_CREATE_UNAVAILABLE'}});
 if(!['CREATED','UPDATED','UNCHANGED'].includes(note.result))throw Error('CHECKPOINT_NOTE_UNCONFIRMED');
 return {result,prNumber:pr?.number||null,branch};
}
async function main(){
 const e=process.env;
 const result=await ensureReviewPR({repo:e.GITHUB_REPOSITORY,task:e.SEC_AUTO_TASK,branch:e.SEC_AUTO_BRANCH,head:e.SEC_AUTO_HEAD,run:e.GITHUB_RUN_ID,token:e.GH_TOKEN});
 console.log('SEC_AUTO_HANDOFF result='+result.result+' task='+e.SEC_AUTO_TASK+' pr_number='+(result.prNumber||'none'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('SEC_AUTO_HANDOFF_FAILED cause='+String(e.message).slice(0,110));process.exitCode=1});
