import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepare,encode} from './checkpoint.mjs';
import {rehearse} from './rehearsal.mjs';
test('SIGTERM + new process + only Issue reconstructs state without false success or duplicate writes',()=>{
 const sha='a'.repeat(40),issue=1331;
 const input={task:'resume',event_id:'rehearsal',expected_revision:0,expected_sha:null,sha,branch:'main',state:'IN_PROGRESS',scope:'Complete steps 2–4',acceptance:'Independent evidence',next_action:'Verify PR CI, merge, then gate and recovery drill',failure:'Session terminated before PR verification',proofs:[]};
 const c=prepare(input,[],{issue},{headSha:sha});
 const result=rehearse({issue:{number:issue,body:'Canonical #1331 requirements'},comments:[{body:encode(c.record),user:{login:'koith'}}]},'koith/attendance-proto');
 assert.equal(result.result,'PASS');assert.equal(result.interruption,'SIGTERM');assert.equal(result.recovered_tasks.resume.next_action,input.next_action);assert.equal(result.duplicate_effects,0);
});
