import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {githubClient} from './github.mjs';
import {liveSource} from './evidence-source.mjs';
import {automationManifest} from './manifest.mjs';
import {evaluate} from './acceptance.mjs';
export async function report(repository,releaseSha,{api=githubClient(repository),source=liveSource(repository,{api})}={}) {
 if(!/^[a-f0-9]{40}$/.test(releaseSha))throw Error('INVALID_RELEASE_SHA');
 const prs=await api(`/commits/${releaseSha}/pulls?per_page=100`);
 const merged=prs.filter(p=>p.merged_at&&p.merge_commit_sha===releaseSha&&p.base?.ref==='main'&&p.title?.includes('[AI1331]'));
 if(merged.length!==1)return {mode:'report-only',status:'CANNOT_VERIFY',reason:'NO_UNIQUE_AI1331_RELEASE_PR',sha:releaseSha};
 const pr=await source.pr(merged[0].number);
 const manifest=automationManifest({repository,issue:1331,pr:pr.number,head_sha:pr.head.sha,release_sha:releaseSha});
 const proofs=[];
 for(const [sha,event,ids] of [[pr.head.sha,'pull_request',['unit','integration']],[releaseSha,'push',['deployment','post-deploy']]]){
  const list=await api(`/actions/workflows/work-orchestrator.yml/runs?head_sha=${sha}&event=${event}&per_page=100`);
  const runs=(list.workflow_runs||[]).filter(r=>r.head_sha===sha&&r.event===event).sort((a,b)=>b.id-a.id);
  const run=runs[0];if(!run)continue;
  const artifacts=await api(`/actions/runs/${run.id}/artifacts?per_page=100`);
  if(artifacts.total_count>100)throw Error('ARTIFACT_LIST_TRUNCATED');
  for(const check of ids){
   const name=`ai-dev-${check==='unit'||check==='integration'?'qa':'installed'}-${run.id}-${run.run_attempt}`;
   const found=artifacts.artifacts.filter(a=>a.name===name&&!a.expired);
   if(found.length===1)proofs.push({check,run_id:run.id,artifact_id:found[0].id});
  }
 }
 return evaluate(manifest,proofs,source);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const repository=process.env.GITHUB_REPOSITORY||process.argv[2];
 const event=process.env.GITHUB_EVENT_PATH?JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):{};
 const sha=process.argv[3]||event.workflow_run?.head_sha||process.env.GITHUB_SHA;
 try{console.log(JSON.stringify(await report(repository,sha),null,2));}
 catch(e){console.log(JSON.stringify({mode:'report-only',status:'CANNOT_VERIFY',reason:e.message}));}
 // Deliberately report-only: never dispatch, mutate a release or gate existing deploys.
}
