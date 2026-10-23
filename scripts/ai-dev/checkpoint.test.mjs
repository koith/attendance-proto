import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepare,encode,history,resume} from './checkpoint.mjs';
const context={issue:1331,trustedAuthors:['koith','github-actions[bot]']};
const a='a'.repeat(40),b='b'.repeat(40);
const input={task:'resume',event_id:'run-1',expected_revision:0,expected_sha:null,sha:a,branch:'codex/1331',state:'IN_PROGRESS',scope:'Issue persistence',acceptance:'fresh process resumes next action',next_action:'Implement CLI',failure:'',proofs:[]};
const comment=c=>({body:encode(c.record),user:{login:'koith'},html_url:'https://github.com/koith/attendance-proto/issues/1331#issuecomment-1'});
const one=prepare(input,[],context,{headSha:a});
test('fresh session reads issue definition, last SHA, failure, next action and evidence',()=>{
 const r=resume({number:1331,title:'Build',body:'Canonical full instructions'},[comment(one)],context);
 assert.equal(r.tasks.resume.sha,a);assert.equal(r.tasks.resume.next_action,'Implement CLI');
 assert.equal(r.definition,'Canonical full instructions');assert.equal(r.tasks.resume.completion,'CANNOT_VERIFY');
 assert.equal(r.conversation_recovery,false);
});
test('duplicate is idempotent; changed payload, stale revision and stale branch are rejected',()=>{
 assert.equal(prepare(input,[comment(one)],context,{headSha:b}).duplicate,true);
 assert.throws(()=>prepare({...input,next_action:'overwrite'},[comment(one)],context,{headSha:a}),/EVENT_ID_CONFLICT/);
 assert.throws(()=>prepare({...input,event_id:'run-2'},[comment(one)],context,{headSha:a}),/STALE_CHECKPOINT/);
 assert.throws(()=>prepare(input,[],context,{headSha:b}),/STALE_BRANCH/);
});
test('append-only chain rejects forks and tampering, ignores untrusted quoted receipts',()=>{
 const two=prepare({...input,event_id:'run-2',expected_revision:1,expected_sha:a,next_action:'Test CLI'},[comment(one)],context,{headSha:a});
 const fork=prepare({...input,event_id:'run-fork',expected_revision:1,expected_sha:a},[comment(one)],context,{headSha:a});
 assert.throws(()=>history([comment(one),comment(two),comment(fork)],context),/FORK/);
 assert.throws(()=>history([{...comment(one),body:comment(one).body.replace('Implement CLI','Fake PASS')}],context),/DIGEST/);
 assert.deepEqual(history([{...comment(one),user:{login:'stranger'}}],context),{});
 assert.equal(history([comment(one),comment(one)],context).resume.entries.length,1);
});
test('permission-blocked task retains next action and leaves independent task resumable',()=>{
 const blocked=prepare({...input,event_id:'run-2',expected_revision:1,expected_sha:a,state:'BLOCKED',failure:'GitHub 403',required_action:'Use existing authorized connection'},[comment(one)],context,{headSha:a});
 const other=prepare({...input,task:'local-tests',event_id:'independent'},[comment(one),comment(blocked)],context,{headSha:a});
 const tasks=history([comment(one),comment(blocked),comment(other)],context);
 assert.equal(tasks.resume.latest.record.resume_state,'IN_PROGRESS');
 assert.equal(tasks['local-tests'].latest.record.state,'IN_PROGRESS');
 assert.throws(()=>prepare({...input,state:'ACCEPTED'},[],context,{headSha:a}),/INDEPENDENT_GATE/);
});

test('resume retains final evidence notes and harmless Markdown whitespace without treating prose as proof',()=>{
 const r=resume({number:1331,title:'Build',body:'Canonical instructions'},[
  {...comment(one),body:comment(one).body+'\n  '},
  {body:'Final report: read the independent acceptance artifact before claiming completion.',user:{login:'koith'},html_url:'https://github.com/koith/attendance-proto/issues/1331#issuecomment-2'}
 ],context);
 assert.equal(r.recent_notes.length,1);assert.match(r.recent_notes[0].body,/independent acceptance/);
 assert.equal(r.tasks.resume.completion,'CANNOT_VERIFY');
});
