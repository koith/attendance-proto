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
test('read-only live browser QA is guarded and does not permit operating scripts',()=>{
  const changed=[
    {filename:'.github/workflows/qa-live-test-controls-v1.yml',status:'modified'},
    {filename:'qa_live_guest_pos_readonly_browser_v384.mjs',status:'added'},
    {filename:'qa_live_version_test_controls_v1.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(changed).result,'PASS');
  assert.throws(()=>check(changed.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  const workflow=fs.readFileSync('.github/workflows/qa-live-test-controls-v1.yml','utf8');
  const source=fs.readFileSync('qa_live_guest_pos_readonly_browser_v384.mjs','utf8');
  assert.match(workflow,/node qa_live_guest_pos_readonly_browser_v384.mjs/);
  assert.match(source,/const allowRPC=new Set\(\['list_stores','pos_public_staff_cards','pos_public_staff_picker'\]\)/);
  assert.match(source,/SEC_READ_ONLY_TEST_BLOCK/);
  assert.doesNotMatch(source,/\b(?:store_attendance_correct_event|payroll_close|pos_unlock_store|punch)\s*\(/,
    'Live QA may never issue real state-changing operations');
});
test('S2 strictly scoped SQL + isolated PG fixture cannot bypass runtime migration safety',()=>{
  const changed=[
    {filename:'security/sec_s2_anon_trigger_execute_hardening.sql',status:'added'},
    {filename:'qa/sec_s2_anon_trigger_execute_postgres.sql',status:'added'},
    {filename:'.github/workflows/sec-s2-public-trigger-acl-postgres.yml',status:'added'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(changed).result,'PASS');
  assert.throws(()=>check(changed.concat({filename:'supabase/migrations/20261107000000_unsafe.sql',status:'added'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  const sql=fs.readFileSync('security/sec_s2_anon_trigger_execute_hardening.sql','utf8');
  const ci=fs.readFileSync('.github/workflows/sec-s2-public-trigger-acl-postgres.yml','utf8');
  assert.match(sql,/REVOKE EXECUTE ON FUNCTION public.cancel_revoked_owner_invitation\(\)/);
  assert.match(sql,/REVOKE EXECUTE ON FUNCTION public.store_assistant_invitation_default_permissions\(\)/);
  assert.match(sql,/FROM PUBLIC, anon/);
  assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\s+(?:INTO|FROM|TABLE)/i);
  assert.match(ci,/matrix:/);
  assert.match(ci,/pg: \['16','17'\]/);
  assert.match(ci,/qa\/sec_s2_anon_trigger_execute_postgres.sql/);
});
test('SEC-A2 exact private history trigger and disposable PG verifier are non-operating-release only',()=>{
  const changed=[
    {filename:'security/sec_a2_attendance_mutation_audit_v1.sql',status:'added'},
    {filename:'qa/sec_a2_attendance_mutation_audit_postgres.sql',status:'added'},
    {filename:'.github/workflows/sec-a2-attendance-mutation-audit-pg.yml',status:'added'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(changed).result,'PASS');
  assert.throws(()=>check(changed.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  const sql=fs.readFileSync('security/sec_a2_attendance_mutation_audit_v1.sql','utf8');
  const workflow=fs.readFileSync('.github/workflows/sec-a2-attendance-mutation-audit-pg.yml','utf8');
  assert.match(sql,/CREATE TABLE private.attendance_mutation_audit_v1/);
  assert.match(sql,/AFTER UPDATE OR DELETE ON public.attendance_events/);
  assert.match(sql,/AFTER UPDATE OR DELETE ON public.event_corrections/);
  assert.match(sql,/AFTER UPDATE OR DELETE ON public.correction_requests/);
  assert.match(sql,/SEC_A2_EXPECTED_SUBTRANSACTION_ROLLBACK/);
  assert.match(workflow,/pg: \['16','17'\]/);
  assert.doesNotMatch(sql,/\bUPDATE\s+public\.attendance_events\b/i);
  assert.doesNotMatch(sql,/\bDELETE\s+FROM\s+public\.attendance_events\b/i);
});
test('R4 GoTrue isolated real-auth workflows stay exact non-operating-write only',()=>{
  const changed=[
    {filename:'.github/workflows/qa1243-gotrue-mailpit-live.yml',status:'modified'},
    {filename:'.github/workflows/qa1243-sec01-preactivation.yml',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(changed).result,'PASS');
  assert.throws(()=>check(changed.concat({filename:'supabase/migrations/20261108120000_auth.sql',status:'added'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  for(const path of ['.github/workflows/qa1243-gotrue-mailpit-live.yml','.github/workflows/qa1243-sec01-preactivation.yml']){
    const workflow=fs.readFileSync(path,'utf8');
    assert.match(workflow,/runs-on: ubuntu-24\.04/);
    assert.match(workflow,/qa1243/);
    assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|GOOGLE_OAUTH_REFRESH_TOKEN/);
  }
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

test('A2 v2 append-only guard is exact-scope, no operating data writes',()=>{
  const reviewed=[
    {filename:'security/sec_a2_audit_immutability_guard_v2.sql',status:'added'},
    {filename:'qa/sec_a2_audit_immutability_postgres.sql',status:'added'},
    {filename:'.github/workflows/sec-a2-attendance-mutation-audit-pg.yml',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(reviewed).result,'PASS');
  assert.throws(()=>check(reviewed.concat({filename:'supabase/migrations/20261108_unreviewed.sql',status:'added'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  const sql=fs.readFileSync('security/sec_a2_audit_immutability_guard_v2.sql','utf8');
  const fixture=fs.readFileSync('qa/sec_a2_audit_immutability_postgres.sql','utf8');
  const workflow=fs.readFileSync('.github/workflows/sec-a2-attendance-mutation-audit-pg.yml','utf8');
  assert.ok(sql.includes('BEFORE UPDATE OR DELETE ON private.attendance_mutation_audit_v1'));
  assert.ok(sql.includes('BEFORE TRUNCATE ON private.attendance_mutation_audit_v1'));
  assert.ok(sql.includes('SEC_A2_AUDIT_IMMUTABLE_DENIED'));
  for(const source of ['attendance_events','event_corrections','correction_requests'])
    for(const verb of ['INSERT INTO ','UPDATE ','DELETE FROM ','TRUNCATE '])
      assert.equal(sql.includes(verb+'public.'+source),false,'no live DML '+verb+source);
  assert.ok(fixture.includes('ROLLBACK;'));
  assert.ok(fixture.includes('SEC_A2_V2_SOURCE_CAPTURE_REGRESSION'));
  assert.ok(workflow.includes('qa/sec_a2_audit_immutability_postgres.sql'));
  assert.ok(workflow.includes("pg: ['16','17']"));
});

test('SEC S3 S4 live private GET-only probe and exact-scope workflow',()=>{
 const changed=[
   {filename:'qa_live_anonymous_sensitive_readonly_v1.mjs',status:'added'},
   {filename:'.github/workflows/qa-live-test-controls-v1.yml',status:'modified'},
   {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
   {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 assert.equal(check(changed).result,'PASS');
 assert.throws(()=>check(changed.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const probe=fs.readFileSync('qa_live_anonymous_sensitive_readonly_v1.mjs','utf8');
 const wf=fs.readFileSync('.github/workflows/qa-live-test-controls-v1.yml','utf8');
 assert.ok(probe.includes("method:'GET'"));
 assert.ok(probe.includes('SEC_LIVE_ANON_SENSITIVE_ROW_EXPOSED_OR_INVALID_RESPONSE'));
 assert.ok(probe.includes('SEC_LIVE_FORGED_JWT_WAS_NOT_REJECTED'));
 for(const verb of ["method:'POST'","method:'PUT'","method:'PATCH'","method:'DELETE'"])
    assert.equal(probe.includes(verb),false,'No production writes: '+verb);
 assert.ok(wf.includes('node qa_live_anonymous_sensitive_readonly_v1.mjs'));
 assert.ok(wf.includes('qa_live_anonymous_sensitive_readonly_v1.mjs'));
});

test('SEC-S4 cross-store employee document RLS SQL and PG16/17 workflow are security-only',()=>{
 const changes=[
  {filename:'security/sec_s4_employee_docs_store_scoped_rls.sql',status:'added'},
  {filename:'qa/sec_s4_employee_docs_store_rls_postgres.sql',status:'added'},
  {filename:'.github/workflows/sec-s4-employee-doc-storage-rls-pg.yml',status:'added'},
  {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 assert.equal(check(changes).result,'PASS');
 assert.throws(()=>check(changes.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const sql=fs.readFileSync('security/sec_s4_employee_docs_store_scoped_rls.sql','utf8');
 const qa=fs.readFileSync('qa/sec_s4_employee_docs_store_rls_postgres.sql','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-s4-employee-doc-storage-rls-pg.yml','utf8');
 assert.match(sql,/public\.can_manage_store\(e\.store_id\)/);
 assert.match(sql,/public\.is_hq_admin\(\)/);
 assert.match(sql,/ALTER POLICY empdoc_admin_select ON storage\.objects/);
 assert.match(sql,/ALTER POLICY empdoc_admin_insert ON storage\.objects/);
 assert.match(sql,/ALTER POLICY empdoc_admin_delete ON storage\.objects/);
 assert.doesNotMatch(sql,/\b(?:DELETE FROM|TRUNCATE|UPDATE)\s+(?:storage\.objects|public\.employee_documents|public\.employees)\b/i);
 assert.match(qa,/SEC_S4_CROSS_STORE_SELECT_STILL_EXPOSED/);
 assert.match(qa,/SEC_S4_OWNER_UPLOAD_BROKEN/);
 assert.match(qa,/SEC_S4_HQ_ARCHIVE_RECOVERY_BROKEN/);
 assert.match(wf,/pg: \['16','17'\]/);
});

test('SEC-S4 server-side 24h document deletion retention SQL and isolated PG16/17',()=>{
 const changes=[
  {filename:'security/sec_s4_doc_delete_retention_24h.sql',status:'added'},
  {filename:'security/sec_s4_doc_delete_retention_rollback_v1.sql',status:'added'},
  {filename:'qa/sec_s4_doc_delete_retention_postgres.sql',status:'added'},
  {filename:'.github/workflows/sec-s4-employee-doc-storage-rls-pg.yml',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 assert.equal(check(changes).result,'PASS');
 assert.throws(()=>check(changes.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const sql=fs.readFileSync('security/sec_s4_doc_delete_retention_24h.sql','utf8');
 const qa=fs.readFileSync('qa/sec_s4_doc_delete_retention_postgres.sql','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-s4-employee-doc-storage-rls-pg.yml','utf8');
 assert.match(sql,/TOO_OLD_TO_DELETE/);
 const rollback=fs.readFileSync('security/sec_s4_doc_delete_retention_rollback_v1.sql','utf8');
 assert.match(rollback,/SEC_S4_ROLLBACK_STATE_DRIFT_STOP/);
 assert.match(rollback,/sec_s4_employee_doc_file_access_v1/);
 assert.match(sql,/v_row\.uploaded_by_email/);
 assert.match(sql,/owner_id=\(SELECT auth\.uid\(\)\)::text/);
 assert.match(sql,/ALTER POLICY empdoc_admin_delete/);
 assert.match(sql,/DELETE FROM public\.employee_documents WHERE id=p_document_id/);
 assert.doesNotMatch(sql,/\b(?:TRUNCATE|UPDATE)\s+(?:storage\.objects|public\.employee_documents)\b/i);
 assert.doesNotMatch(sql,/\bDELETE FROM storage\.objects\b/i);
 assert.match(qa,/SEC_S4_OLD_METADATA_REMOVED/);
 assert.match(qa,/SEC_S4_FRESH_UPLOAD_CLEANUP_BROKEN/);
 assert.match(wf,/qa\/sec_s4_doc_delete_retention_postgres.sql/);
});
