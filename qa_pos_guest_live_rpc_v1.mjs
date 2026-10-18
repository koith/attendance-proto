// BUG-01 / #1028: inspect real production PostgREST as a shared POS with NO
// manager session or kiosk token. Never print employee identity or credentials.
// Read-only RPC calls only; no live attendance writes, no real PIN attempts.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('index.html','utf8');
const host=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+\.supabase\.co)"/)?.[1];
const anon=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
assert.ok(host&&anon,'configured public API host/anon key must be available');
assert.match(source,/async function openMyRecord\(\)[\s\S]{0,750}LIVE\?await BE\.posPublicStaffCards\(\):await BE\.listEmployeesState\(\)/,
 'Guest attendance picker must not depend on token-only private roster');
const request=async(name,args)=>{
 const response=await fetch(host+'/rest/v1/rpc/'+name,{
  method:'POST',headers:{
   apikey:anon,Authorization:'Bearer '+anon,
   'Content-Type':'application/json',Accept:'application/json'
  },body:JSON.stringify(args),signal:AbortSignal.timeout(20000),cache:'no-store'
 });
 return {status:response.status,ok:response.ok,data:await response.json()};
};
const guest=await request('pos_public_staff_cards',{p_store_id:1});
assert.ok(guest.ok,'anonymous READY-store staff selector must not return POS_AUTH_REQUIRED; HTTP '+guest.status);
assert.ok(Array.isArray(guest.data),'guest staff RPC must return an array');
const deny=/pin|password|wage|salary|payroll|ssn|birth|account|email|phone|tax|contract|secret/i;
for(const item of guest.data){
 assert.ok(item&&typeof item==='object'&&!Array.isArray(item),'invalid public picker row');
 assert.equal(Object.keys(item).some(k=>deny.test(k)),false,'sensitive staff field exposed in public roster');
}
const privateCall=await request('pos_employees_state',{p_store_id:1,p_token:null});
assert.ok(!privateCall.ok,'token-only roster must refuse a guest request');
assert.match(JSON.stringify(privateCall.data),/POS_AUTH_REQUIRED|NOT_AUTHORIZED|AUTH_REQUIRED/,
 'private roster failure must be an authorization denial');
console.log('PASS production POS guest path: anonymous selector HTTP '+guest.status+
 ', '+guest.data.length+' READY-store cards; private roster denied without token; no wage/PIN fields');
