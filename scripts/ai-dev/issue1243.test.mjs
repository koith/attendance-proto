import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classify1243} from './issue1243.mjs';
test('real recorded #1243 evidence distinguishes merged code and green QA from unapplied Auth',()=>{
 const snapshot=JSON.parse(fs.readFileSync('docs/ai-dev-workflow/issue-1243-observation.json','utf8'));
 const r=classify1243(snapshot);
 assert.equal(r.code_qa,'PASS');assert.equal(r.pr_merge,'PASS');assert.equal(r.reported_hosted_auth,'FAIL');
 assert.equal(r.reported_auth_application,'NOT_APPLIED');assert.equal(r.acceptance,'CANNOT_VERIFY');
 assert.equal(r.issue_close_permitted,false);assert.equal(r.production_writes,0);assert.equal(r.live_auth_probe,false);
 snapshot.runs[0].head_sha='f'.repeat(40);assert.equal(classify1243(snapshot).code_qa,'CANNOT_VERIFY');
 snapshot.quotes=[];assert.equal(classify1243(snapshot).reported_auth_application,'CANNOT_VERIFY');
});
