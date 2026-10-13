import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Field white-screen regression: the browser must not wait indefinitely for
// the public list_stores RPC before showing an actionable, scoped POS screen.
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('const publicRpc=async(');
const end=html.indexOf('\nconst BE = ',start);
assert.ok(start>=0&&end>start,'Public list_stores RPC must be present');
const snippet=html.slice(start,end);
const ctx=vm.createContext({
  CONFIG:{SUPABASE_ANON_KEY:'fixture-anon-only',SUPABASE_URL:'https://qa.invalid'},
  AbortController,setTimeout,clearTimeout,
  fetch:null
});
vm.runInContext(snippet+'\nthis.publicRpcForTest=publicRpc;',ctx);
let aborted=false,submitted=false;
ctx.fetch=async(_url,options)=>new Promise((_resolve,reject)=>{
  submitted=true;
  options.signal.addEventListener('abort',()=>{
    aborted=true;reject(new Error('simulated LTE request aborted'));
  },{once:true});
});
await assert.rejects(ctx.publicRpcForTest('list_stores',{},40),/STORE_CONNECT_TIMEOUT/);
assert.equal(submitted,true,'Timed request never started');
assert.equal(aborted,true,'Unresponsive network request was not aborted');

ctx.fetch=async()=>({ok:true,text:async()=>'[{"id":1,"is_active":true}]'});
const got=await ctx.publicRpcForTest('list_stores',{},40);
assert.equal(got[0].id,1,'Fast recovered request must still parse normal stores');
ctx.fetch=async()=>({ok:false,text:async()=> 'STORE_DENIED'});
await assert.rejects(ctx.publicRpcForTest('list_stores',{},40),/STORE_DENIED/,
  'Server denies must never be converted into authorized POS data');

assert.match(html,/publicRpc\("list_stores",\{\},6500\)/,
 'The dedicated store initialization must use the bounded network call');
assert.match(html,/if\(STORE_ENTRY_LOADING\)\{showStoreStartup\(\);return;\}/,
 'Loading route cannot bypass the POS authorization gate');
assert.match(html,/if\(LIVE\)showStoreStartup\(\);\s*loadStores\(\)\.finally/,
 'The pending banner must render before async startup begins');
assert.match(html,/STORE_ENTRY_CONNECTION_FAILED=true/,
 'A temporary network failure must differ from an unapproved store');
assert.match(html,/retryStoreConnect/,
 'Users need a visible reconnection button');
assert.match(html,/if\(!grid\.isConnected \|\| \(location\.hash && location\.hash!=="#pos"\)\)return;/,
 'Direct links lacking #pos must populate the employee grid');
console.log('PASS POS startup: bounded LTE store RPC, status, fail-closed retry, recovery, no-hash route');
