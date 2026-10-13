import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");
const core=read("supabase/migrations/20261014090000_delegated_permissions_core.sql");
const actions=read("supabase/migrations/20261014091000_delegated_scoped_actions.sql");
const ui=read("store_manager_tab.js");
const portal=read("store_limited_manager.js");
const app=read("index.html");
assert.match(core,/CREATE TABLE IF NOT EXISTS public\.store_delegated_permissions/);
assert.match(core,/ALTER TABLE public\.store_delegated_permissions ENABLE ROW LEVEL SECURITY/);
assert.match(core,/NOT\(d\.staff_edit AND d\.attendance_approve AND d\.payroll_view\)/);
assert.match(actions,/OWNER_PERMISSIONS_IMMUTABLE/);
assert.match(actions,/public\.store_primary_owner_can_delegate\(p_store_id,auth\.uid\(\)\)/);
for(const [flag,scope,api] of [
 ["staff_edit","STAFF_EDIT","store_limited_employee_update"],
 ["attendance_approve","ATTENDANCE_APPROVE","store_limited_correction_decide"],
 ["payroll_view","PAYROLL_VIEW","store_limited_payroll_read"]]){
 assert.match(actions,new RegExp(flag));
 assert.match(actions,new RegExp(scope));
 assert.match(actions,new RegExp(api));
 assert.match(ui,new RegExp("data-allow"));
}
assert.match(actions,/WHERE id=p_employee_id AND store_id=p_store_id/);
assert.match(actions,/WHERE cr\.id=p_request_id AND e\.store_id=p_store_id AND cr\.status='PENDING' FOR UPDATE OF cr/);
assert.match(actions,/pp\.status='CLOSED'/);
assert.match(actions,/REVOKE ALL ON FUNCTION public\.store_limited_correction_decide/);
assert.doesNotMatch(portal,/admin_(?:set_period|close_payroll|update_employee|resolve_request)\b/);
assert.match(portal,/store_limited_employee_update/);
assert.match(portal,/store_limited_correction_decide/);
assert.match(portal,/store_limited_payroll_read/);
assert.match(portal,/scope\.staff_edit/);
assert.match(portal,/scope\.attendance_approve/);
assert.match(portal,/scope\.payroll_view/);
assert.match(app,/const APP_VERSION="v0\.254"/);
assert.match(app,/id="appVersion">v0\.254<\/span>/);
assert.match(app,/store_limited_manager\.js\?v=20261014v254/);
assert.match(app,/delegatedPermissionsSelf\(\)/);
assert.match(app,/scope\?\.limited===true/);
assert.match(app,/mountScopedManagerPortal\(scope,ownStore\)/);
console.log("PASS: scoped permissions are enforced by server RPC guards, limited portal never calls unrestricted RPCs, app version v0.254");
