import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// #914: regression test: store manager != HQ and an invited but unverified
// account must never look like an activated primary owner.
const hq=fs.readFileSync("hq_owner_console.js","utf8");
const index=fs.readFileSync("index.html","utf8");
const sql=fs.readFileSync("supabase/migrations/20261016_hq_store_manager_eligibility_safe_read.sql","utf8");
new vm.Script(hq,{filename:"hq_owner_console.js"});
assert.match(index,/APP_VERSION="v0\.(?:294|295|296|297|298)"/);
assert.match(index,/hq_owner_console\.js\?v=20261016v(?:294|295|297|298)/);
assert.match(index,/managerIds=new Set\(managerRows\.map\(x=>x\.user_id\)\)/);
assert.match(index,/ownerIds=new Set\(ownerRows\.map\(x=>x\.user_id\)\)/);
assert.match(index,/isManager\?"지점 관리자":a\.is_admin\?"본사 관리자"/);
assert.match(index,/isOwner\?"지점 대표 관리자"/);
assert.match(hq,/hq_store_manager_eligibility_list/);
assert.match(hq,/isHqAccount=a=>a\?\.is_admin===true&&!managerIds\(\)\.has\(a\.user_id\)/);
assert.match(hq,/linkedManager=managers\.find\(m=>m\.user_id===found\.user_id\)/);
assert.match(hq,/이 계정은 이미 /);
assert.match(hq,/인증·비밀번호 설정 대기/);
assert.match(hq,/activeTab===\"status\"\?statusPanel/);
assert.doesNotMatch(hq,/if\(found\)return alert\(found\.is_admin/);
assert.match(sql,/IF NOT public\.is_hq_admin\(\) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'/);
assert.match(sql,/u\.email_confirmed_at IS NOT NULL/);
assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC, anon/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION .* TO authenticated/);
console.log("PASS: #914 distinct HQ/store/owner roles, unconfirmed invitation safeguard, safe RPC");
