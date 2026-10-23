// Central reviewed adapter: expectations are code, never inferred from a successful run.
export function automationManifest({repository,issue,pr,head_sha,release_sha}) {
 const root=`https://github.com/${repository}`;
 const check=(id,stage,revision,job,step,target_url,environment='repository')=>({id,requirement:id,stage,revision,scope:'automation',environment,target_url,workflow:'.github/workflows/work-orchestrator.yml',job,step});
 return {version:1,repository,issue,pr,head_sha,release_sha,release_scope:['automation'],checks:[
  check('unit','unit','head','guard','AI execution policy unit QA',`${root}/tree/${head_sha}`,'isolated'),
  check('integration','integration','head','guard','AI fresh process integration QA',`${root}/tree/${head_sha}`,'isolated'),
  check('merge','merge','release','', '',`${root}/pull/${pr}`),
  check('deployment','deployment','release','automation-readback','Verify installed automation',`${root}/tree/${release_sha}`),
  {...check('post-deploy','post_deploy','release','automation-readback','Resume canonical issue in a fresh process',`${root}/issues/${issue}`),after:'deployment'}
 ]};
}
