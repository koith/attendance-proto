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
assert.match(core,/NOT\s*\(d\.staff_edit AND d\.attendance_approve AND d\.payroll_view\)/);
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
assert.match(app,/const APP_VERSION="v0\.255"/);
assert.match(app,/id="appVersion">v0\.255<\/span>/);
assert.match(app,/store_limited_manager\.js\?v=20261014v254/);
assert.ok(app.includes("delegatedPermissionsSelf()"));
const legacyGuard=read("supabase/migrations/20261014110000_restricted_admin_legacy_gate.sql");
assert.ok(legacyGuard.includes("CREATE OR REPLACE FUNCTION public.is_admin()"));
assert.ok(legacyGuard.includes("CREATE OR REPLACE FUNCTION public.admin_context()"));
assert.ok(legacyGuard.includes("NOT(d.staff_edit AND d.attendance_approve AND d.payroll_view)"));
assert.ok(app.includes("loginContext=await BE.adminContext()"));
assert.ok(!app.includes("ok = await BE.isAdmin()"));
assert.match(app,/scope\?\.limited===true/);
assert.match(app,/mountScopedManagerPortal\(scope,ownStore\)/);
console.log("PASS: scoped permissions are enforced by server RPC guards, limited portal never calls unrestricted RPCs, app version v0.254");

const edge=read("supabase/functions/server-sync-sheet/index.ts");
const edgeMirror=read("edge-release/supabase/functions/server-sync-sheet/index.ts");
assert.equal(edge,edgeMirror,"Edge code deployed from mirror must match canonical exactly");
const guardStart=edge.indexOf('    if(!actor.internal && actor.adminRole==="STORE_MANAGER"){');
const guardEnd=edge.indexOf('    if(["payroll_close_preview","payroll_close","payroll_reopen"].includes(mode)){',guardStart);
assert.ok(guardStart>0&&guardEnd>guardStart,"limited admin guard must precede ALL generic payroll/sync handling");
const guard=edge.slice(guardStart,guardEnd);
assert.match(guard,/DELEGATED_RESTRICTED_EDGE_ACCESS/);
assert.match(guard,/DELEGATED_ACCESS_CHECK_FAILED/);
assert.match(guard,/\.eq\("store_id",storeId\)\.eq\("user_id",actor\.userId\)/);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const checkGuard=new AsyncFunction("actor","client","HttpError","storeId",guard);
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const makeClient=(grants,error=null)=>({from:table=>{
 assert.equal(table,"store_delegated_permissions");
 return {select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:grants,error})})})})};
}});
const actor={internal:false,adminRole:"STORE_MANAGER",userId:"synthetic-primary-or-delegate",storeId:2};
for(const grants of [
 {staff_edit:false,attendance_approve:true,payroll_view:true},
 {staff_edit:true,attendance_approve:false,payroll_view:true},
 {staff_edit:true,attendance_approve:true,payroll_view:false},
 {staff_edit:false,attendance_approve:false,payroll_view:false}
]){
 await assert.rejects(()=>checkGuard(actor,makeClient(grants),HttpError,2),e=>e.status===403&&e.message==="DELEGATED_RESTRICTED_EDGE_ACCESS");
}
await assert.rejects(()=>checkGuard(actor,makeClient(null,{message:"synthetic"}),HttpError,2),e=>e.status===503);
await checkGuard(actor,makeClient(null),HttpError,2); // pre-existing full permission
await checkGuard(actor,makeClient({staff_edit:true,attendance_approve:true,payroll_view:true}),HttpError,2);
await checkGuard({...actor,adminRole:"HQ"},makeClient(null),HttpError,2);
await checkGuard({...actor,internal:true},makeClient(null),HttpError,2);
console.log("PASS: real Edge branch denies every limited grant, fails closed on DB error, preserves HQ/full managers");

const defaultDeny=read("supabase/migrations/20261014100000_delegated_default_deny.sql");
assert.match(defaultDeny,/AFTER INSERT ON public\.admin_users/);
assert.match(defaultDeny,/NEW\.admin_role='STORE_MANAGER'/);
assert.match(defaultDeny,/VALUES\(NEW\.store_id,NEW\.user_id,false,false,false\)/);
assert.match(defaultDeny,/ON CONFLICT \(store_id,user_id\) DO NOTHING/);
console.log("PASS: new store-manager accounts start with an explicit deny-all profile");
