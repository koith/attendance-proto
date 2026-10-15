// STORE-01 production read-only anonymous boundary acceptance.
// Public publishable/legacy anon key is extracted from the shipped webapp;
// never uses service-role credentials or calls writable RPCs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const url=html.match(/SUPABASE_URL:\s*"([^"]+)"/)?.[1];
const key=html.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
assert.ok(url?.startsWith('https://waluhdgqhwjjwmflhrle.supabase.co'),
 'Do not point this public read-only acceptance at an unknown backend');
assert.ok(key?.length>50,'The current public anon key must be present');
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function rpc(name,args={}){
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url+'/rest/v1/rpc/'+name,{
        method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(18000)
      });
      const value=await response.json();
      if(!response.ok)throw Error('READ_ONLY_RPC_'+name+'_HTTP_'+response.status);
      return value;
    }catch(error){
      last=error;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));
    }
  }
  throw last;
}
const stores=await rpc('list_stores');
assert.ok(Array.isArray(stores)&&stores.length>0,
 'At least the existing live Inha branch must remain available');
const seen=new Set();
for(const store of stores){
  assert.ok(store&&Number.isSafeInteger(Number(store.id))&&Number(store.id)>0,
    'Anonymous store list has invalid store identity');
  assert.equal(store.is_active,true,'Inactive/staged branch leaked into public store picker');
  assert.ok(!seen.has(Number(store.id)),'Store picker contains duplicate branch');
  seen.add(Number(store.id));
}
assert.ok(seen.has(1),'Existing live Inha branch disappeared');
// #832: the legacy employee-state RPC must never be publicly executable,
// for a READY store or a STAGED store. Never fall back to revealing names.
for(const storeId of [1,2]){
  const legacy=await fetch(url+'/rest/v1/rpc/list_employees_state',{
    method:'POST',headers,body:JSON.stringify({p_store_id:storeId}),signal:AbortSignal.timeout(18000)
  });
  assert.ok([401,403,404].includes(legacy.status),
    'Legacy roster must deny anonymous access to store '+storeId+': '+legacy.status);
  const locked=await fetch(url+'/rest/v1/rpc/pos_employees_state',{
    method:'POST',headers,body:JSON.stringify({p_store_id:storeId,p_token:'not-a-valid-token'}),
    signal:AbortSignal.timeout(18000)
  });
  assert.ok(!locked.ok,
    'POS roster must require a valid store-scoped kiosk token for store '+storeId);
  const body=await locked.text();
  assert.doesNotMatch(body,/working_since|today_first_in|today_last_out|employee_no/,
    'Unauthenticated response must not contain staff attendance data');
}
const adminResponse=await fetch(url+'/rest/v1/rpc/hq_stores_onboarding_list',{
 method:'POST',headers,body:'{}',signal:AbortSignal.timeout(18000)});
assert.ok(adminResponse.status===401||adminResponse.status===403,
 'Anonymous HQ onboarding list must deny, got '+adminResponse.status);
console.log('PASS live anonymous boundaries: READY picker, raw roster denied, kiosk token required and HQ denied');
