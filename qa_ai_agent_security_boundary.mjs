import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const validator=path.join(root,'scripts/security/validate_agent_publish_patch.mjs');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/autonomous-development-agent.yml'),'utf8');
const agent=fs.readFileSync(path.join(root,'scripts/autonomous_dev_agent.sh'),'utf8');
const jobs=['capture-intake','develop','qa','publish','report-failure'];
for(const name of jobs){
 const n=workflow.match(new RegExp('^  '+name+':','gm'))||[];
 if(n.length!==1)throw Error('DUPLICATE_OR_MISSING_JOB_'+name);
}
const job=(name,next)=>workflow.slice(workflow.indexOf('\n  '+name+':'),next?workflow.indexOf('\n  '+next+':'):undefined);
const dev=job('develop','qa'),qa=job('qa','publish'),publish=job('publish','report-failure');
if(!/contents: read/.test(dev)||/contents: write/.test(dev)||!/copilot-requests: write/.test(dev))throw Error('DEVELOP_TOKEN_NOT_READ_ONLY');
if(/OPENAI_API_KEY:/.test(qa)||/GH_TOKEN:/.test(qa)||/SUPABASE_SERVICE_ROLE_KEY:/.test(qa))throw Error('QA_SECRET_EXPOSURE');
if(!/contents: write/.test(publish)||/copilot-requests: write/.test(publish)||/OPENAI_API_KEY:/.test(publish))throw Error('PUBLISH_TOKEN_OVERREACH');
if(!/needs: qa/.test(publish)||!/name: agent-qa-passed-patch/.test(publish))throw Error('QA_APPROVAL_GATE_MISSING');
if(/^\\s*(?:gh pr create|git push)\\b/m.test(agent)||!/git diff --cached --binary/.test(agent))throw Error('MODEL_CAN_PUBLISH_OR_ARTIFACT_MISSING');
if(!/node --check/.test(agent)||/node qa_boot_syntax\.mjs/.test(agent))throw Error('MODEL_QA_EXECUTES_WITH_API_KEY');
const run=(cmd,args,cwd,env)=>spawnSync(cmd,args,{cwd,encoding:'utf8',env:{...process.env,...env}});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'agent-security-contract-'));fs.chmodSync(tmp,0o700);
try{
 const git=(args)=>{const r=run('git',args,tmp);if(r.status!==0)throw Error('GIT_FIXTURE_FAILED_'+args[0]);return r.stdout.trim()};
 git(['init','-q']);git(['config','user.email','test@example.invalid']);git(['config','user.name','Synthetic CI']);
 fs.writeFileSync(path.join(tmp,'app.js'),'const version = 1;\n');
 git(['add','app.js']);git(['commit','-qm','synthetic base']);
 const sha=git(['rev-parse','HEAD']);
 const baseFile=path.join(tmp,'base.txt'),issueFile=path.join(tmp,'issue.txt'),patchFile=path.join(tmp,'patch.diff');
 fs.writeFileSync(baseFile,sha+'\n');fs.writeFileSync(issueFile,'123\n');
 const validate=()=>run(process.execPath,[validator,patchFile,baseFile,issueFile],tmp,{ISSUE_NUMBER:'123'});
 const stage=()=>{fs.writeFileSync(patchFile,git(['diff','--cached','--binary'])+'\n')};
 fs.writeFileSync(path.join(tmp,'app.js'),'const version = 2;\n');
 fs.writeFileSync(path.join(tmp,'qa_synthetic.mjs'),"if (1 !== 1) throw Error('no');\n");
 git(['add','app.js','qa_synthetic.mjs']);stage();
 if(validate().status!==0)throw Error('VALID_SYNTHETIC_PATCH_REJECTED');
 fs.mkdirSync(path.join(tmp,'.github','workflows'),{recursive:true});
 fs.writeFileSync(path.join(tmp,'.github','workflows','malicious.yml'),'name: injection\n');
 git(['add','.github/workflows/malicious.yml']);stage();
 if(validate().status===0)throw Error('MALICIOUS_WORKFLOW_EDIT_ACCEPTED');
 git(['reset','-q','HEAD','.github/workflows/malicious.yml']);stage();
 fs.writeFileSync(baseFile,'0'.repeat(40));
 if(validate().status===0)throw Error('STALE_BASE_SHA_ACCEPTED');
 fs.writeFileSync(baseFile,sha+'\n');fs.writeFileSync(issueFile,'999\n');
 if(validate().status===0)throw Error('SPOOFED_ISSUE_ACCEPTED');
 fs.writeFileSync(issueFile,'123\n');
 fs.writeFileSync(path.join(tmp,'app.js'),"const nope = process.env.OPENAI_API_KEY;\\n");
 git(['add','app.js']);stage();
 if(validate().status===0)throw Error('MODEL_CREDENTIAL_READ_ACCEPTED');
 // Every adversarial case must run with a valid issue/base so the failure
 // can only come from the model source guard, never a stale fixture.
 const rejectCode=(code,reason)=>{
  fs.writeFileSync(path.join(tmp,'app.js'),code+'\n');
  git(['add','app.js']);stage();
  const result=validate();
  if(result.status===0||!result.stderr.includes('SENSITIVE_OR_PRIVILEGED_CODE_PROPOSAL'))
    throw Error('UNSAFE_PROPOSAL_ACCEPTED_OR_WRONG_REJECTION_'+reason);
 };
 rejectCode("const value = process.env['GITHUB_TOKEN'];",'BRACKET_ENV');
 rejectCode("const value = globalThis['process']['env']['OPENAI_API_KEY'];",'GLOBAL_PROCESS');
 rejectCode("const value = eval('1+1');",'EVAL');
 rejectCode("const value = import('node:fs');",'DYNAMIC_NODE_FS');
 rejectCode("const value = Deno.env.get('SUPABASE_DB_URL');",'DENO_ENV');

 const leak=run('bash',[path.join(root,'scripts/security/run_secretless_agent_qa.sh')],root,{OPENAI_API_KEY:'SYNTHETIC_DO_NOT_LOG'});
 if(leak.status===0||leak.stdout.includes('SYNTHETIC_DO_NOT_LOG')||leak.stderr.includes('SYNTHETIC_DO_NOT_LOG'))throw Error('SYNTHETIC_SECRET_TEST_FAILED');
 console.log('PASS_SEC_AGENT_BOUNDARY: read_only_provider, secretless_qa, separate_write_publisher, allowlisted_changes, malicious_workflow_denied, stale_base_denied, issue_spoof_denied, no_test_secret_output, blocked_credential_source_read');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
