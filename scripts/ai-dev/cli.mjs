#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {prepare,resume,history} from './checkpoint.mjs';
import {githubClient} from './github.mjs';
export async function main(args=process.argv.slice(2)) {
  const [command,repo,number,file]=args;
  const issueNumber=Number(number);
  if(!['resume','checkpoint'].includes(command)||!/^[-\w.]+\/[-\w.]+$/.test(repo||'')||!Number.isSafeInteger(issueNumber)||issueNumber<1)
    throw Error('Usage: node scripts/ai-dev/cli.mjs resume|checkpoint owner/repo issue [snapshot-or-input.json]');
  const api=githubClient(repo),context={issue:issueNumber,trustedAuthors:[repo.split('/')[0],'github-actions[bot]']};
  const snapshot=command==='resume'&&file?JSON.parse(fs.readFileSync(file,'utf8')):null;
  const issue=snapshot?.issue||await api(`/issues/${issueNumber}`);
  const comments=snapshot?.comments||await api.list(`/issues/${issueNumber}/comments`);
  if(command==='resume')return resume(issue,comments,context);
  if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_REF!=='refs/heads/main'||
    process.env.GITHUB_WORKFLOW_REF!==`${repo}/.github/workflows/work-orchestrator.yml@refs/heads/main`)
    throw Error('CHECKPOINT_REQUIRES_SERIALIZED_TRUSTED_MAIN_WORKFLOW');
  const input=JSON.parse(fs.readFileSync(file,'utf8'));
  const head=await api(`/git/ref/heads/${encodeURIComponent(input.branch)}`);
  const candidate=prepare(input,comments,context,{headSha:head.object.sha});
  if(candidate.duplicate)return {status:'ALREADY_RECORDED',url:candidate.url};
  await api(`/issues/${issueNumber}/comments`,{method:'POST',body:{body:candidate.body}});
  const confirmed=history(await api.list(`/issues/${issueNumber}/comments`),context)[input.task];
  if(confirmed?.latest.digest!==candidate.digest)throw Error('CHECKPOINT_READBACK_CONFLICT');
  return {status:'RECORDED',revision:candidate.record.revision,url:confirmed.latest.url};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{
    console.error(JSON.stringify({state:error.state||'CANNOT_VERIFY',reason:error.message,required_action:error.required_action||'Inspect input/evidence; do not claim completion.'}));process.exitCode=1;
  });
