// Independent acceptance: a manifest is intent, API observations are evidence.
const stages=['unit','integration','merge','deployment','post_deploy','manual'];
const sha=/^[a-f0-9]{40}$/;
export function validateManifest(m) {
 if(m.version!==1||!/^[-\w.]+\/[-\w.]+$/.test(m.repository)||!Number.isSafeInteger(m.issue)||m.issue<1)throw Error('INVALID_MANIFEST_IDENTITY');
 if(!sha.test(m.head_sha)||!sha.test(m.release_sha)||!Number.isSafeInteger(m.pr)||m.pr<1)throw Error('INVALID_RELEASE_IDENTITY');
 if(!Array.isArray(m.release_scope)||!m.release_scope.length||new Set(m.release_scope).size!==m.release_scope.length||m.release_scope.some(s=>!['automation','pages','edge','sheets','auth'].includes(s)))throw Error('INVALID_RELEASE_SCOPE');
 if(!Array.isArray(m.checks)||!m.checks.length||new Set(m.checks.map(c=>c.id)).size!==m.checks.length)throw Error('EMPTY_OR_DUPLICATE_CHECKS');
 for(const c of m.checks){
  if(!/^[a-z0-9-]{1,80}$/.test(c.id)||!c.requirement?.trim()||!stages.includes(c.stage)||!['isolated','production','repository'].includes(c.environment))throw Error('INVALID_CHECK');
  if(!['head','release'].includes(c.revision)||!m.release_scope.includes(c.scope))throw Error('INVALID_CHECK_SCOPE');
  let u;try{u=new URL(c.target_url);}catch{throw Error('INVALID_TARGET_URL');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('INVALID_TARGET_URL');
  if(c.stage!=='merge'&&c.stage!=='manual'&&(!/^\.github\/workflows\/[a-z0-9-]+\.yml$/.test(c.workflow)||!c.job?.trim()||!c.step?.trim()))throw Error('WORKFLOW_JOB_STEP_REQUIRED');
  if(c.stage==='post_deploy'&&!c.after)throw Error('DEPLOYMENT_DEPENDENCY_REQUIRED');
 }
 for(const stage of ['unit','integration','merge','deployment','post_deploy'])if(!m.checks.some(c=>c.stage===stage))throw Error('MISSING_STAGE_'+stage);
 for(const scope of m.release_scope)if(!m.checks.some(c=>c.scope===scope&&c.stage==='deployment'))throw Error('MISSING_DEPLOYMENT_SCOPE');
 for(const c of m.checks.filter(c=>c.after))if(!m.checks.some(d=>d.id===c.after&&d.stage==='deployment'&&d.scope===c.scope))throw Error('INVALID_DEPLOYMENT_DEPENDENCY');
 return m;
}
const verdict=(id,status,reason,extra={})=>({id,status,reason,...extra});
export async function evaluate(m,proofs,source,{now=Date.now(),maxAgeMs=7*86400000}={}) {
 validateManifest(m);
 if(!Array.isArray(proofs)||new Set(proofs.map(p=>p.check)).size!==proofs.length||proofs.some(p=>!m.checks.some(c=>c.id===p.check)))throw Error('INVALID_OR_DUPLICATE_PROOFS');
 const results=[];
 let pr;
 try{pr=await source.pr(m.pr);}catch{/* all PR identity dependent checks fail closed below */}
 const prValid=pr?.number===m.pr&&pr.merged===true&&pr.base?.ref==='main'&&pr.base?.repo?.full_name===m.repository&&pr.head?.repo?.full_name===m.repository&&pr.head?.sha===m.head_sha&&pr.merge_commit_sha===m.release_sha&&Number.isFinite(Date.parse(pr.merged_at));
 for(const c of m.checks){
  const expectedSha=c.revision==='head'?m.head_sha:m.release_sha;
  const p=proofs.find(p=>p.check===c.id);
  if(c.stage==='manual'){
   results.push(verdict(c.id,'CANNOT_VERIFY','MANUAL_APPROVAL_OR_CONSENT_REQUIRED; never auto-pass'));continue;
  }
  if(c.stage==='merge'){
   results.push(verdict(c.id,prValid?'PASS':'CANNOT_VERIFY',prValid?'MERGED_PR_IDENTITY_VERIFIED':'MERGE_SHA_OR_PR_NOT_VERIFIED',{sha:m.release_sha,url:pr?.html_url}));continue;
  }
  if(!p){results.push(verdict(c.id,'CANNOT_VERIFY','MISSING_PROOF'));continue;}
  if(!Number.isSafeInteger(p.run_id)||p.run_id<1||!Number.isSafeInteger(p.artifact_id)||p.artifact_id<1){results.push(verdict(c.id,'CANNOT_VERIFY','INVALID_EVIDENCE_ID'));continue;}
  try{
   const run=await source.run(p.run_id);
   if(run.id!==p.run_id||run.repository?.full_name!==m.repository||run.head_sha!==expectedSha||run.path!==c.workflow||!['push','pull_request','workflow_dispatch','workflow_run'].includes(run.event)){
    results.push(verdict(c.id,'FAIL','RUN_IDENTITY_SHA_OR_WORKFLOW_MISMATCH'));continue;
   }
   if(run.status!=='completed'||run.conclusion!=='success'){
    results.push(verdict(c.id,run.conclusion==='failure'?'FAIL':'CANNOT_VERIFY','RUN_NOT_SUCCESS'));continue;
   }
   const jobs=await source.jobs(p.run_id,run.run_attempt);
   const matches=jobs.filter(j=>j.name===c.job);
   const job=matches.length===1?matches[0]:null;
   const steps=job?.steps?.filter(s=>s.name===c.step)||[];
   if(job?.conclusion!=='success'||steps.length!==1||steps[0].conclusion!=='success'){
    results.push(verdict(c.id,job?.conclusion==='failure'||steps[0]?.conclusion==='failure'?'FAIL':'CANNOT_VERIFY','EXACT_JOB_STEP_NOT_SUCCESS'));continue;
   }
   // source.receipt must obtain the artifact from GitHub, never from the submitted
   // proof JSON. A run can succeed while deployment or testing was skipped.
   const receipt=await source.receipt(p.artifact_id,run,c.id);
   if(receipt.version!==1||receipt.issue!==m.issue||receipt.repository!==m.repository||receipt.run_id!==run.id||receipt.run_attempt!==run.run_attempt||receipt.sha!==expectedSha||receipt.check!==c.id||receipt.environment!==c.environment||receipt.target_url!==c.target_url||receipt.stage!==c.stage||receipt.scope!==c.scope){
    results.push(verdict(c.id,'FAIL','RECEIPT_SHA_ENVIRONMENT_URL_OR_SCOPE_MISMATCH'));continue;
   }
   const at=Date.parse(receipt.at),start=Date.parse(run.run_started_at),end=Date.parse(run.updated_at);
   if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(receipt.at)||!Number.isFinite(at)||!Number.isFinite(start)||!Number.isFinite(end)||at<start||at>end||at>now+60000||now-at>maxAgeMs){
    results.push(verdict(c.id,'FAIL','STALE_OR_INVALID_PROOF_TIME'));continue;
   }
   if(receipt.status!=='PASS'){
    results.push(verdict(c.id,receipt.status==='FAIL'?'FAIL':'CANNOT_VERIFY','MEASUREMENT_NOT_PASS'));continue;
   }
   if(['deployment','post_deploy'].includes(c.stage)&&(!prValid||expectedSha!==m.release_sha||run.event==='pull_request'||Date.parse(pr.merged_at)>at)){
    results.push(verdict(c.id,'FAIL','RELEASE_NOT_MERGED_OR_WRONG_REVISION'));continue;
   }
   results.push(verdict(c.id,'PASS','LIVE_RUN_JOB_AND_RECEIPT_VERIFIED',{at:receipt.at,sha:expectedSha,run_id:run.id,run_attempt:run.run_attempt,environment:c.environment,target_url:c.target_url,url:run.html_url}));
  }catch(error){results.push(verdict(c.id,'CANNOT_VERIFY',error.message||'EVIDENCE_UNAVAILABLE'));}
 }
 for(const c of m.checks.filter(c=>c.stage==='post_deploy')){
  const r=results.find(r=>r.id===c.id),dep=results.find(r=>r.id===c.after);
  if(r.status==='PASS'&&(dep?.status!=='PASS'||Date.parse(r.at)<Date.parse(dep.at)))Object.assign(r,{status:'FAIL',reason:'POST_DEPLOY_BEFORE_OR_WITHOUT_DEPLOYMENT'});
 }
 const pass=stage=>m.checks.filter(c=>c.stage===stage).every(c=>results.find(r=>r.id===c.id).status==='PASS');
 const accepted=results.every(r=>r.status==='PASS');
 const status=accepted?'PASS':results.some(r=>r.status==='FAIL')?'FAIL':'CANNOT_VERIFY';
 const state=accepted?'ACCEPTED':pass('unit')&&pass('integration')?(pass('merge')?(pass('deployment')?'DEPLOYED':'MERGED'):'CODE_VERIFIED'):'IN_PROGRESS';
 return {version:1,issue:m.issue,repository:m.repository,mode:'report-only',provenance:source.provenance||'synthetic',status,state,release_scope:m.release_scope,results};
}
