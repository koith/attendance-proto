// #1243 Friday 2026-10-23 opening hard gate. Read-only GitHub Actions evidence.
// Success for synthetic QA is NOT success for hosted Auth/SMTP or live Sheets.
// This code never creates a store/account, sends email, or writes to a Sheet.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const REQUIRED = Object.freeze([
 {id:'STORE_E2E',workflow:'store-opening-full-journey.yml',proof:'isolated PostgreSQL/browser onboarding-to-payroll/recipe'},
 {id:'MANAGER_POSTGRES',workflow:'store-delegated-manager-postgres.yml',proof:'disposable PostgreSQL manager role/revoke'},
 {id:'HQ_STORE_POSTGRES',workflow:'hq-store-onboarding-postgres-integration.yml',proof:'disposable PostgreSQL HQ register/READY/duplicate boundaries'},
 {id:'TEST_MAIL_GOTRUE',workflow:'qa1243-gotrue-mailpit-live.yml',proof:'real isolated GoTrue HTTP and Mailpit SMTP (not hosted mail)'},
 {id:'HOSTED_AUTH_READ',workflow:'qa1243-operational-readonly.yml',proof:'hosted Supabase SMTP/Auth config read-only (not mail delivery)'},
 {id:'LIVE_EDGE_GAS_SHEETS',workflow:'qa1243-live-e2e.yml',proof:'real production Edge -> dedicated QA GAS -> Sheets readback'},
 {id:'PAGES_PUBLISH',workflow:'p0-pages-deploy.yml',proof:'actual main Pages publish',sameSha:true},
 {id:'INDEPENDENT_PAGES',workflow:'verified-pages-deployment-notification.yml',proof:'independent main deployment verification',sameSha:true}
]);
export const EXTERNAL_BLOCKERS = Object.freeze([
 {id:'HOSTED_TEST_MAIL_RECEIPT',reason:'No evidence yet for hosted Auth actual invitation delivery and test mailbox round-trip; isolated Mailpit does not prove it'},
 {id:'STORE_MANAGER_LIVE_SESSION',reason:'No verified hosted store manager invite/accept/role-revoke session E2E; isolated or fake JWT does not prove it'},
 {id:'PRODUCTION_PREPOST_DATA_PROOF',reason:'A production read-only before/after evidence receipt and authorized target-scoped operation checks must be reviewed before final PASS'}
]);
export function classifyWorkflow(spec,runs,sha,now=Date.now()){
 if(!Array.isArray(runs))return {id:spec.id,status:'FAIL',reason:'WORKFLOW_RUN_LIST_INVALID'};
 const list=runs.filter(r=>r?.head_branch==='main'&&(r?.event==='push'||r?.event==='workflow_dispatch'||r?.event==='workflow_run'))
   .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
 const latest=list[0];
 if(!latest)return {id:spec.id,status:'FAIL',reason:'NO_MAIN_RUN'};
 const at=Date.parse(latest.created_at||'');
 if(!Number.isFinite(at)||at>now+60000||now-at>7*24*3600000)
   return {id:spec.id,status:'FAIL',reason:'RUN_STALE_OR_INVALID_DATE',run_id:latest.id};
 if(spec.sameSha&&latest.head_sha!==sha)return {id:spec.id,status:'FAIL',reason:'OTHER_MAIN_SHA',run_id:latest.id,head_sha:latest.head_sha};
 // A QA-only main push deliberately SKIPS Pages publication and the operating
 // Sheet sync. A green workflow gate is not proof of a real Pages release.
 const qaSkip='[QA1243-NO-OPERATING-WRITE]';
 const qaOnly=String(latest.head_commit?.message||'').includes(qaSkip) ||
   String(latest.display_title||'').includes(qaSkip);
 if((spec.id==='PAGES_PUBLISH'||spec.id==='INDEPENDENT_PAGES')&&qaOnly)
   return {id:spec.id,status:'FAIL',reason:'QA_ONLY_PUSH_NO_PAGES_PUBLICATION',run_id:latest.id};

 if(latest.status!=='completed')return {id:spec.id,status:'FAIL',reason:'WORKFLOW_NOT_FINISHED',run_id:latest.id,phase:latest.status};
 if(latest.conclusion!=='success')return {id:spec.id,status:'FAIL',reason:'WORKFLOW_'+String(latest.conclusion||'UNKNOWN').toUpperCase(),run_id:latest.id};
 // A successful scope/static run can deliberately skip every Google request.
 // The real execution steps and source ancestry must be verified separately.
 if(spec.id==='LIVE_EDGE_GAS_SHEETS')return {id:spec.id,status:'FAIL',reason:'LIVE_EXECUTION_PROOF_REQUIRED',run_id:latest.id};
 return {id:spec.id,status:'PASS',run_id:latest.id,head_sha:latest.head_sha,proof:spec.proof};
}
// The official Store opening full journey workflow already runs BOTH HQ and
// delegated manager SQL fixtures in distinct disposable PostgreSQL databases.
// Accept that stronger integrated evidence instead of repeating old dedicated
// workflow runs. Only missing/stale dedicated evidence may be substituted;
// an explicit newer standalone FAIL is never overridden by older green.
export function reconcileIntegratedSqlEvidence(items,source){
 const complete=items.find(x=>x.id==='STORE_E2E'&&x.status==='PASS');
 if(!complete)return items;
 const validates=source.includes('set -euo pipefail')&&source.includes('exit 1')&&
  source.includes('Run isolated SQL fixtures; never connect to Supabase production');
 if(!validates)return items;
 const mapping={HQ_STORE_POSTGRES:'qa_hq_store_onboarding_postgres_integration.sql',
  MANAGER_POSTGRES:'qa_store_delegated_manager_postgres.sql'};
 return items.map(item=>{
  const fixture=mapping[item.id];
  if(!fixture||item.status==='PASS'||
     !['NO_MAIN_RUN','RUN_STALE_OR_INVALID_DATE'].includes(item.reason)||
     !source.includes(fixture))return item;
  return {id:item.id,status:'PASS',run_id:complete.run_id,head_sha:complete.head_sha,
   proof:'integrated successful disposable PostgreSQL fixture '+fixture};
 });
}
// The special approved v0.354 publish intentionally skips normal Pages and
// operating Sheet jobs. The old gate examined ONLY normal workflow names and
// incorrectly called this real, verified Pages publication a failure.
// Never accept a workflow's green conclusion alone: require BOTH successful
// publishing + independent readback job steps and exact live app asset bytes.
export function reconcileSafePagesEvidence(items,receipt){
 if(!receipt?.published?.run_id||!receipt?.independent?.run_id||
    receipt.published.head_sha!==receipt.independent.head_sha||
    receipt.published.head_sha?.length!==40||
    receipt.published.verified!==true||receipt.independent.verified!==true||
    receipt.liveHashMatch!==true||
    !['index.html','hq_store_onboarding_ui.js','operations_v1.js'].every(name=>
      /^[a-f0-9]{64}$/.test(receipt.assetSha256?.[name]||'')))return items;
 return items.map(item=>{
  const source=item.id==='PAGES_PUBLISH'?receipt.published:
    item.id==='INDEPENDENT_PAGES'?receipt.independent:null;
  if(!source)return item;
  return {id:item.id,status:'PASS',run_id:source.run_id,
    head_sha:source.head_sha,proof:'verified safe Pages job, independent public HTTP readback, exact current source asset SHA256',
    assetSha256:receipt.assetSha256};
 });
}
async function fetchRunJobs(repo,runId,token,fetcher=fetch){
 const u='https://api.github.com/repos/'+repo+'/actions/runs/'+runId+'/jobs?per_page=100';
 const r=await fetcher(u,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
   'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('ACTIONS_JOBS_READ_HTTP_'+r.status);
 const data=await r.json();
 if(data.total_count>100||!Array.isArray(data.jobs))throw Error('ACTIONS_JOBS_UNVERIFIABLE');
 return data.jobs;
}
const GOOGLE_JOB='Trusted production Edge to a new independent GAS project and Sheets';
const GOOGLE_EXEC='Execute real new GAS project and production Edge service-to-service QA';
const GOOGLE_ATTEST='Await verified native production Edge deployment of this exact revision';
const GOOGLE_VALIDATE='Validate integration runner and OIDC isolation contract';
const GOOGLE_INPUTS=new Set(['apps_script.gs','scripts/qa1243_live_edge_gas_sheets.mjs',
 'scripts/qa1243_build_isolated_gas.mjs','scripts/qa1243_oauth_scopes.mjs']);
const googleInput=path=>GOOGLE_INPUTS.has(path)||
 ['supabase/functions/server-sync-sheet/','edge-release/supabase/functions/server-sync-sheet/'].some(p=>String(path||'').startsWith(p));
// The only reviewed change after the user's successful real run removes free
// text from FAILURE logs. The execution/success path is unchanged. Pin both
// the original proof revision and the exact resulting runner blob; a later
// change, renamed source, or another historical run cannot use this exception.
const LOGGING_REVIEW={run:39781031886,sha:'50690f26e31b5ef9ae9bce830fcdd17bd4dd6551',
 runnerBlob:'c516cde85456f0438e84794e0d4213651e1668e4'};
export async function verifyGoogleOnLiveMain(repo,token,sha,fetcher=fetch,now=Date.now()){
 const spec=REQUIRED.find(x=>x.id==='LIVE_EDGE_GAS_SHEETS');
 const runs=await fetchWorkflowRuns(repo,spec.workflow,token,fetcher);
 const classified=classifyWorkflow(spec,runs,sha,now);
 if(classified.reason!=='LIVE_EXECUTION_PROOF_REQUIRED')return classified;
 const candidates=runs.filter(r=>r?.head_branch==='main'&&['push','workflow_dispatch','workflow_run'].includes(r.event))
  .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
 for(const run of candidates.slice(0,20)){
  const jobs=await fetchRunJobs(repo,run.id,token,fetcher);
  const job=jobs.find(x=>x.name===GOOGLE_JOB);
  const step=job?.steps?.find(x=>x.name===GOOGLE_EXEC);
  if(!step||step.conclusion==='skipped')continue;
  if(step.conclusion!=='success'||job.conclusion!=='success')
   return {id:spec.id,status:'FAIL',reason:'LATEST_REAL_GOOGLE_EXECUTION_NOT_SUCCESS',run_id:run.id};
  const prior=classifyWorkflow({...spec,id:'REAL_GOOGLE_CANDIDATE'},[run],sha,now);
  if(prior.status!=='PASS')return {...prior,id:spec.id};
  if(!completedJob(jobs,GOOGLE_JOB,GOOGLE_ATTEST)||!completedJob(jobs,GOOGLE_JOB,GOOGLE_VALIDATE))
   return {id:spec.id,status:'FAIL',reason:'REAL_GOOGLE_ATTESTATION_OR_VALIDATION_MISSING',run_id:run.id};
  if(!/^[a-f0-9]{40}$/.test(run.head_sha||'')||!Number.isSafeInteger(run.id))throw Error('GOOGLE_PROOF_REVISION_INVALID');
  const response=await fetcher('https://api.github.com/repos/'+repo+'/compare/'+run.head_sha+'...'+sha,
   {headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('GOOGLE_PROOF_COMPARE_HTTP_'+response.status);
  const comparison=await response.json();
  if(!['ahead','identical'].includes(comparison.status)||comparison.merge_base_commit?.sha!==run.head_sha||
     !Array.isArray(comparison.files)||comparison.files.length>=300)
   return {id:spec.id,status:'FAIL',reason:'GOOGLE_PROOF_ANCESTRY_OR_DIFF_UNVERIFIED',run_id:run.id};
  let reviewedLogging=false;
  for(const file of comparison.files){
   if(!googleInput(file.filename)&&!googleInput(file.previous_filename))continue;
   if(file.filename==='scripts/qa1243_live_edge_gas_sheets.mjs'&&file.status==='modified'&&
      !file.previous_filename&&run.id===LOGGING_REVIEW.run&&run.head_sha===LOGGING_REVIEW.sha&&file.sha===LOGGING_REVIEW.runnerBlob){
    reviewedLogging=true;continue;
   }
   return {id:spec.id,status:'FAIL',reason:'GOOGLE_EXECUTION_SOURCE_CHANGED',run_id:run.id,path:file.filename};
  }
  return {id:spec.id,status:'PASS',run_id:run.id,head_sha:run.head_sha,current_head_sha:sha,
   proof:'actual successful Edge attestation and GAS/Sheets execution; GitHub source ancestry verified',
   reuse_basis:reviewedLogging?'REVIEWED_FAILURE_LOGGING_ONLY':'UNCHANGED_GOOGLE_EXECUTION_SOURCES',googleE2ERepeated:false};
 }
 return {id:spec.id,status:'FAIL',reason:'NO_SUCCESSFUL_REAL_GOOGLE_EXECUTION_PROOF'};
}
function completedJob(jobs,name,step){
 return jobs.some(job=>job.name===name&&job.conclusion==='success'&&
  job.steps?.some(x=>x.name===step&&x.conclusion==='success'));
}
async function verifySafePagesOnLiveMain(repo,token){
 const [publishes,readbacks]=await Promise.all([
   fetchWorkflowRuns(repo,'p0-pages-deploy.yml',token),
   fetchWorkflowRuns(repo,'qa1243-owner-ready-pages-independent.yml',token)
 ]);
 const marker='[QA1243-NO-OPERATING-WRITE]';
 const app='[QA1243-APP-PAGES]';
 const eligible=x=>x?.head_branch==='main'&&x.status==='completed'&&x.conclusion==='success'&&
   String(x.head_commit?.message||'').includes(marker)&&String(x.head_commit?.message||'').includes(app);
 const recent=(publishes||[]).filter(eligible).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 for(const published of recent.slice(0,5)){
  const independent=(readbacks||[]).find(x=>eligible(x)&&x.head_sha===published.head_sha&&x.event==='workflow_run');
  if(!independent)continue;
  const [jobs,independentJobs]=await Promise.all([
   fetchRunJobs(repo,published.id,token),fetchRunJobs(repo,independent.id,token)
  ]);
  const publishPass=completedJob(jobs,'QA1243 isolated Safari Pages publish (no operating Sheet write)',
      'Confirm public v0.354 HQ readiness UI and unchanged other operating assets');
  const independentPass=completedJob(independentJobs,
    'Independently check published HQ app version without operating writes',
    'Independent HTTP readback of live index.html and owner-ready JS digest');
  if(!publishPass||!independentPass)continue;
  const hash={};let allMatch=true;
  for(const name of ['index.html','hq_store_onboarding_ui.js','operations_v1.js']){
   const u='https://koith.github.io/attendance-proto/'+name+'?qa1243_prelaunch_readback='+Date.now();
   const r=await fetch(u,{redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
   if(r.status!==200){allMatch=false;break;}
   const expected=createHash('sha256').update(readFileSync(name)).digest('hex');
   const actual=createHash('sha256').update(await r.text()).digest('hex');
   hash[name]=actual;
   if(expected!==actual){allMatch=false;break;}
  }
  return {published:{run_id:published.id,head_sha:published.head_sha,verified:publishPass},
   independent:{run_id:independent.id,head_sha:independent.head_sha,verified:independentPass},
   liveHashMatch:allMatch,assetSha256:hash};
 }
 return null;
}

export function verdict(items,external=EXTERNAL_BLOCKERS){
 const failed=items.filter(x=>x.status!=='PASS');
 return {verdict:failed.length===0&&external.length===0?'PASS':'NO_GO',
  passed:items.length-failed.length,required:items.length,
  failed:failed.map(x=>x.id),external:external.map(x=>x.id)};
}
async function fetchWorkflowRuns(repo,wf,token,fetcher=fetch){
 const u='https://api.github.com/repos/'+repo+'/actions/workflows/'+encodeURIComponent(wf)+'/runs?branch=main&per_page=20';
 const r=await fetcher(u,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('ACTIONS_READ_HTTP_'+r.status+' for '+wf);
 const data=await r.json();return data.workflow_runs;
}
export async function liveGate(env=process.env){
 const repo=env.GITHUB_REPOSITORY,sha=env.GITHUB_SHA,token=env.GITHUB_TOKEN;
 if(repo!=='koith/attendance-proto'||!(/^[a-f0-9]{40}$/i).test(sha||'')||!token)
   throw Error('TRUSTED_MAIN_ACTIONS_READ_CONTEXT_REQUIRED');
 const items=[];
 for(const spec of REQUIRED){
  try{
   items.push(classifyWorkflow(spec,await fetchWorkflowRuns(repo,spec.workflow,token),sha));
  }catch(error){items.push({id:spec.id,status:'FAIL',reason:String(error?.message||error).slice(0,150)})}
 }
 try{
  const google=await verifyGoogleOnLiveMain(repo,token,sha);
  items[items.findIndex(x=>x.id==='LIVE_EDGE_GAS_SHEETS')]=google;
 }catch(error){
  items[items.findIndex(x=>x.id==='LIVE_EDGE_GAS_SHEETS')]=
   {id:'LIVE_EDGE_GAS_SHEETS',status:'FAIL',reason:String(error?.message||error).slice(0,150)};
 }
 let auditedItems=reconcileIntegratedSqlEvidence(items,readFileSync('.github/workflows/store-opening-full-journey.yml','utf8'));
 try{
  const livePages=await verifySafePagesOnLiveMain(repo,token);
  auditedItems=reconcileSafePagesEvidence(auditedItems,livePages);
 }catch(error){
  // Never promote a Pages workflow failure into an opening PASS.
  console.error('QA1243_SAFE_PAGES_READBACK_UNVERIFIED',String(error?.message||error).slice(0,130));
 }
 const decision=verdict(auditedItems);
 const result={at:new Date().toISOString(),repo,sha,prelaunchDeadline:'2026-10-22 KST end of business',
  plannedOpening:'2026-10-23 KST morning',environment:'GitHub Actions public run evidence only',
  pendingFridayOnly:['actual provided store name/code','real owner email delivery/acceptance and first login'],
  rules:'FAIL-CLOSED: no simulated, read-only, metadata, or HTTP403 outcome can replace live production Edge->QA GAS->Sheets',
  ...decision,items:auditedItems,externalBlockers:EXTERNAL_BLOCKERS};
 mkdirSync('qa-results',{recursive:true});
 writeFileSync('qa-results/friday-opening-readiness.json',JSON.stringify(result,null,2)+'\n');
 let lines=['# QA1243 2026-10-23 Friday prelaunch readiness','','**'+decision.verdict+'** — '+decision.passed+'/'+decision.required+' workflow evidence; hosted external blockers '+EXTERNAL_BLOCKERS.length,
  '','| Gate | Status | Evidence or reason |','|---|---|---|'];
 for(const x of auditedItems)lines.push('| '+x.id+' | '+x.status+' | '+(x.run_id?('run #'+x.run_id+' '):'')+(x.reason||x.proof||'')+' |');
 lines.push('','## External / field proof missing',...EXTERNAL_BLOCKERS.map(x=>'- '+x.id+': '+x.reason),
  '','Friday-only real store identity and actual owner email are intentionally not requested until explicit approval.');
 writeFileSync('qa-results/friday-opening-readiness.md',lines.join('\n')+'\n');
 console.log('QA1243_FRIDAY_OPENING_'+decision.verdict+' '+JSON.stringify({sha,passed:decision.passed,required:decision.required,
   failures:decision.failed,external:decision.external}));
 return result;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/qa1243_friday_preflight.mjs')){
 if(process.argv.includes('--live'))liveGate().then(x=>{if(x.verdict!=='PASS')process.exitCode=1})
  .catch(e=>{console.error('QA1243_FRIDAY_PRELAUNCH_FAIL_CLOSED',String(e));process.exitCode=1});
 else console.error('Use --live from trusted workflow or import for synthetic unit tests');
}
