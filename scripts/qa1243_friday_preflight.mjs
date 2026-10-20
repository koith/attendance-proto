// #1243 Friday 2026-10-23 opening hard gate. Read-only GitHub Actions evidence.
// Success for synthetic QA is NOT success for hosted Auth/SMTP or live Sheets.
// This code never creates a store/account, sends email, or writes to a Sheet.
import {mkdirSync,writeFileSync} from 'node:fs';

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
 if(latest.status!=='completed')return {id:spec.id,status:'FAIL',reason:'WORKFLOW_NOT_FINISHED',run_id:latest.id,phase:latest.status};
 if(latest.conclusion!=='success')return {id:spec.id,status:'FAIL',reason:'WORKFLOW_'+String(latest.conclusion||'UNKNOWN').toUpperCase(),run_id:latest.id};
 return {id:spec.id,status:'PASS',run_id:latest.id,head_sha:latest.head_sha,proof:spec.proof};
}
export function verdict(items,external=EXTERNAL_BLOCKERS){
 const failed=items.filter(x=>x.status!=='PASS');
 return {verdict:failed.length===0&&external.length===0?'PASS':'NO_GO',
  passed:items.length-failed.length,required:items.length,
  failed:failed.map(x=>x.id),external:external.map(x=>x.id)};
}
async function fetchWorkflowRuns(repo,wf,token){
 const u='https://api.github.com/repos/'+repo+'/actions/workflows/'+encodeURIComponent(wf)+'/runs?branch=main&per_page=20';
 const r=await fetch(u,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
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
 const decision=verdict(items);
 const result={at:new Date().toISOString(),repo,sha,prelaunchDeadline:'2026-10-22 KST end of business',
  plannedOpening:'2026-10-23 KST morning',environment:'GitHub Actions public run evidence only',
  pendingFridayOnly:['actual provided store name/code','real owner email delivery/acceptance and first login'],
  rules:'FAIL-CLOSED: no simulated, read-only, metadata, or HTTP403 outcome can replace live production Edge->QA GAS->Sheets',
  ...decision,items,externalBlockers:EXTERNAL_BLOCKERS};
 mkdirSync('qa-results',{recursive:true});
 writeFileSync('qa-results/friday-opening-readiness.json',JSON.stringify(result,null,2)+'\n');
 let lines=['# QA1243 2026-10-23 Friday prelaunch readiness','','**'+decision.verdict+'** — '+decision.passed+'/'+decision.required+' workflow evidence; hosted external blockers '+EXTERNAL_BLOCKERS.length,
  '','| Gate | Status | Evidence or reason |','|---|---|---|'];
 for(const x of items)lines.push('| '+x.id+' | '+x.status+' | '+(x.run_id?('run #'+x.run_id+' '):'')+(x.reason||x.proof||'')+' |');
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
