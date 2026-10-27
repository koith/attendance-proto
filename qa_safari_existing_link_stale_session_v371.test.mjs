// Regression for Safari's persistent (expired/revoked) localStorage Auth session.
// All network results are synthetic. No user data, secret, Auth, or store is mutated.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const authStart=html.indexOf('const Auth = {');
const authEnd=html.indexOf('\nconst SupaBE = ',authStart);
const bootStart=html.indexOf('async function loadStores(){');
const bootEnd=html.indexOf('// Any database/user-controlled',bootStart);
assert.ok(authStart>0&&authEnd>authStart&&bootStart>authEnd&&bootEnd>bootStart);
const authSource=html.slice(authStart,authEnd);
const bootSource=html.slice(bootStart,bootEnd);
const AUTH_URL='https://supabase.qa.invalid';

function memoryStore(initial={}){
 const data=new Map(Object.entries(initial));
 return {
  getItem:k=>data.has(k)?data.get(k):null,
  setItem:(k,v)=>data.set(k,String(v)),
  removeItem:k=>data.delete(k),
  has:k=>data.has(k)
 };
}
function jwt(exp,subject='test-owner'){
 return 'test.'+Buffer.from(JSON.stringify({exp,sub:subject})).toString('base64url')+'.signature';
}
const nowSeconds=()=>Math.floor(Date.now()/1000);
function browser({expiry=nowSeconds()-120,refreshResult='invalid',hasRefresh=true,sessionRole='HQ',storeId=1,locked=true}={}){
 const oldSession={
  access_token:jwt(expiry),
  ...(hasRefresh?{refresh_token:'synthetic-old-refresh'}:{}),
  expires_in:3600
 };
 const localStorage=memoryStore({baekeok_auth:JSON.stringify(oldSession)});
 const sessionStorage=memoryStore();
 const calls=[];
 let refreshCall=0,adminCall=0;
 const fetch=async(url)=>{
  assert.match(url,/\/auth\/v1\/token\?grant_type=refresh_token$/);
  refreshCall++;
  if(refreshResult==='network')throw new TypeError('synthetic iOS connection dropped');
  if(refreshResult==='valid')return {ok:true,status:200,json:async()=>({
   access_token:jwt(nowSeconds()+3600),refresh_token:'synthetic-rotated-refresh',expires_in:3600
  })};
  return {ok:false,status:400,json:async()=>({code:'invalid_grant'})};
 };
 const Auth=new Function('localStorage','CONFIG','fetch','AbortController','setTimeout','clearTimeout','atob',
  authSource+';return Auth;')(localStorage,{SUPABASE_URL:AUTH_URL,SUPABASE_ANON_KEY:'public-fixture'},fetch,
  AbortController,setTimeout,clearTimeout,atob);
 Auth.load();
 const location={hash:'#pos',pathname:'/attendance-proto/index.html',search:locked?'?mode=store&store=1':'',
  redirected:null,replace(next){this.redirected=next;}};
 const document={getElementById:id=>{
  if(id!=='storeSelect'||locked)return null;
  return {options:[{value:'1'}],value:'1',selectedOptions:[{text:'인하대학교점'}],onchange:null,innerHTML:''};
 }};
 const storeList=[{id:1,is_active:true,name:'인하대학교점'}];
 let listCount=0;
 const publicRpc=async(fn)=>{
  assert.equal(fn,'list_stores');
  listCount++;
  return storeList;
 };
 const BE={async adminContext(){
  adminCall++;
  if(sessionRole==='unauthorized')throw Object.assign(new Error('401'),{httpStatus:401});
  if(sessionRole==='network')throw new TypeError('synthetic failed browser request');
  if(sessionRole==='wrong-role')return {role:'STAFF'};
  if(sessionRole==='STORE_MANAGER')return {role:'STORE_MANAGER',store_id:storeId};
  return {role:'HQ'};
 }};
 const fn=new Function(
  'LIVE','Auth','BE','STORE_ENTRY_LOCK','STORE_ENTRY_ID','STORE_ENTRY_INVALID',
  'location','document','sessionStorage','publicRpc','syncStoreContextUI',
  'let STORE_ENTRY_UNAVAILABLE=STORE_ENTRY_LOCK;\nlet STORE_ENTRY_CONNECTION_FAILED=false;\nlet CURRENT_STORE_ID=STORE_ENTRY_ID||1;\nlet STORE_NAME_BY_ID=new Map();\n'+bootSource+
  '\nreturn {loadStores,getState:()=>({unavailable:STORE_ENTRY_UNAVAILABLE,failed:STORE_ENTRY_CONNECTION_FAILED,current:CURRENT_STORE_ID})};'
 );
 const ui={updates:0};
 const runner=fn(true,Auth,BE,locked,locked?1:0,false,location,document,sessionStorage,publicRpc,()=>{ui.updates++});
 return {Auth,localStorage,sessionStorage,location,runner,ui,stats:()=>({refreshCall,adminCall,listCount})};
}

