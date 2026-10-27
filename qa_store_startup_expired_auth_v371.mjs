// v0.371 – browser-real source, isolated synthetic session/store inputs only.
// No live Auth identities, DB writes, credential material, or production URLs called.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const authStart=html.indexOf('const Auth = {');
const authEnd=html.indexOf('\nconst SupaBE =',authStart);
const startupStart=html.indexOf('async function loadStores(){');
const startupEnd=html.indexOf('// Any database/user-controlled text inserted through innerHTML',startupStart);
assert.ok(authStart>0&&authEnd>authStart&&startupStart>authEnd&&startupEnd>startupStart,
  'test must inspect real production Auth and store-startup functions');
const authSource=html.slice(authStart,authEnd);
const startupSource=html.slice(startupStart,startupEnd);
assert.match(html,/const APP_VERSION="v0\.371"/);
assert.match(html,/failure\.httpStatus=r\.status/,'PostgREST status must survive to auth recovery boundary');

function fixture({refreshStatus=200,initialRefresh='synthetic-refresh',adminStatus=401,
  afterRefreshRole='HQ',requestedStore=1,publicActive=true,refreshThrows=false}={}){
 const stored=new Map([['baekeok_auth',JSON.stringify({
  access_token:'old-expired-synthetic',refresh_token:initialRefresh
 })]]);
 const localStorage={
  getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)
 };
 const requests=[],ctxCalls=[],storeCalls=[];
 const fetch=async(url,opt={})=>{
  requests.push({url,method:opt.method,body:opt.body});
  if(!url.endsWith('/auth/v1/token?grant_type=refresh_token'))throw Error('UNEXPECTED_REQUEST');
  if(refreshThrows)throw Error('SYNTHETIC_NETWORK_UNAVAILABLE');
  if(refreshStatus!==200)return {status:refreshStatus,ok:false,json:async()=>({})};
  return {status:200,ok:true,json:async()=>({
   access_token:'fresh-synthetic',refresh_token:'rotated-synthetic',
   user:{id:'synthetic-user'}
  })};
 };
 const context={
  CONFIG:{SUPABASE_URL:'https://auth.example.test',SUPABASE_ANON_KEY:'public-synthetic'},
  fetch,localStorage,document:{getElementById:()=>null},
  sessionStorage:{setItem(){},removeItem(){}},
  console:{warn(){}},
  location:{hash:'#pos',pathname:'/attendance-proto/index.html',search:'?mode=store&store='+requestedStore,
   replaced:null,replace(path){this.replaced=path;}},
  STORE_ENTRY_UNAVAILABLE:true,STORE_ENTRY_CONNECTION_FAILED:false,
  STORE_ENTRY_LOCK:true,STORE_ENTRY_INVALID:false,STORE_ENTRY_ID:requestedStore,
  STORE_NAME_BY_ID:new Map(),CURRENT_STORE_ID:requestedStore,
  LIVE:true,JSON,Map,Number,
  syncStoreContextUI(){},
  publicRpc:async(name,args,timeout)=>{
   storeCalls.push({name,args,timeout});
   assert.equal(name,'list_stores');
   return [{id:1,name:'인하대학교점',is_active:publicActive}];
  }
 };
 context.Auth=vm.runInNewContext(authSource+'\nAuth',context,{filename:'index.html/Auth'});
 context.Auth.load();
 context.BE={adminContext:async()=>{
  ctxCalls.push(context.Auth.token);
  if(adminStatus===403)throw Object.assign(Error('SESSION_SUPERSEDED'),{httpStatus:403});
  if(context.Auth.token==='old-expired-synthetic')throw Object.assign(Error('JWT expired'),{httpStatus:401});
  return {role:afterRefreshRole,store_id:80};
 }};
 const loadStores=vm.runInNewContext(startupSource+'\nloadStores',context,{filename:'index.html/loadStores'});
 return {context,stored,requests,ctxCalls,storeCalls,run:()=>loadStores()};
}

{
 const t=fixture();
 await t.run();
 assert.deepEqual(t.ctxCalls,['old-expired-synthetic','fresh-synthetic']);
 assert.equal(t.requests.length,1);
 assert.equal(JSON.parse(t.requests[0].body).refresh_token,'synthetic-refresh');
 assert.equal(t.context.Auth.token,'fresh-synthetic');
 assert.equal(JSON.parse(t.stored.get('baekeok_auth')).refresh_token,'rotated-synthetic');
 assert.equal(t.context.STORE_ENTRY_UNAVAILABLE,false);
 assert.equal(t.context.STORE_ENTRY_CONNECTION_FAILED,false);
 assert.equal(t.storeCalls.length,1);
 console.log('PASS expired token refreshed, server admin role reverified, public READY store opened');
}
{
 const t=fixture({refreshStatus:400});
 await t.run();
 assert.deepEqual(t.ctxCalls,['old-expired-synthetic']);
 assert.equal(t.context.Auth.isLoggedIn(),false,'invalid session must not be treated as a logged-in manager');
 assert.equal(t.stored.has('baekeok_auth'),false);
 assert.equal(t.context.STORE_ENTRY_UNAVAILABLE,false,'valid public store still usable');
 assert.equal(t.storeCalls.length,1);
 console.log('PASS rejected refresh -> clear stale admin, fall back only to public READY store');
}
{
 const t=fixture({initialRefresh:''});
 await t.run();
 assert.equal(t.requests.length,0,'no token -> no provider call');
 assert.equal(t.context.Auth.isLoggedIn(),false);
 assert.equal(t.context.STORE_ENTRY_UNAVAILABLE,false);
 console.log('PASS missing refresh credentials do not trap guest POS');
}
{
 const t=fixture({refreshThrows:true});
 await t.run();
 assert.equal(t.context.Auth.token,'old-expired-synthetic');
 assert.ok(t.stored.has('baekeok_auth'),'network error must preserve session');
 assert.equal(t.context.STORE_ENTRY_UNAVAILABLE,true);
 assert.equal(t.context.STORE_ENTRY_CONNECTION_FAILED,true);
 assert.equal(t.storeCalls.length,0,'network failure cannot bypass authenticated scope');
 console.log('PASS network error retains stored credentials and fails closed');
}
{
 const t=fixture({adminStatus:403});
 await t.run();
 assert.equal(t.requests.length,0,'role/session revocation cannot refresh as an auth-expiry workaround');
 assert.equal(t.storeCalls.length,0,'revoked manager cannot browse through privileged fallback');
 assert.equal(t.context.STORE_ENTRY_UNAVAILABLE,true);
 console.log('PASS revoked manager scope remains blocked');
}
{
 const t=fixture({afterRefreshRole:'STORE_MANAGER'});
 await t.run();
 assert.equal(t.context.location.replaced,
  '/attendance-proto/index.html?mode=store&store=80#pos');
 assert.equal(t.storeCalls.length,0,'cross-store manager must never load wrong store');
 console.log('PASS refreshed store manager restricted to assigned store');
}
{
 const t=fixture({refreshStatus:400,publicActive:false});
 await t.run();
 assert.equal(t.context.STORE_ENTRY_UNAVAILABLE,true,'STAGED/inactive store never opens');
 assert.equal(t.context.STORE_ENTRY_CONNECTION_FAILED,false,'inactive is not network failure');
 console.log('PASS inactive store remains isolated');
}
console.log('v0.371 expired-login browser startup regressions: 7 PASS');
