// SEC-S3/S4 partial live acceptance: unsigned/forged JWT against protected tables.
// SAFE: exact production host, GET only, no writes, no employee/personal data in output.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('index.html','utf8');
const api=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+\.supabase\.co)"/)?.[1];
const key=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
assert.equal(api,'https://waluhdgqhwjjwmflhrle.supabase.co','Reject unknown backend');
assert.ok(key && key.length>50,'Public anon key not found in published app source');

// Deliberately static, reviewed private tables. Only GET is performed.
const tables=[
 'admin_users','attendance_events','correction_requests',
 'employees','employment_contracts','event_corrections',
 'payroll_period_employee'
];
const baseHeaders={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
const accepted=new Set([401,403,404]);
let emptyRls=0,denied=0,notExposed=0;
for(const table of tables){
  const url=api+'/rest/v1/'+table+'?select=*&limit=1';
  const response=await fetch(url,{
    method:'GET',headers:baseHeaders,signal:AbortSignal.timeout(20000),cache:'no-store'
  });
  if(response.status===200){
    const json=await response.json();
    assert.ok(Array.isArray(json) && json.length===0,
      'SEC_LIVE_ANON_SENSITIVE_ROW_EXPOSED_OR_INVALID_RESPONSE: '+table);
    emptyRls++;
  }else{
    assert.ok(accepted.has(response.status),
      'SEC_LIVE_ANON_SENSITIVE_UNEXPECTED_HTTP: '+table+'/'+response.status);
    if(response.status===404)notExposed++;else denied++;
  }
}
// A crafted "authenticated" claim without the server signature must not pass.
// It is sent on a safe GET to only one guarded table, never used for writes.
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const forged=b64({alg:'HS256',typ:'JWT'})+'.'+b64({
  role:'authenticated',sub:'00000000-0000-4000-8000-000000000001',
  aud:'authenticated',exp:4102444800
})+'.invalid_signature';
const fake=await fetch(api+'/rest/v1/admin_users?select=*&limit=1',{
  method:'GET',
  headers:{...baseHeaders,Authorization:'Bearer '+forged},
  signal:AbortSignal.timeout(20000),cache:'no-store'
});
assert.ok([401,403].includes(fake.status),
  'SEC_LIVE_FORGED_JWT_WAS_NOT_REJECTED: HTTP '+fake.status);
// Print only counts and status. Never reveal real data, names, tokens or response bodies.
console.log('PASS live production signed-out private data boundaries: tables='+tables.length+
  ' RLS_empty='+emptyRls+' denied='+denied+' not_exposed='+notExposed+
  ' forged_JWT_denied_HTTP='+fake.status+'; GET-only no operational writes.');