test('expired Safari session is refreshed before manager RPC; POS is not falsely locked',async()=>{
 const b=browser({refreshResult:'valid'});
 await b.runner.loadStores();
 assert.deepEqual(b.runner.getState(),{unavailable:false,failed:false,current:1});
 assert.equal(b.stats().refreshCall,1);
 assert.equal(b.stats().adminCall,1);
 assert.equal(b.stats().listCount,1);
 assert.ok(b.localStorage.getItem('baekeok_auth').includes('synthetic-rotated-refresh'));
});

test('server-rejected expired session exits privileged mode and recovers public store',async()=>{
 const b=browser({refreshResult:'invalid'});
 await b.runner.loadStores();
 assert.deepEqual(b.runner.getState(),{unavailable:false,failed:false,current:1});
 assert.equal(b.Auth.isLoggedIn(),false);
 assert.equal(b.localStorage.has('baekeok_auth'),false);
 assert.equal(b.stats().adminCall,0);
 assert.equal(b.stats().listCount,1);
});

test('missing refresh credential cannot masquerade as Supabase store downtime',async()=>{
 const b=browser({hasRefresh:false});
 await b.runner.loadStores();
 assert.equal(b.runner.getState().failed,false);
 assert.equal(b.runner.getState().unavailable,false);
 assert.equal(b.stats().refreshCall,0);
 assert.equal(b.Auth.isLoggedIn(),false);
});

test('server 401 during admin scope triggers one refresh attempt; no cross-store fallback',async()=>{
 const b=browser({expiry:nowSeconds()+300,refreshResult:'invalid',sessionRole:'unauthorized'});
 await b.runner.loadStores();
 assert.equal(b.stats().adminCall,1);
 assert.equal(b.stats().refreshCall,1);
 assert.equal(b.Auth.isLoggedIn(),false);
 assert.equal(b.runner.getState().unavailable,false);
 assert.equal(b.stats().listCount,1);
});

test('non-auth network failure never logs out manager or exposes store data',async()=>{
 const b=browser({expiry:nowSeconds()+300,sessionRole:'network'});
 await b.runner.loadStores();
 assert.equal(b.runner.getState().unavailable,true);
 assert.equal(b.runner.getState().failed,true);
 assert.equal(b.Auth.isLoggedIn(),true);
 assert.equal(b.stats().listCount,0);
});

test('a valid manager account cannot use a different store bookmark',async()=>{
 const b=browser({expiry:nowSeconds()+300,sessionRole:'STORE_MANAGER',storeId:80});
 await b.runner.loadStores();
 assert.equal(b.stats().listCount,0);
 assert.equal(b.location.redirected,'/attendance-proto/index.html?mode=store&store=80#pos');
 assert.equal(b.Auth.isLoggedIn(),true);
});

test('generic HQ legacy link recovers expired session without store-lock message',async()=>{
 const b=browser({refreshResult:'invalid',locked:false});
 await b.runner.loadStores();
 assert.equal(b.runner.getState().failed,false);
 assert.equal(b.runner.getState().unavailable,false);
 assert.equal(b.stats().listCount,1);
});

test('a failed refresh network request preserves credentials and fails closed',async()=>{
 const b=browser({refreshResult:'network'});
 await b.runner.loadStores();
 assert.equal(b.Auth.isLoggedIn(),true);
 assert.equal(b.runner.getState().unavailable,true);
 assert.equal(b.runner.getState().failed,true);
 assert.equal(b.stats().listCount,0);
});

test('startup still requires ACTIVE store; no synthetic READY bypass',()=>{
 assert.match(bootSource,/const active=rows\.find\(x=>Number\(x\.id\)===CURRENT_STORE_ID&&x\.is_active!==false\)/);
 assert.match(bootSource,/if\(!active\)\{STORE_ENTRY_UNAVAILABLE=true;return;\}/);
 assert.doesNotMatch(authSource,/service_role|owner_assigned|admin_users/);
});

console.log('Safari existing-link session bootstrap tests PASS');
