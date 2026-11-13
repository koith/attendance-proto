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
  const triageSql='security/readonly_auto_close_triage_20261105.sql';
  const impactSql='security/readonly_auto_close_impact_20261103.sql';
  const triageFixture='qa/sec_s11_auto_close_triage_canonical_utc_fixture.sql';
  const triageTester='qa_sec_s11_auto_close_triage_canonical_utc_v1.mjs';
  const triageWorkflow='.github/workflows/sec-s11-auto-close-canonical-utc-regression.yml';
  for(const p of [triageSql,impactSql,triageFixture,triageTester,triageWorkflow])
    assert.equal(check([{filename:p,status:'modified'}]).result,'PASS');
  const safeTriage=fs.readFileSync(triageSql,'utf8');
  assert.ok(safeTriage.includes('public.attendance_correction_effective_utc'));
  assert.match(fs.readFileSync(impactSql,'utf8'),/public\.attendance_correction_effective_utc/);
  assert.doesNotMatch(safeTriage,/^\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|TRUNCATE)\b/im);
  assert.match(fs.readFileSync(triageFixture,'utf8'),/synthetic-only disposable PG16\/17 fixture/);
  assert.match(fs.readFileSync(triageWorkflow,'utf8'),/postgres:\$\{\{ matrix.pg \}\}-alpine/);
  assert.throws(()=>check([{filename:'security/readonly_auto_close_triage_UNVERIFIED.sql',status:'added'}]),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  const a2Sql='security/readonly_sec_a2_live_audit_orphan_custody_20261113.sql';
  assert.equal(check([{filename:a2Sql,status:'added'}]).result,'PASS');
  const evidence=fs.readFileSync(a2Sql,'utf8');
  assert.match(evidence,/private\.attendance_mutation_audit_v1/);
  assert.match(evidence,/without_event_payload/);
  assert.match(evidence,/full_original_matches/);
  assert.match(evidence,/immutable_guards/);
  assert.doesNotMatch(evidence,/^\s*(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/im);
  assert.throws(()=>check([{filename:'security/readonly_sec_a2_undeclared.sql',status:'added'}]),
    /SEC_NO_WRITE_DISALLOWED_CHANGE/);

  for(const p of ['qa_live_sec_s05_unauthorized_rpc_readonly_v1.mjs',
    'security/readonly_sec_s05_unauthorized_rpc_preflight_20261113.sql'])
    assert.equal(check([{filename:p,status:'added'}]).result,'PASS');
  const live=fs.readFileSync('qa_live_sec_s05_unauthorized_rpc_readonly_v1.mjs','utf8');
  const sql=fs.readFileSync('security/readonly_sec_s05_unauthorized_rpc_preflight_20261113.sql','utf8');
  const workflow=fs.readFileSync('.github/workflows/qa-live-test-controls-v1.yml','utf8');
  assert.match(live,/assert\.equal\(allow\.size,10\)/);
  assert.match(live,/response\.status===401 \|\| response\.status===403/);
  assert.match(sql,/anonymous_execute_allowed/);
  assert.match(sql,/possible_mutating_body/);
  assert.match(workflow,/node qa_live_sec_s05_unauthorized_rpc_readonly_v1\.mjs/);
  assert.doesNotMatch(live,/\['(?:punch|hq_store_register|hq_store_activate|store_limited_employee_update)'/);
  assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/im);

  const auditPath='security/readonly_sec_s08_authenticated_acl_20261113.sql';
  assert.equal(check([{filename:auditPath,status:'added'}]).result,'PASS');
  const audit=fs.readFileSync(auditPath,'utf8');
  assert.match(audit,/WITH inventory AS MATERIALIZED/);
  assert.match(audit,/has_function_privilege\('authenticated'/);
  assert.match(audit,/unexpected_signatures/);
  assert.doesNotMatch(audit,/^\s*(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/im);

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

test('SEC-S5 guarded-versus-unguarded real HTTP fixture stays isolated and cannot publish app or auth settings',()=>{
 const changed=[
  {filename:'.github/workflows/sec01-disposable-session-guard.yml',status:'modified'},
  {filename:'qa_admin_session_postgrest_setup.sql',status:'modified'},
  {filename:'qa_admin_session_postgrest_http_v1.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 assert.equal(check(changed).result,'PASS');
 assert.throws(()=>check(changed.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const wf=fs.readFileSync('.github/workflows/sec01-disposable-session-guard.yml','utf8');
 const setup=fs.readFileSync('qa_admin_session_postgrest_setup.sql','utf8');
 const qa=fs.readFileSync('qa_admin_session_postgrest_http_v1.mjs','utf8');
 assert.match(wf,/pg: \['16','17'\]/);
 assert.match(wf,/PGRST_DB_PRE_REQUEST=session_guard\.require_latest_session/);
 assert.match(wf,/PGRST_SERVER_PORT=3001/);
 assert.match(wf,/sec01-postgrest-unguarded/);
 assert.doesNotMatch(setup,/^ALTER ROLE authenticator SET pgrst\.db_pre_request/m,
  'No persistent in-db hook: comparator is unguarded');
 assert.match(qa,/const withoutGuard='http:\/\/127\.0\.0\.1:3001'/);
 assert.match(qa,/assert\.equal\(unguarded\.status,200/);
 assert.match(qa,/SESSION_SUPERSEDED/);
 for(const src of [wf,setup,qa]) {
  assert.doesNotMatch(src,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN/,
   'No production secret binding in isolated S5 QA');
 }
});

test('SEC-S5 Storage latest admin session policy is exact SQL-only scope and real PG16/17',()=>{
 const changes=[
  {filename:'security/sec_s5_storage_admin_session_helper_v1.sql',status:'added'},
  {filename:'security/sec_s5_storage_admin_session_rollback_v1.sql',status:'added'},
  {filename:'qa/sec_s5_storage_admin_session_pg.sql',status:'added'},
  {filename:'.github/workflows/sec-s5-storage-admin-session-pg.yml',status:'added'},
  {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 assert.equal(check(changes).result,'PASS');
 assert.throws(()=>check(changes.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const sql=fs.readFileSync('security/sec_s5_storage_admin_session_helper_v1.sql','utf8');
 const revert=fs.readFileSync('security/sec_s5_storage_admin_session_rollback_v1.sql','utf8');
 const qa=fs.readFileSync('qa/sec_s5_storage_admin_session_pg.sql','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-s5-storage-admin-session-pg.yml','utf8');
 assert.match(sql,/PERFORM session_guard\.require_latest_session\(\)/);
 assert.match(sql,/public\.can_manage_store\(e\.store_id\)/);
 assert.match(sql,/public\.is_hq_admin\(\)/);
 assert.match(revert,/SEC_S5_STORAGE_ROLLBACK_UNEXPECTED_STATE/);
 assert.match(revert,/public\.can_manage_store\(e\.store_id\)/);
 assert.match(qa,/SEC_S5_OLD_STORAGE_SESSION_WAS_NOT_REVOKED/);
 assert.match(qa,/SEC_S5_CURRENT_ADMIN_STORAGE_ACCESS_BROKEN/);
 assert.match(wf,/pg: \['16','17'\]/);
 for(const x of [sql,revert,qa]) {
  assert.doesNotMatch(x,/\b(?:DELETE FROM|UPDATE|TRUNCATE)\s+(?:storage\.objects|public\.employees|public\.employee_documents)\b/i);
 }
});

test('SEC-A1 actual two client VOID_ADD duplicate cancellation fix is non-operating scope',()=>{
 const paths=[
 'qa/sec_a1_original_store_correction_production.sql',
 'security/sec_a1_void_add_lock_fix.sql',
 'security/sec_a1_void_add_lock_rollback.sql',
 'qa/sec_a1_void_add_bootstrap.sql',
 'qa/sec_a1_void_add_before.sql','qa/sec_a1_void_add_reset.sql','qa/sec_a1_void_add_after.sql',
 '.github/workflows/sec-a1-void-concurrency-pg.yml',
 'scripts/security/no_operating_write_scope.mjs','scripts/security/no_operating_write_scope.test.mjs'];
 assert.equal(check(paths.map(filename=>({filename,status:'modified'}))).result,'PASS');
 assert.throws(()=>check(paths.concat('index.html').map(filename=>({filename,status:'modified'}))),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const original=fs.readFileSync('qa/sec_a1_original_store_correction_production.sql','utf8');
 const patch=fs.readFileSync('security/sec_a1_void_add_lock_fix.sql','utf8');
 const rollback=fs.readFileSync('security/sec_a1_void_add_lock_rollback.sql','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-a1-void-concurrency-pg.yml','utf8');
 assert.match(original,/IF p_action='VOID_ADD' THEN/);
 assert.match(patch,/SEC_A1_VOID_ADD_SOURCE_DRIFT_STOP/);
 assert.match(patch,/FOR UPDATE/);
 assert.match(patch,/Serialize direct cancellation, replacement, manual ADD/);
 assert.match(patch,/hashtext\('punch_emp_'\|\|p_employee_id::text\)/);
 assert.match(rollback,/SEC_A1_VOID_ADD_ROLLBACK_MISMATCH/);
 assert.match(wf,/concurrent baseline/);
 assert.match(wf,/concurrent patched/);
 assert.match(wf,/pg: \['16','17'\]/);
});

test('SEC-A2 v3 immutable private INSERT audit is security-only and PG16/17 verified',()=>{
 const changed=[
  'security/sec_a2_correction_insert_audit_v3.sql',
  'security/sec_a2_correction_insert_audit_v3_rollback.sql',
  'qa/sec_a2_correction_insert_audit_postgres.sql',
  '.github/workflows/sec-a2-correction-insert-audit-pg.yml',
  'scripts/security/no_operating_write_scope.mjs',
  'scripts/security/no_operating_write_scope.test.mjs'
 ].map(filename=>({filename,status:'modified'}));
 assert.equal(check(changed).result,'PASS');
 assert.throws(()=>check(changed.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const sql=fs.readFileSync('security/sec_a2_correction_insert_audit_v3.sql','utf8');
 const rollback=fs.readFileSync('security/sec_a2_correction_insert_audit_v3_rollback.sql','utf8');
 const qa=fs.readFileSync('qa/sec_a2_correction_insert_audit_postgres.sql','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-a2-correction-insert-audit-pg.yml','utf8');
 assert.match(sql,/SEC_A2_V3_AUDIT_ACL_DRIFT/);
 assert.match(sql,/TG_OP<>'INSERT'/);
 assert.match(sql,/row_before IS NULL AND row_after IS NOT NULL/);
 assert.match(sql,/sec_a2_audit_no_rewrite_v2/);
 assert.match(sql,/CREATE TRIGGER sec_a2_correction_insert_audit_v3/);
 assert.match(rollback,/SEC_A2_V3_ROLLBACK_LOST_HISTORY_GUARD/);
 assert.match(qa,/SEC_A2_V3_ORIGINAL_GAP_NOT_REPRODUCED/);
 assert.match(qa,/SEC_A2_V3_HISTORY_INCOMPLETE/);
 assert.match(wf,/pg: \['16','17'\]/);
 for(const src of [sql,rollback]) {
  assert.doesNotMatch(src,/\b(?:DELETE FROM|TRUNCATE)\s+(?:public\.(?:event_corrections|correction_requests)|private\.attendance_mutation_audit_v1)\b/i);
 }
});

test('SEC B2/B5 read-only production logical archive capture and private offline GPG verification are security-only',()=>{
 const names=[
  'security/sec_b1_readonly_logical_capture.sql',
  'scripts/security/sec_b1_verify_encrypted_logical_backup.py',
  'scripts/security/sec_b1_verify_encrypted_logical_backup_test.py',
  '.github/workflows/sec-b1-private-logical-custody.yml',
  'SECURITY_STABILITY_LEDGER_20261103.md',
  'scripts/security/no_operating_write_scope.mjs',
  'scripts/security/no_operating_write_scope.test.mjs'
 ];
 assert.equal(check(names.map(filename=>({filename,status:'modified'}))).result,'PASS');
 assert.throws(()=>check(names.concat('index.html').map(filename=>({filename,status:'modified'}))),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const sql=fs.readFileSync('security/sec_b1_readonly_logical_capture.sql','utf8');
 const py=fs.readFileSync('scripts/security/sec_b1_verify_encrypted_logical_backup.py','utf8');
 const qa=fs.readFileSync('scripts/security/sec_b1_verify_encrypted_logical_backup_test.py','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-b1-private-logical-custody.yml','utf8');
 assert.match(sql,/__SECRET_FROM_PRIVATE_ESCROW__/);
 assert.match(sql,/pgp_sym_encrypt\(payload/);
 assert.match(sql,/query_to_xml/);
 assert.match(sql,/session_guard/);
 assert.match(sql,/cipher_sha256/);
 assert.doesNotMatch(sql,/\b(?:UPDATE\s+public\.|DELETE\s+FROM\s+public\.|TRUNCATE\s+public\.)/i);
 assert.match(py,/rows_redecoded_and_json_parsed/);
 assert.match(py,/database_sql_restore_performed':False/);
 assert.match(qa,/test_tampered_archive_sha_fails/);
 assert.match(qa,/test_wrong_key_fails_closed/);
 assert.match(wf,/synthetic CI/);
 assert.doesNotMatch(wf,/SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN/);
});

test('SEC-R2 staging restore harness is strict isolated-only, synthetic real PG16/17',()=>{
 const paths=[
 'scripts/security/sec_restore_logical_pg.py',
 'scripts/security/sec_restore_logical_pg_test.py',
 '.github/workflows/sec-b1-private-logical-custody.yml',
 'SECURITY_STABILITY_LEDGER_20261103.md',
 'scripts/security/no_operating_write_scope.mjs',
 'scripts/security/no_operating_write_scope.test.mjs'
 ];
 assert.equal(check(paths.map(filename=>({filename,status:'modified'}))).result,'PASS');
 assert.throws(()=>check(paths.concat('index.html').map(filename=>({filename,status:'modified'}))),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const src=fs.readFileSync('scripts/security/sec_restore_logical_pg.py','utf8');
 const qa=fs.readFileSync('scripts/security/sec_restore_logical_pg_test.py','utf8');
 const wf=fs.readFileSync('.github/workflows/sec-b1-private-logical-custody.yml','utf8');
 assert.match(src,/sec_restore_\[a-z0-9_\]/);
 assert.match(src,/jsonb_populate_recordset/);
 assert.match(src,/full_operational_restore':False/);
 assert.match(src,/isolated PostgreSQL restore failed/);
 assert.match(qa,/test_wrong_key_fails_before_restore/);
 assert.match(qa,/test_sql_injection_type_fails/);
 assert.match(wf,/pg: \['16','17'\]/);
 assert.match(wf,/PostgreSQL actual typed data rehydration/);
 assert.doesNotMatch(wf,/SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|production/);
});

test('A2 v4 synthetic JWT claim attribution is non-operating and denies unrelated changes',()=>{
  const changed=[
    {filename:'security/sec_a2_claim_attribution_v4.sql',status:'added'},
    {filename:'security/sec_a2_claim_attribution_v4_rollback.sql',status:'added'},
    {filename:'qa/sec_a2_claim_attribution_postgres.sql',status:'added'},
    {filename:'.github/workflows/sec-a2-claim-attribution-pg.yml',status:'added'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(changed).result,'PASS');
  assert.throws(()=>check(changed.concat({filename:'supabase/migrations/20261111_unauthorized.sql',status:'added'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  assert.throws(()=>check(changed.concat({filename:'index.html',status:'modified'})),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
  const sql=fs.readFileSync('security/sec_a2_claim_attribution_v4.sql','utf8');
  const rb=fs.readFileSync('security/sec_a2_claim_attribution_v4_rollback.sql','utf8');
  const fixture=fs.readFileSync('qa/sec_a2_claim_attribution_postgres.sql','utf8');
  const ci=fs.readFileSync('.github/workflows/sec-a2-claim-attribution-pg.yml','utf8');
  assert.match(sql,/request\.jwt\.claims/);
  assert.match(sql,/SEC_A2_V4_PRIVATE_AUDIT_ACL_DRIFT/);
  assert.match(sql,/sec_a2_request_identity_v4/);
  assert.match(rb,/DROP FUNCTION private\.sec_a2_request_identity_v4/);
  assert.doesNotMatch(rb,/\b(?:DELETE FROM|TRUNCATE)\s+(?:private|public)\./i);
  assert.match(fixture,/SEC_A2_V4_ORIGINAL_GAP_NOT_REPRODUCED/);
  assert.match(fixture,/ROLLBACK;/);
  assert.match(ci,/postgres:.*matrix\.pg/);
  assert.doesNotMatch(ci,/SUPABASE_(?:DB_URL|SERVICE_ROLE_KEY|ACCESS_TOKEN)/);
});


test('D5 owner-protected scheduled sealed backup fails closed and notifies failures',()=>{
  const changed=[
    {filename:'.github/workflows/sec-backup-capture.yml',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
    {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
  ];
  assert.equal(check(changed).result,'PASS');
  const workflow=fs.readFileSync('.github/workflows/sec-backup-capture.yml','utf8');
  assert.match(workflow,/schedule:\s*\n\s*-\s*cron:\s*'47 16 \* \* \*'/);
  assert.match(workflow,/environment:\s*production-backup/);
  assert.match(workflow,/BACKUP_PROTECTED_CREDENTIALS_PRESENT=true/);
  assert.match(workflow,/SUPABASE_DB_URL/);
  assert.match(workflow,/cancel-in-progress:\s*false/);
  assert.match(workflow,/head -c 15/);
  assert.match(workflow,/BACKUP-SEALED-1/);
  assert.match(workflow,/retention-days:\s*30/);
  assert.match(workflow,/notify-failure:/);
  assert.match(workflow,/issues:\s*write/);
  assert.match(workflow,/SEC-D5-BACKUP-ALERT/);
  assert.doesNotMatch(workflow,/\bcontents:\s*write/);
  assert.doesNotMatch(workflow,/\b(?:pull_request_target|workflow_run):/);
});


test('D5 readiness uses real protected credential presence, not unused manual ready flag',()=>{
  const workflow=fs.readFileSync('.github/workflows/sec-backup-capture.yml','utf8');
  assert.match(workflow,/environment:\s*production-backup/);
  assert.match(workflow,/BACKUP_PROTECTED_CREDENTIALS_PRESENT=true/);
  assert.match(workflow,/BACKUP_BLOCKED_DB_CONNECTION/);
  assert.match(workflow,/BACKUP_BLOCKED_STORAGE_CREDENTIAL/);
  assert.match(workflow,/BACKUP_BLOCKED_AUTH_CONFIG_CREDENTIAL/);
  assert.match(workflow,/BACKUP_BLOCKED_MISSING_REQUIRED_CREDENTIAL/);
  assert.doesNotMatch(workflow,/test "\$SEC_BACKUP_ENV_READY" = 'true'/);
});

test('AISEC reviewed provider boundary files are exact-scoped and do not widen operating writes',()=>{
 const approved=[
  {filename:'.github/workflows/sec-autopilot-boundary-regression.yml',status:'added'},
  {filename:'scripts/security/autopilot/propose.mjs',status:'modified'},
  {filename:'scripts/security/autopilot/provider_env.mjs',status:'added'},
  {filename:'qa/security/autopilot/provider_env.test.mjs',status:'added'},
  {filename:'qa/security/autopilot/sandbox_runtime.test.mjs',status:'added'},
  {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 const r=check(approved);
 assert.equal(r.result,'PASS');
 assert.equal(r.changed_paths.length,approved.length);
 for(const forbidden of ['index.html','.github/workflows/agent-unreviewed.yml',
  'supabase/migrations/security_auth.sql','scripts/security/autopilot/unreviewed.mjs',
  'qa/security/autopilot/unknown.test.mjs']){
  assert.throws(()=>check([...approved,{filename:forbidden,status:'added'}]),
    /SEC_NO_WRITE_DISALLOWED_CHANGE/,forbidden);
 }
 const safe=fs.readFileSync('scripts/security/autopilot/propose.mjs','utf8');
 assert.match(safe,/restrictedProviderEnv\(process\.env\)/);
 assert.doesNotMatch(safe,/const env=\{\.\.\.process\.env\}/);
 const proof=fs.readFileSync('.github/workflows/sec-autopilot-boundary-regression.yml','utf8');
 assert.match(proof,/permissions:\s*\n\s*contents: read/);
 assert.match(proof,/--network none --read-only --cap-drop ALL/);
});

test('D5 outdated readiness assertion repair remains strictly test-and-workflow only',()=>{
 const approved=[
  {filename:'.github/workflows/sec-backup-capture.yml',status:'modified'},
  {filename:'qa/security/backup_dispatch_guard.test.mjs',status:'modified'}
 ];
 assert.equal(check(approved).result,'PASS');
 assert.throws(()=>check([...approved,{filename:'supabase/functions/server-sync-sheet/index.ts',status:'modified'}]),
  /SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const yaml=fs.readFileSync('.github/workflows/sec-backup-capture.yml','utf8');
 const testSource=fs.readFileSync('qa/security/backup_dispatch_guard.test.mjs','utf8');
 assert.doesNotMatch(yaml,/SEC_BACKUP_ENV_READY|BACKUP_BLOCKED_PROTECTED_ENV_NOT_READY/);
 assert.match(yaml,/BACKUP_BLOCKED_MISSING_REQUIRED_CREDENTIAL/);
 assert.match(testSource,/BACKUP_BLOCKED_MISSING_REQUIRED_CREDENTIAL/);
});

test('AISEC acceptance ledger and its status assertions are reviewed no-operating-write changes',()=>{
 const changes=[
  {filename:'AI_AUTOMATION_SECURITY_LEDGER_20261104.md',status:'modified'},
  {filename:'qa/security/autopilot/autopilot_contract.test.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.mjs',status:'modified'},
  {filename:'scripts/security/no_operating_write_scope.test.mjs',status:'modified'}
 ];
 assert.equal(check(changes).result,'PASS');
 assert.throws(()=>check([...changes,{filename:'index.html',status:'modified'}]),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 assert.throws(()=>check([...changes,{filename:'.github/workflows/unknown.yml',status:'modified'}]),/SEC_NO_WRITE_DISALLOWED_CHANGE/);
 const ledger=fs.readFileSync('AI_AUTOMATION_SECURITY_LEDGER_20261104.md','utf8');
 assert.match(ledger,/AISEC-02 \|[^\n]*\| COMPLETE \|/);
 assert.match(ledger,/AISEC-04 \|[^\n]*\| COMPLETE \|/);
});
