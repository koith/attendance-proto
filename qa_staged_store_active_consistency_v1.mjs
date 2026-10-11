import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261011124000_staged_store_inactive_consistency.sql','utf8');
const signup=fs.readFileSync('supabase/migrations/20261011023000_hq_store_onboarding_and_manager_roles.sql','utf8');
const provenance=fs.readFileSync('supabase/migrations/20261011102000_store_provenance_review_and_activation.sql','utf8');
const confirmed=fs.readFileSync('supabase/migrations/20261011103500_confirmed_owner_activation_security.sql','utf8');

assert.match(sql,/ALTER TABLE public\.stores ALTER COLUMN is_active SET DEFAULT false/);
assert.match(sql,/UPDATE public\.stores\s+SET is_active=false\s+WHERE onboarding_status IN \('STAGED','SUSPENDED'\)/);
assert.match(sql,/AND id<>1/,'The original Inha READY store must be protected');
assert.match(sql,/ADD CONSTRAINT stores_ready_active_consistency/);
assert.match(sql,/CHECK \(is_active=\(onboarding_status='READY'\)\)/);
assert.doesNotMatch(sql,/UPDATE public\.stores[^;]*SET onboarding_status\s*=/s,
  'The normalization must never promote a STAGED store');
assert.doesNotMatch(sql,/(?:DELETE|TRUNCATE)\s+(?:FROM\s+)?public\./i,
  'No production data is removed');
assert.match(signup,/STAGED/);
assert.match(provenance,/PROVENANCE_VERIFICATION_REQUIRED/);
assert.match(confirmed,/CONFIRMED_STORE_MANAGER_REQUIRED/);
console.log('PASS staged/READY active consistency without activating any pending branch or altering Inha');
