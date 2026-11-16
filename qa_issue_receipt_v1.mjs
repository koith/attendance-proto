import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractSource, makeReference} from './scripts/issue_intake_receipt.mjs';

const base = {
  issue: {
    number: 42, title: 'Review PR and deploy', body: '첫 지시 원문\n수정 전 1회',
    created_at: '2026-10-15T00:00:00Z', user: {login: 'koith'}
  }
};
const src = extractSource('issues', {...base, action: 'opened'});
const first = makeReference(src);
assert.match(first.sha256, /^[0-9a-f]{64}$/);
assert.equal(first.issue, 42);
assert.equal(first.kind, 'issue');
assert.equal(first.sourceChars, base.issue.body.length);
assert.doesNotMatch(JSON.stringify(first), /첫 지시 원문|수정 전 1회/, 'original content must not be copied');
assert.equal(first.sha256, makeReference(src).sha256, 'same source must have stable fingerprint');

const edited = makeReference(extractSource('issues', {
  ...base, action: 'edited', issue: {...base.issue, body: base.issue.body + '\n추가 수정'}
}));
assert.notEqual(first.sha256, edited.sha256, 'edits should be distinguishable without mirroring');

const comment = makeReference(extractSource('issue_comment', {
  ...base, action: 'created', comment: {
    id: 99, body: '추가 요청: UI 변경',
    user: {login: 'koith', type: 'User'}, created_at: '2026-10-15T00:01:00Z'
  }
}));
assert.equal(comment.commentId, 99);
assert.equal(comment.kind, 'comment');
assert.equal(extractSource('issue_comment', {
  ...base, action: 'created', comment: {
    id: 100, body: 'bot result', user: {login: 'github-actions[bot]', type: 'Bot'}
  }
}), null);
assert.equal(extractSource('issue_comment', {
  ...base, action: 'created', comment: {
    id: 101, body: '[development-intake:v1:deadbeef]\n중복 저장',
    user: {login: 'koith', type: 'User'}
  }
}), null, 'mirrored receipts must never be mirrored again');

assert.equal(extractSource('issues', {...base, action: 'labeled'})?.origin, 'GitHub issue labeled');
assert.deepEqual(extractSource('workflow_dispatch', {inputs: {issue_number: '42'}}), {readIssue: 42});
assert.throws(() => makeReference({...src, text: 'sk-' + 'x'.repeat(35)}), /Sensitive token/);
assert.throws(() => makeReference({...src, text: ' '}), /Missing or oversized/);
assert.throws(() => makeReference({...src, text: 'x'.repeat(50001)}), /Missing or oversized/);

const workflow = fs.readFileSync('.github/workflows/capture-development-instructions.yml', 'utf8');
const agent = fs.readFileSync('.github/workflows/autonomous-development-agent.yml', 'utf8');
const source = fs.readFileSync('scripts/issue_intake_receipt.mjs', 'utf8');
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s+issue_comment:\s*$/m, 'comment events must not trigger intake');
assert.doesNotMatch(workflow, /^\s+issues:\s*$/m, 'issue events must not trigger intake');
assert.doesNotMatch(workflow, /issues:\s*write|pull-requests:\s*write/, 'intake needs read-only permission');
assert.match(workflow, /node qa_issue_receipt_v1\.mjs/);
assert.match(agent, /node scripts\/issue_intake_receipt\.mjs/, 'agent still validates source before coding');
assert.doesNotMatch(source, /method:\s*['"]POST|createComment|\/comments\?per_page/,
  'source validator must not mirror or enumerate comments');
assert.match(source, /GITHUB_STEP_SUMMARY/, 'bounded evidence belongs in Actions summary');
console.log('PASS source reference: no write, no recursive triggers, no copied text, stable fingerprint');
