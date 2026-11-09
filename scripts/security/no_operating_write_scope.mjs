// SEC release classification: pure fail-closed preflight for explicitly reviewed,
// non-runtime commits. This does not authorize DB, Sheet, Auth, or Pages writes.
// No globs: a new path requires a separate reviewed policy change and QA.
const allowedPaths=new Set([
  ".github/workflows/p0-pages-deploy.yml",
  ".github/workflows/verified-pages-deployment-notification.yml",
".github/workflows/sec-autopilot-contract-ci.yml",
  ".github/workflows/store-delegated-manager-postgres.yml",
  ".github/workflows/qa-live-test-controls-v1.yml",
  ".github/workflows/sec-s2-public-trigger-acl-postgres.yml",
  ".github/workflows/sec-a2-attendance-mutation-audit-pg.yml",
  ".github/workflows/qa1243-gotrue-mailpit-live.yml",
  ".github/workflows/qa1243-sec01-preactivation.yml",
  ".github/workflows/sec01-disposable-session-guard.yml",
  "qa_admin_session_postgrest_setup.sql",
  "qa_admin_session_postgrest_http_v1.mjs",
  "security/sec_a2_attendance_mutation_audit_v1.sql",
  "security/sec_a2_audit_immutability_guard_v2.sql",
  "security/sec_s4_employee_docs_store_scoped_rls.sql",
  "security/sec_s4_doc_delete_retention_24h.sql",
  "security/sec_s5_storage_admin_session_helper_v1.sql",
  "security/sec_s5_storage_admin_session_rollback_v1.sql",
  "qa/sec_s5_storage_admin_session_pg.sql",
  ".github/workflows/sec-s5-storage-admin-session-pg.yml",
  "security/sec_s4_doc_delete_retention_rollback_v1.sql",
  "qa/sec_s4_doc_delete_retention_postgres.sql",
  "qa/sec_s4_employee_docs_store_rls_postgres.sql",
  ".github/workflows/sec-s4-employee-doc-storage-rls-pg.yml",
  "qa/sec_a2_audit_immutability_postgres.sql",
  "qa/sec_a2_attendance_mutation_audit_postgres.sql",
  "security/sec_s2_anon_trigger_execute_hardening.sql",
  "qa/sec_s2_anon_trigger_execute_postgres.sql",
  "qa_live_guest_pos_readonly_browser_v384.mjs",
  "qa_live_anonymous_sensitive_readonly_v1.mjs",
  ".github/workflows/qa-live-test-controls-v1.yml",
  "qa_live_version_test_controls_v1.mjs",
  "qa_store_scoped_permissions_postgres.sql",
  "SECURITY_STABILITY_LEDGER_20261103.md",
  "security/SEC_S17_RECOVERY_HANDOVER_PUBLIC_20261106.md",
  "security/readonly_session_hook_audit_20261105.sql",
  "scripts/security/autopilot/delta_guard.mjs",
  "qa/security/autopilot/delta_guard.test.mjs",
  "scripts/security/autopilot/reapply_guard.mjs",
  "qa/security/autopilot/reapply_guard.test.mjs",
  "scripts/security/no_operating_write_scope.mjs",
  "scripts/security/no_operating_write_scope.test.mjs"
]);
const sha=/^[0-9a-f]{40}$/;
export function assertNoOperatingWriteRelease({before,head,status,files}={}){
  if(!sha.test(before||'')||/^0{40}$/.test(before)||!sha.test(head||'')||before===head)
    throw Error('SEC_NO_WRITE_INVALID_COMMIT_RANGE');
  if(status!=='ahead')throw Error('SEC_NO_WRITE_NOT_FAST_FORWARD');
  if(!Array.isArray(files)||files.length===0||files.length>allowedPaths.size)
    throw Error('SEC_NO_WRITE_UNPROVEN_FILE_LIST');
  const names=new Set();
  for(const entry of files){
    if(!entry||typeof entry!=='object'||!['added','modified'].includes(entry.status)||
       typeof entry.filename!=='string'||!allowedPaths.has(entry.filename)||names.has(entry.filename))
      throw Error('SEC_NO_WRITE_DISALLOWED_CHANGE');
    names.add(entry.filename);
  }
  return {result:'PASS',changed_paths:[...names].sort()};
}
