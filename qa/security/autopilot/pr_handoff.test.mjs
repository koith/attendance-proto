import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {ensureReviewPR,validateContext} from '../../../scripts/security/autopilot/pr_handoff.mjs';
const head='a'.repeat(40);
const base={repo:'koith/attendance-proto',task:'SEC-S04-MANIFEST',branch:'sec-autopilot/SEC-S04-MANIFEST-run-123',head,run:'123',token:'synthetic-only'};
function fake({existing=false,creation=201,actualHead=head,commentStatus=201}={}) {
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  const p=new URL(url);calls.push({path:p.pathname+p.search,method:opts.method||'GET'});
  let status=200,data={};
  if(p.pathname.includes('/git/ref/'))data={object:{sha:actualHead}};
  else if(p.pathname.endsWith('/pulls')&&opts.method!=='POST')data=existing?[{number:70,head:{sha:head},base:{ref:'main'},html_url:'https://github.com/koith/attendance-proto/pull/70'}]:[];
  else if(p.pathname.endsWith('/pulls')&&opts.method==='POST'){
   status=creation;data=creation===201?{number:71,head:{sha:head},base:{ref:'main'},html_url:'https://github.com/koith/attendance-proto/pull/71'}:{};
  }else if(p.pathname.endsWith('/issues/1492/comments')){
   status=commentStatus;
   const body=JSON.parse(opts.body).body;
   assert.match(body,/verified_security_tasks_increment=0/);
   assert.doesNotMatch(body,/synthetic-only/);
  }else assert.fail('unexpected API route '+p.pathname);
  return {status,json:async()=>data};
 };
 return {fetchImpl,calls};
}
test('only exact allowlisted task, run, sha, branch can be handed off',()=>{
 assert.doesNotThrow(()=>validateContext(base));
 assert.throws(()=>validateContext({...base,branch:'main'}),/BRANCH_RUN_BINDING_MISMATCH/);
 assert.throws(()=>validateContext({...base,task:'../../secrets'}),/INVALID_HANDOFF_CONTEXT/);
 assert.throws(()=>validateContext({...base,head:'bad'}),/INVALID_HANDOFF_CONTEXT/);
});
test('never opens PR against changed published head',async()=>{
 const f=fake({actualHead:'b'.repeat(40)});
 await assert.rejects(ensureReviewPR(base,f.fetchImpl),/PUBLISHED_BRANCH_SHA_MISMATCH/);
 assert.equal(f.calls.length,1);
});
test('existing same-head open PR is reused without duplicate',async()=>{
 const f=fake({existing:true});const r=await ensureReviewPR(base,f.fetchImpl);
 assert.equal(r.result,'PR_OPEN');assert.equal(r.prNumber,70);
 assert.equal(f.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/pulls')).length,0);
});
test('authorized Actions token opens a review-only PR and records receipt',async()=>{
 const f=fake();const r=await ensureReviewPR(base,f.fetchImpl);
 assert.equal(r.result,'PR_OPEN');assert.equal(r.prNumber,71);
 assert.equal(f.calls.filter(x=>x.method==='POST'&&x.path.endsWith('/pulls')).length,1);
});
test('Actions PR policy 403 records durable connector bridge without fake success',async()=>{
 const f=fake({creation:403});const r=await ensureReviewPR(base,f.fetchImpl);
 assert.equal(r.result,'BRIDGE_REQUIRED');assert.equal(r.prNumber,null);
 assert.ok(f.calls.some(x=>x.path.endsWith('/issues/1492/comments')));
});
test('GitHub error or missing checkpoint cannot be misreported as submitted',async()=>{
 await assert.rejects(ensureReviewPR(base,fake({creation:500}).fetchImpl),/PR_CREATION_UNEXPECTED_STATUS_500/);
 await assert.rejects(ensureReviewPR(base,fake({commentStatus:403}).fetchImpl),/CHECKPOINT_COMMENT_FAILED/);
});
