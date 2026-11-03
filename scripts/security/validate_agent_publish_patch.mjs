#!/usr/bin/env node
// Runs only in the trusted publish job, never in the AI/model/QA job.
// Validates a staged patch after git apply --index; it never executes patch code.
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',timeout:15000}).trim();
const [,,patchPath,baseFile,issueFile]=process.argv;
if(!patchPath||!baseFile||!issueFile)throw Error('REQUIRED_PATCH_METADATA_MISSING');
const patch=statSync(patchPath);
if(!patch.isFile()||patch.size<32||patch.size>400000)throw Error('PATCH_SIZE_OUTSIDE_SAFE_RANGE');
const original=readFileSync(baseFile,'utf8').trim();
if(!/^[a-f0-9]{40}$/.test(original)||git(['rev-parse','HEAD'])!==original)throw Error('BASE_SHA_MISMATCH');
const issue=readFileSync(issueFile,'utf8').trim();
if(!/^[0-9]{1,8}$/.test(issue)||issue!==process.env.ISSUE_NUMBER)throw Error('ISSUE_BINDING_MISMATCH');
const names=git(['diff','--cached','--name-only']).split('\n').filter(Boolean);
const raw=git(['diff','--cached','--raw']).split('\n').filter(Boolean);
const roots=/^[A-Za-z0-9_-]+\.(js|html|css)$/;
const tests=/^qa_[A-Za-z0-9_-]+\.mjs$/;
if(names.length<2||names.length>24||!names.some(x=>roots.test(x))||!names.some(x=>tests.test(x)))throw Error('MISSING_APP_OR_QA_OR_TOO_MANY_FILES');
for(const name of names) {
 if(!(roots.test(name)||tests.test(name))||name.includes('/')||name.includes('\\')||name.includes('..'))throw Error('DISALLOWED_PATCH_PATH');
}
for(const line of raw){
 const match=line.match(/^:([0-9]{6}) ([0-9]{6}) [a-f0-9]+ [a-f0-9]+ ([A-Z])\s+(.+)$/);
 if(!match||!['A','M'].includes(match[3])||!['000000','100644'].includes(match[1])||match[2]!=='100644')
  throw Error('UNSAFE_PATCH_FILE_MODE_OR_OPERATION');
}
if(git(['diff','--cached','--check'])!=='')throw Error('PATCH_WHITESPACE_OR_CONFLICT');
console.log('VERIFIED_TRUSTED_PUBLISH_STATIC_CHECK files='+names.length+' issue='+issue);
