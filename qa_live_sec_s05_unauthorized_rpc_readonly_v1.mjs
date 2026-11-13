// SEC-S05: actual hosted anonymous/forged JWT denial of protected READ-ONLY RPCs.
// Host/payloads are fixed; NEVER send a real user's ID, PIN, wage, token, or data.
// The production functions below were independently verified from pg_proc as
// SELECT-only and anon EXECUTE=false before this test was authorized.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('index.html','utf8');
const api=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+\.supabase\.co)"/)?.[1];
const anon=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
assert.equal(api,'https://waluhdgqhwjjwmflhrle.supabase.co','Unknown production host');
assert.ok(anon && anon.length>50,'Missing PUBLIC anon key');

// These functions are verified SELECT-only and signed-only by an independent,
// read-only production pg_proc+ACL query. Mutating RPCs are deliberately absent.
// Do not accidentally add admin_seed, hq_store_register, punch, etc.
const targets=[
  ['admin_list_admins',{}],
  ['admin_list_auth_users',{}],
  ['admin_list_all_employees',{}],
  ['admin_employee_contract_statuses',{}],
  ['admin_payroll_period',{p_ym:'2026-11'}],
  ['admin_events',{p_from:'2026-11-01T00:00:00',p_to:'2026-11-02T00:00:00'}],
  ['hq_store_catalog',{}],
  ['store_limited_employee_list',{p_store_id:1}],
  ['store_attendance_events',{p_store_id:1,p_from:'2026-11-01T00:00:00',p_to:'2026-11-02T00:00:00'}],
  ['admin_store_payroll_contracts_v4',{p_store_id:1,p_month:'2026-11-01'}]
];
const allow=new Set(targets.map(x=>x[0]));
assert.equal(allow.size,targets.length);
assert.equal(allow.size,10);
assert.ok([...allow].every(x=>/^(admin_|hq_|store_)[a-z0-9_]+$/.test(x)));

const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const fake=b64({alg:'HS256',typ:'JWT'})+'.'+b64({
  role:'authenticated',sub:'00000000-0000-4000-8000-000000000001',
  aud:'authenticated',exp:4102444800
})+'.invalid_signature';

const modes=[
  ['signed_out',{apikey:anon,Authorization:'Bearer '+anon}],
  ['apikey_only',{apikey:anon}],
  ['forged_jwt',{apikey:anon,Authorization:'Bearer '+fake}]
];
let pass=0;
for(const [name,body] of targets){
  const url=api+'/rest/v1/rpc/'+name;
  assert.ok(allow.has(name) && new URL(url).origin===api);
  for(const [mode,headers] of modes){
    const response=await fetch(url,{method:'POST',
      headers:{...headers,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
    // Never read/print response body. Data leak (HTTP 200) fails immediately.
    // A missing PostgREST RPC 404 is NOT accepted as permission proof.
    assert.ok(response.status===401 || response.status===403,
      'SEC_S05_LIVE_RPC_UNEXPECTED_STATUS '+name+'/'+mode+'/HTTP_'+response.status);
    pass++;
  }
}
assert.equal(pass,targets.length*modes.length);
console.log('PASS SEC-S05 real hosted PostgREST protected SELECT-only RPCs: '+
  targets.length+' distinct guarded endpoints x '+modes.length+
  ' unauthenticated/forged modes = '+pass+
  ' explicit HTTP 401/403; no response bodies inspected, no production DML.');
