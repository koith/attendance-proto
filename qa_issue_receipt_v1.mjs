import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractSource,makeReceipt} from './scripts/issue_intake_receipt.mjs';
const base={issue:{number:42,title:'Review PR and deploy',body:'첫 지시 원문\n수정 전 1회',created_at:'2026-10-15T00:00:00Z',user:{login:'koith'}}};
const source=extractSource('issues',{...base,action:'opened'});
const first=makeReceipt(source);
assert.match(first.marker,/^\[development-intake:v1:[0-9a-f]{64}\]$/);
assert.ok(first.body.includes(base.issue.body));
assert.equal(first.id,makeReceipt(source).id,'identical source must be idempotent');
const updated=makeReceipt(extractSource('issues',{...base,action:'edited',issue:{...base.issue,body:base.issue.body+'\n추가 수정'}}));
assert.notEqual(first.id,updated.id,'revisions must append, not overwrite');
const command=makeReceipt(extractSource('issue_comment',{...base,action:'created',
 comment:{id:99,body:'추가 요청: UI 변경',user:{login:'koith',type:'User'},created_at:'2026-10-15T00:01:00Z'}}));
assert.notEqual(command.id,first.id);
assert.equal(extractSource('issue_comment',{...base,action:'created',
 comment:{id:100,body:'bot result',user:{login:'github-actions[bot]',type:'Bot'}}}),null,'bot comments must not recursively capture');
assert.equal(extractSource('issues',{...base,action:'labeled'})?.origin,'GitHub issue labeled');
assert.throws(()=>makeReceipt({...source,text:'sk-'+'x'.repeat(35)}),/Sensitive token/);
assert.throws(()=>makeReceipt({...source,text:' '}),/Missing or oversized/);
const workflow=fs.readFileSync('.github/workflows/capture-development-instructions.yml','utf8');
const agent=fs.readFileSync('.github/workflows/autonomous-development-agent.yml','utf8');
assert.match(workflow,/types: \[opened, edited, reopened\]/);
assert.match(workflow,/types: \[created\]/);
assert.match(workflow,/cancel-in-progress: false/);
assert.match(workflow,/pull-requests: write/,'PR discussion receipts need PR-specific permissions');
assert.match(fs.readFileSync('scripts/issue_intake_receipt.mjs','utf8'),/const transient=rateLimited/,'rate-limit errors require bounded recovery');
assert.match(agent,/node scripts\/issue_intake_receipt\.mjs/,'approved agent must archive issue before coding');
console.log('PASS append-only GitHub instruction receipt: revisions, sources, bot-loop, secrets, agent gate');