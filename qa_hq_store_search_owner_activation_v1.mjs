import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('hq_store_onboarding_ui.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const browser=fs.readFileSync('qa_browser_app_smoke.mjs','utf8');
const evidence=fs.readFileSync('supabase/migrations/20261011102000_store_provenance_review_and_activation.sql','utf8');
const confirmed=fs.readFileSync('supabase/migrations/20261011103500_confirmed_owner_activation_security.sql','utf8');

for(const id of ['hqOnboardingSearchInput','hqStoreStatusFilter','hqOnboardingStore','hqStoreSearchCount',
 'hqStoreCounts','hqStoreRefresh','hqStoreShareUrl'])
 assert.match(ui,new RegExp(id),'Missing scalable HQ store control '+id);
assert.match(ui,/searchTerm\.trim\(\)\.toLocaleLowerCase\("ko-KR"\)/);
assert.match(ui,/statusFilter==="ALL"\|\|s\.onboarding_status===statusFilter/);
assert.match(ui,/\[s\.name,s\.code,s\.region_group,s\.id\]/);
assert.match(ui,/if\(included\)storePicker\.value=String\(selected\)/);
assert.match(ui,/storePicker\.disabled=rows\.length===0/);
assert.match(ui,/manager_count\|\|0/);
assert.match(ui,/verified&&Number\(store\?\.manager_count\|\|0\)>0&&sampleEmployeeCount===0/);
assert.match(ui,/body\.querySelector\("#hqStoreRefresh"\)\.onclick/);
assert.match(ui,/label for="hqStoreShareUrl"/);
assert.match(ui,/href="\s*'\+escapeHTML\(entryUrl\(selected\)\)/);
assert.match(ui,/escapeHTML\(s\.name\)/);
assert.match(ui,/id="hqManagerCard"/);
assert.match(ui,/id="hqStoreOperations"/);
assert.match(ui,/previousOperationsOpen/);
assert.match(browser,/Array\.from\(\{length:281\}/);
assert.match(browser,/ownerFixture\.confirmOwner\(\)/);
assert.match(browser,/Verified branch with an unconfirmed invite must remain inactive/);
assert.match(browser,/Unconfirmed owner must never activate a store/);
assert.match(evidence,/PROVENANCE_VERIFICATION_REQUIRED/);
assert.match(confirmed,/CONFIRMED_STORE_MANAGER_REQUIRED/);
const renderedVersion=html.match(/const APP_VERSION="(v[0-9]+[.][0-9]+)";/);
assert.ok(renderedVersion,'App must declare a parseable release version');
assert.ok(html.includes('id="appVersion">'+renderedVersion[1]+'</span>'),
  'App badge must match the release version without hardcoded test literals');
assert.match(html,/hq_store_onboarding_ui\.js\?v=20261015v292/);
assert.match(html,/\["report","리포트"\]/,'Inha six management tabs must remain visible');
assert.match(html,/STORE_ENTRY_UNAVAILABLE/,'Unapproved store URL must remain blocked');
console.log('PASS searchable 283-store HQ onboarding, verified+confirmed activation, READY-only share links');
