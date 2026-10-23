import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,validateManifest} from './acceptance.mjs';
export function fixture(){
 const head='a'.repeat(40),release='b'.repeat(40),at='2026-10-23T15:00:00Z';
 const manifest={version:1,repository:'koith/attendance-proto',issue:1331,pr:1333,head_sha:head,release_sha:release,release_scope:['automation'],checks:
  ['unit','integration','merge','deployment','post_deploy'].map(stage=>({id:stage.replace('_','-'),requirement:stage,stage,scope:'automation',revision:['unit','integration'].includes(stage)?'head':'release',environment:'repository',target_url:'https://github.com/koith/attendance-proto',workflow:'.github/workflows/work-orchestrator.yml',job:'guard',step:'Verify',...(stage==='post_deploy'?{after:'deployment'}:{})}))};
 const proofs=manifest.checks.filter(c=>c.stage!=='merge').map((c,i)=>({check:c.id,run_id:i+1,artifact_id:i+1}));
 const runs=Object.fromEntries(proofs.map(p=>{const c=manifest.checks.find(c=>c.id===p.check);return [p.run_id,{id:p.run_id,repository:{full_name:manifest.repository},head_sha:c.revision==='head'?head:release,path:c.workflow,event:c.revision==='head'?'pull_request':'push',status:'completed',conclusion:'success',run_attempt:1,run_started_at:'2026-10-23T14:59:00Z',updated_at:'2026-10-23T15:01:00Z',html_url:`https://github.com/koith/attendance-proto/actions/runs/${p.run_id}`}];}));
 const receipts=Object.fromEntries(proofs.map(p=>{const c=manifest.checks.find(c=>c.id===p.check);return [p.artifact_id,{version:1,repository:manifest.repository,issue:1331,run_id:p.run_id,run_attempt:1,check:c.id,sha:runs[p.run_id].head_sha,environment:c.environment,target_url:c.target_url,scope:c.scope,stage:c.stage,at,status:'PASS'}];}));
 const pr={number:1333,merged:true,merged_at:'2026-10-23T14:58:00Z',head:{sha:head,repo:{full_name:manifest.repository}},base:{ref:'main',repo:{full_name:manifest.repository}},merge_commit_sha:release};
 const source={provenance:'synthetic',pr:async()=>pr,run:async id=>runs[id],jobs:async()=>[{name:'guard',conclusion:'success',steps:[{name:'Verify',conclusion:'success'}]}],receipt:async id=>receipts[id]};
 return {manifest,proofs,runs,receipts,pr,source,options:{now:Date.parse('2026-10-23T15:02:00Z')}};
}
test('every separate phase is required; successful fixture is explicitly synthetic',async()=>{
 const f=fixture(),r=await evaluate(f.manifest,f.proofs,f.source,f.options);
 assert.equal(r.state,'ACCEPTED');assert.equal(r.status,'PASS');assert.equal(r.provenance,'synthetic');
 assert.throws(()=>validateManifest({...f.manifest,checks:[]}),/EMPTY/);
 assert.throws(()=>validateManifest({...f.manifest,checks:f.manifest.checks.slice(1)}),/MISSING_STAGE/);
});
test('missing/nonexistent evidence and skipped jobs never pass',async()=>{
 for(const kind of ['missing','404','skip','wrong-step']){
  const f=fixture();if(kind==='missing')f.proofs=[];
  if(kind==='404')f.source.run=async()=>{throw Error('HTTP_404');};
  if(kind==='skip')f.source.jobs=async()=>[{name:'guard',conclusion:'skipped'}];
  if(kind==='wrong-step')f.source.jobs=async()=>[{name:'guard',conclusion:'success',steps:[{name:'other',conclusion:'success'}]}];
  const r=await evaluate(f.manifest,f.proofs,f.source,f.options);assert.equal(r.status,'CANNOT_VERIFY');assert.notEqual(r.state,'ACCEPTED');
 }
});
test('wrong SHA/environment/URL/attempt/time/workflow and test failure are rejected',async()=>{
 const mutations=[f=>f.runs[1].head_sha='c'.repeat(40),f=>f.receipts[1].sha='c'.repeat(40),f=>f.receipts[1].environment='production',f=>f.receipts[1].target_url='https://wrong.example',f=>f.receipts[1].run_attempt=2,f=>f.receipts[1].at='2025-10-23T15:00:00Z',f=>f.receipts[1].at='2026-10-24T15:00:00Z',f=>f.runs[1].path='.github/workflows/other.yml',f=>f.receipts[1].status='FAIL',f=>f.runs[1].conclusion='failure'];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.equal((await evaluate(f.manifest,f.proofs,f.source,f.options)).status,'FAIL');}
});
test('merge is distinct; post-deploy must follow verified deployment; manual consent cannot auto-pass',async()=>{
 let f=fixture();f.pr.merged=false;assert.equal((await evaluate(f.manifest,f.proofs,f.source,f.options)).state,'CODE_VERIFIED');
 f=fixture();f.receipts[4].at='2026-10-23T14:59:30Z';assert.equal((await evaluate(f.manifest,f.proofs,f.source,f.options)).results.at(-1).reason,'POST_DEPLOY_BEFORE_OR_WITHOUT_DEPLOYMENT');
 f=fixture();f.manifest.checks.push({...f.manifest.checks[0],id:'auth-human',stage:'manual',requirement:'Consented production invitation'});
 const r=await evaluate(f.manifest,f.proofs,f.source,f.options);assert.equal(r.status,'CANNOT_VERIFY');assert.equal(r.state,'DEPLOYED');
});
test('duplicate evidence and changed release scope cannot be silently accepted',async()=>{
 const f=fixture();await assert.rejects(evaluate(f.manifest,[...f.proofs,f.proofs[0]],f.source,f.options),/DUPLICATE/);
 assert.throws(()=>validateManifest({...f.manifest,release_scope:['automation','auth']}),/MISSING_DEPLOYMENT_SCOPE/);
});
