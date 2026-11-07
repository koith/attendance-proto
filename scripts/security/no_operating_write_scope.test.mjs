import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertNoOperatingWriteRelease} from './no_operating_write_scope.mjs';
const before='a'.repeat(40),head='b'.repeat(40);
const files=[
  {filename:'SECURITY_STABILITY_LEDGER_20261103.md',status:'modified'},
  {filename:'scripts/security/autopilot/delta_guard.mjs',status:'modified'},
  {filename:'qa/security/autopilot/reapply_guard.test.mjs',status:'added'},
  {filename:'.github/workflows/p0-pages-deploy.yml',status:'modified'}
];
const check=(changes=files,more={})=>assertNoOperatingWriteRelease({before,head,status:'ahead',files:changes,...more});
test('strict exact-scope guard accepts reviewed non-runtime changes only',()=>{
  const r=check();assert.equal(r.result,'PASS');assert.equal(r.changed_paths.length,4);
  assert.equal(check([{filename:'security/readonly_session_hook_audit_20261105.sql',status:'added'}]).result,'PASS');
});
test('reviewed PG16/17 delegated manager SQL and workflow qualify as non-operating release',()=>{
  const changed=[
    {filename:'.github/workflows/store-delegated-manager-postgres.yml',status:'modified'},
    {filename:'qa_store_scoped_permissions_postgres.sql',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  const r=check(changed);
  assert.equal(r.result,'PASS');
  assert.equal(r.changed_paths.length,4);
  assert.throws(()=>check(changed.concat({filename:'supabase/migrations/20261107_unsafe.sql',status:'added'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
});
test('rejects app, Edge, payroll migration, GAS, secrets, random tests and unknown workflows',()=>{
  for(const path of ['index.html','actual_attendance.js','supabase/functions/server-sync-sheet/index.ts',
    'supabase/migrations/pays.sql','gas/Code.gs','.github/workflows/other.yml',
    'qa_payroll_contract_authority_v1.mjs','.env','security/other_audit.sql','security/RECOVERY.key'])
    assert.throws(()=>check([{filename:path,status:'modified'}]),/SEC_NO_WRITE_DISALLOWED_CHANGE/,path);
});
test('rejects empty, duplicate, deleted/renamed, ill-formed and truncated file lists',()=>{
  assert.throws(()=>check([]),/SEC_NO_WRITE_UNPROVEN_FILE_LIST/);
  assert.throws(()=>check(files.concat(files[0])),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  assert.throws(()=>check([{...files[0],status:'removed'}]),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  assert.throws(()=>check([{...files[0],status:'renamed'}]),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  assert.throws(()=>check([null]),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  assert.throws(()=>check(new Array(100).fill(files[0])),/SEC_NO_WRITE_UNPROVEN_FILE_LIST/);
});
test('rejects untrusted/non-fast-forward Git commit context',()=>{
  for(const more of [{before:''},{before:'0'.repeat(40)},{head:''},{head:before},{status:'behind'},{status:'identical'},{status:'diverged'}])
    assert.throws(()=>check(files,more),/SEC_NO_WRITE_INVALID_COMMIT_RANGE|SEC_NO_WRITE_NOT_FAST_FORWARD/);
});
test('real P0 workflow enforces security-only scope and skips all three operating release jobs',()=>{
  const pages=fs.readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
  const verifier=fs.readFileSync('.github/workflows/verified-pages-deployment-notification.yml','utf8');
  const marker='[SEC-NO-OPERATING-WRITE]';
  assert.match(pages,/Enforce SEC-only no-operating-write scope/);
  assert.match(pages,/assertNoOperatingWriteRelease/);
  assert.match(pages,/SEC_NO_WRITE_COMPARISON_INCOMPLETE/);
  for(const name of ['build-pages','notify-deployment-result','deploy-pages']){
    const begin=pages.indexOf('\n  '+name+':');
    assert.ok(begin>=0,'Missing operating job '+name);
    const rest=pages.slice(begin+4);
    const next=rest.search(/\n  [a-z][a-z-]*:\n/);
    const block=pages.slice(begin,next>=0?begin+4+next:pages.length);
    assert.ok(block.includes(`!contains(github.event.head_commit.message, '${marker}')`),
      'No-write marker must skip '+name);
    assert.match(block,/!contains\(github\.event\.head_commit\.message, '\[QA1243-NO-OPERATING-WRITE\]'\)/,
      'Existing QA1243 no-write gate must remain');
  }
  assert.ok(verifier.includes(`!contains(github.event.workflow_run.head_commit.message, '${marker}')`),
    'Do not send spurious independent Pages success for an unpublished security-only push');
  const agentCi=fs.readFileSync('.github/workflows/sec-autopilot-contract-ci.yml','utf8');
  assert.ok(agentCi.includes('github.rest.repos.compareCommits') &&
    agentCi.includes('pr.base.sha') && agentCi.includes('pr.head.sha'),
    'Security CI must audit the entire PR range, not just one commit');
  assert.ok(agentCi.includes('SEC_AUTO_BOT_EXACT_TWO_FILES') &&
    agentCi.includes('SEC_AUTO_BOT_UNTRUSTED_CHANGE'),
    'Auto-generated branches retain exact two-file source/test restrictions');
  assert.ok(!agentCi.includes('git diff --name-only HEAD^ HEAD'),
    'Reject prior last-commit-only security scan');
});
