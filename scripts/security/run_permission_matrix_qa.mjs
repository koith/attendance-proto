// SEC-S05..S10: explicit role/call-path contract matrix. The listed checks
// inspect repository migrations and synthetic fixtures only, not live services.
// HTTP negative tests and production role/JWT verification remain separate.
import {spawnSync} from 'node:child_process';
const checks=[
 {role:'anonymous',control:'global-admin-rpc',path:'qa_global_admin_rpc_hq_boundary_v1.mjs'},
 {role:'anonymous',control:'null-pin-fail-closed',path:'qa_null_pin_auth_fail_closed_v1.mjs'},
 {role:'anonymous',control:'pin-rpc-store-scope',path:'qa_pin_rpc_store_scope_v1.mjs'},
 {role:'staff',control:'employee-contract-store-scope',path:'qa_employee_contract_status_store_scope_v1.mjs'},
 {role:'staff',control:'mandatory-pin-on-creation',path:'qa_staff_creation_pin_required_v1.mjs'},
 {role:'assistant-manager',control:'delegated-manager-permissions',path:'qa_store_delegated_manager_v1.mjs'},
 {role:'store-owner',control:'multistore-payroll-isolation',path:'qa_multistore_payroll_isolation_v1.mjs'},
 {role:'store-owner',control:'hq-store-scope',path:'qa_hq_store_scope_v1.mjs'},
 {role:'hq-admin',control:'hq-role-guard',path:'qa_hq_owner_role_guard_914.mjs'}
];
const safeEnv={...process.env};
for(const name of Object.keys(safeEnv))if(/(?:TOKEN|SECRET|PASSWORD|PRIVATE|OPENAI|SUPABASE|PGHOST|PGUSER|PGDATABASE|DATABASE_URL|GITHUB|GH_|GOOGLE)/i.test(name))delete safeEnv[name];
const results=[];
for(const item of checks){
 const r=spawnSync(process.execPath,[item.path],{cwd:process.cwd(),env:safeEnv,timeout:30000,encoding:'utf8',maxBuffer:1024*1024});
 results.push({role:item.role,control:item.control,result:r.status===0?'PASS':'FAIL',reason:r.status===0?'':r.signal||'EXIT_'+r.status});
}
const failed=results.filter(r=>r.result==='FAIL');
console.log(JSON.stringify({verification_level:'STATIC_OR_SYNTHETIC_ONLY',total:results.length,passed:results.length-failed.length,failed:failed.length,results}));
if(failed.length)process.exitCode=1;
