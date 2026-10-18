import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('admin_single_session_watch_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/admin_single_session_watch_v1\.js\?v=20261019v338/);
assert.match(source,/SESSION_SUPERSEDED/);
assert.match(source,/is_admin/);
assert.match(source,/document\.visibilityState==='hidden'/);
assert.doesNotMatch(source,/sessionStorage\.setItem|localStorage\.setItem/);
function scenario(opts={}){
 const state={logged:opts.logged!==false,clear:0,reload:0,alert:0,fetch:0,
  lastUrl:null,signal:null};
 const document={visibilityState:opts.visible===false?'hidden':'visible',addEventListener(){}};
 let timeout=null,interval=null;
 const auth={token:'synthetic-stale-jwt',isLoggedIn:()=>state.logged,
  clear(){state.logged=false;state.clear++;}};
 const context={Auth:auth,document,
  CONFIG:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'synthetic-public-key'},
  fetch:async(url,request)=>{
   state.fetch++;state.lastUrl=url;
   if(opts.networkFailure)throw Error('OFFLINE');
   return {ok:opts.ok===true,text:async()=>opts.body||'{"code":"P0001","message":"POS_AUTH_REQUIRED"}'};
  },
  alert(){state.alert++},
  location:{reload(){state.reload++}},
  sessionStorage:{removeItem(){}},
  window:{addEventListener(){}},
  setInterval(fn){interval=fn;return 1},
  setTimeout(fn){timeout=fn;return 1},
  console
 };
 vm.runInNewContext(source,context,{timeout:500});
 return {state,document,fire:async()=>{
  timeout();
  await new Promise(resolve=>setImmediate(resolve));
 },poll:async()=>{interval();await new Promise(resolve=>setImmediate(resolve))}};
}
const superseded=scenario({body:'{"code":"P0001","message":"SESSION_SUPERSEDED"}'});
await superseded.fire();
assert.equal(superseded.state.clear,1,'server-denied old admin must be logged out');
assert.equal(superseded.state.reload,1);
assert.equal(superseded.state.alert,1);
assert.ok(superseded.state.lastUrl.endsWith('/rest/v1/rpc/is_admin'));
await superseded.poll();
assert.equal(superseded.state.clear,1,'superseded prompt shown only once');
const valid=scenario({ok:true});
await valid.fire();
assert.equal(valid.state.clear,0,'valid manager must never be logged out');
const pos=scenario({body:'{"code":"P0001","message":"POS_AUTH_REQUIRED"}'});
await pos.fire();
assert.equal(pos.state.clear,0,'unrelated auth/POS failure must not revoke session');
const unauthorized=scenario({body:'{"code":"42501","message":"NOT_AUTHORIZED"}'});
await unauthorized.fire();
assert.equal(unauthorized.state.clear,0,'permission denial is not old-session revocation');
const offline=scenario({networkFailure:true});
await offline.fire();
assert.equal(offline.state.clear,0,'network failure must not invalidate admin');
const guest=scenario({logged:false,body:'SESSION_SUPERSEDED'});
await guest.fire();
assert.equal(guest.state.fetch,0,'anonymous POS must not contact admin RPC');
const hidden=scenario({visible:false});
await hidden.fire();
assert.equal(hidden.state.fetch,0,'background tabs must not poll');
console.log('PASS SEC-01 UX: server superseded only, no false logout on POS, offline, hidden or unauthenticated');
