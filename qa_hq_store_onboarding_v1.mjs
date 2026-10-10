import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=[
  'supabase/migrations/20261011023000_hq_store_onboarding_and_manager_roles.sql',
  'supabase/migrations/20261011025500_store_roster_and_invite_boundary.sql'
].map(p=>fs.readFileSync(p,'utf8')).join('\n');
const ui=fs.readFileSync('hq_store_onboarding_ui.js','utf8');
const app=fs.readFileSync('index.html','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const revokeGuard=fs.readFileSync('supabase/migrations/20261011030000_owner_role_revocation_guard.sql','utf8');
assert.match(revokeGuard,/USE_STORE_MANAGER_REVOKE/);
assert.match(revokeGuard,/email_confirmed_at IS NOT NULL/);
assert.match(revokeGuard,/v_total from public.admin_users where admin_role='HQ'/);

const checks=[
 ['HQ-only mutation',/IF NOT public\.is_hq_admin\(\) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'/],
 ['role is store-scoped',/VALUES\(v_uid,v_email,'Store manager assigned by HQ','STORE_MANAGER',p_store_id\)/],
 ['ready needs manager',/p_status='READY' AND p_store_id<>1 AND v_count<1/],
 ['protect Inha',/INHA_PRODUCTION_LOCK/],
 ['last manager protected',/CANNOT_REVOKE_LAST_READY_MANAGER/],
 ['invite service-only',/SERVICE_ONLY/],
 ['invite binds user identity',/a\.user_id=p_actor_id AND a\.admin_role='HQ'/],
 ['original roles protected',/CANNOT_DOWNGRADE_HQ/],
 ['public execute denied',/FROM PUBLIC,anon/]
];
for(const [name,pattern] of checks)assert.match(sql,pattern,name);
assert.match(edge,/mode==="invite_store_manager"/);
assert.match(edge,/client\.auth\.admin\.inviteUserByEmail\(email,\{redirectTo:/);
assert.match(edge,/client\.rpc\("service_store_manager_attach_invited_user"/);
assert.match(edge,/actor\.adminRole!=="HQ"/);
assert.match(ui,/hq_stores_onboarding_list/);
assert.match(ui,/hq_store_manager_assign/);
assert.match(ui,/hq_store_onboarding_set/);
assert.match(ui,/hq_store_register/);
assert.match(ui,/hq_store_manager_revoke/);
assert.match(ui,/invite_store_manager/);
assert.match(ui,/entryUrl=id=>location\.origin\+location\.pathname/);
assert.match(app,/hq_store_onboarding_ui\.js\?v=20261011v200/);
assert.match(edge,/owner_activation\.html/);
const activation=fs.readFileSync('owner_activation.js','utf8');
assert.match(activation,/auth\\/v1\\/user/);
assert.match(activation,/admin_context/);
assert.match(activation,/ctx\\?\\.role!=="STORE_MANAGER"/);
assert.match(activation,/location\\.replace\\("index\\.html\\?mode=store&store="/);
assert.doesNotMatch(activation,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(app,/window\.mountHqStoreOnboarding\(box\)/);
assert.match(app,/ctx\?\.role==="STORE_MANAGER"/);
assert.match(app,/ownerIds\.has\(a\.user_id\)/);
assert.match(app,/location\.assign\(STORE_ENTRY_URL\(ownStore\)\)/);
assert.match(app,/if\(LIVE && typeof BE\.serverPayroll==="function"\)/);
assert.match(app,/!info\?\.store_ready/);
assert.doesNotMatch(ui,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
console.log('PASS HQ manager onboarding, staged store gating, owner scoped pages and password-safe invitation UI');
