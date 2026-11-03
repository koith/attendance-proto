#!/usr/bin/env bash
set -euo pipefail
# This script only runs on a separate READ-only QA runner.
# The provider API key and GitHub WRITE token must never enter this job.
for secret_name in OPENAI_API_KEY SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ACCESS_TOKEN GH_TOKEN GITHUB_TOKEN; do
  if [[ -n "${!secret_name:-}" ]]; then echo "::error::QA_SECRET_PRESENT: $secret_name"; exit 1; fi
done
changed="$(git diff --cached --name-only)"
changed_tests="$(printf '%s\n' "$changed" | grep -E '^qa_[a-zA-Z0-9_-]+\.mjs$')"
changed_application="$(printf '%s\n' "$changed" | grep -E '^[a-zA-Z0-9_-]+\.(js|html|css)$')"
test -n "$changed_tests" && test -n "$changed_application"
while IFS= read -r test_path; do
  node --check "$test_path"
  node "$test_path"
done <<< "$changed_tests"
node qa_boot_syntax.mjs
node qa_index_startup_smoke_v1.mjs
node qa_runtime_wiring_v1.mjs
if grep -qx 'hq_owner_console.js' <<< "$changed_application"; then
  node qa_hq_quicknav_escape_contract_v1.mjs
  node qa_hq_dashboard_entry_auth.mjs
fi
if grep -qx 'hq_store_onboarding_ui.js' <<< "$changed_application"; then
  node qa_hq_store_onboarding_v1.mjs
  node qa_hq_store_search_owner_activation_v1.mjs
fi
if grep -qx 'store_manager_tab.js' <<< "$changed_application"; then
  node qa_store_delegated_manager_v1.mjs
  node qa_confirmed_owner_permission_v1.mjs
fi
node qa_hq_owner_browser_acceptance.mjs
echo "QA_PASS_UNPRIVILEGED_RUNNER"
