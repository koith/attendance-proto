import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=process.env.QA1243_BASELINE_DIR||'.';
const attendance=readFileSync(root+'/actual_attendance.js','utf8');
const html=readFileSync(root+'/index.html','utf8');
const helper=attendance.slice(attendance.indexOf('function positiveAttendanceStore('),attendance.indexOf('function isIssue('));
function fixture({search='',saved='1',context={role:'STORE_MANAGER',store_id:80}}={}){
 const storage=new Map([['baekeok_store_id',saved]]),calls=[],nodes=new Map();
 const sandbox={URLSearchParams,console:{warn(){},error(){}},S:{staffMode:false,employees:[]},
  location:{search,pathname:'/index.html',hash:'#pos',href:'',replace(url){this.href=url}},
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  // Valid manager fixture: v0.371 checks session freshness before loading admin_context.
  Auth:{token:'synthetic-token',load(){},isLoggedIn:()=>true,ensureStartupAuth:async()=>true},
  rpc:async(name,args)=>{calls.push({name,args});if(context instanceof Error)throw context;return context},
  document:{querySelector:()=>({textContent:''})},
  el:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)},
  kstToday:()=>new Date(2026,9,27),p2:n=>String(n).padStart(2,'0'),loadMonth(){}};
 const ctx=vm.createContext(sandbox);if(helper)vm.runInContext(helper,ctx);
 return {ctx,storage,calls,nodes};
}
test('closing attendance preserves store80 even when the old cached selection was store1',()=>{
 const {ctx,nodes}=fixture({search:'?store=80',saved:'1'});
 const start=attendance.indexOf('function init(){'),end=attendance.indexOf('\ninit();',start);
 vm.runInContext(attendance.slice(start,end)+'\ninit();',ctx);nodes.get('back').onclick();
 assert.equal(ctx.location.href,'index.html?mode=store&store=80#pos');
});
test('attendance scope comes from real admin_context, not another tab cache',async()=>{
 const f=fixture();assert.equal(await vm.runInContext('resolveAttendanceStore()',f.ctx),80);
 assert.equal(f.storage.get('baekeok_store_id'),'80');assert.equal(f.calls[0].name,'admin_context');
});
test('explicit foreign, malformed, revoked and unavailable account scopes fail before staff reads',async()=>{
 for(const config of [{search:'?store=1'},{search:'?store=0'},{search:'?store=oops'},
  {context:{role:null,store_id:null}},{context:new Error('AUTH_DOWN')}]){
  const f=fixture(config);await assert.rejects(vm.runInContext('resolveAttendanceStore()',f.ctx));
  assert.ok(f.calls.every(c=>c.name==='admin_context'));
 }
});
test('HQ keeps its selected store; unknown scope never defaults to Inha',async()=>{
 const good=fixture({context:{role:'HQ'},search:'?store=80'});
 assert.equal(await vm.runInContext('resolveAttendanceStore()',good.ctx),80);
 const bad=fixture({context:{role:'HQ'},saved:''});
 await assert.rejects(vm.runInContext('resolveAttendanceStore()',bad.ctx),/SCOPE_REQUIRED/);
 assert.equal(vm.runInContext('attendanceReturnUrl()',bad.ctx),'index.html#admin');
});
const start=html.indexOf('async function loadStores(){'),end=html.indexOf(' const sel=document.getElementById("storeSelect");',start);
const startup=html.slice(start,end)+'\nreturn true;}';
async function accountBoundary({entry=0,context={role:'STORE_MANAGER',store_id:80}}={}){
 const {ctx}=fixture();Object.assign(ctx,{LIVE:true,STORE_ENTRY_ID:entry,STORE_ENTRY_LOCK:entry>0,
  STORE_ENTRY_UNAVAILABLE:false,STORE_ENTRY_CONNECTION_FAILED:false,BE:{adminContext:async()=>{
   if(context instanceof Error)throw context;return context;}}});
 vm.runInContext(startup,ctx);const result=await vm.runInContext('loadStores()',ctx);return {ctx,result};
}
test('a signed-in manager entering a generic or foreign URL redirects before any public store lookup',async()=>{
 for(const entry of [0,1]){
  const {ctx,result}=await accountBoundary({entry});
  assert.equal(ctx.location.href,'/index.html?mode=store&store=80#pos');
  assert.equal(result,undefined);assert.equal(ctx.STORE_ENTRY_UNAVAILABLE,true);
 }
 const valid=await accountBoundary({entry:80});assert.equal(valid.result,true);assert.equal(valid.ctx.location.href,'');
 const hq=await accountBoundary({context:{role:'HQ'}});assert.equal(hq.result,true);
});
test('account lookup errors and revoked accounts cannot fall back to public Inha POS',async()=>{
 for(const context of [{role:null},new Error('AUTH_TIMEOUT')]){
  const {ctx,result}=await accountBoundary({context});assert.equal(result,undefined);
  assert.equal(ctx.STORE_ENTRY_UNAVAILABLE,true);assert.equal(ctx.STORE_ENTRY_CONNECTION_FAILED,true);
 }
});
test('attendance identity enhancement uses the same scoped employee RPC and staff PIN stays independent',()=>{
 assert.doesNotMatch(attendance,/rpc\('admin_list_employees'\)/);
 assert.match(attendance,/const storeId=await resolveAttendanceStore\(\);const employees=await rpc\('list_store_employees'/);
 assert.match(attendance,/const all=\(\)=>S\.staffMode\?Promise\.resolve\(S\.employees\)/);
 assert.match(html,/if\(Auth\.isLoggedIn\(\)\)STORE_ENTRY_UNAVAILABLE=true/);
 assert.match(html,/location\.href=attendanceEntryUrl\(true\)/);
});
