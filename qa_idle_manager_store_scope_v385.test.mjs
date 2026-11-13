// Real index store-scope initializer evaluated with synthetic browser state.
// No operating network requests; reproduces Safari idle + missing store URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const start=html.indexOf('const STORE_ENTRY_PARAMS=');
const end=html.indexOf('let STORE_ENTRY_UNAVAILABLE=',start);
assert.ok(start>0&&end>start,'store entry code must be found exactly');
const entry=html.slice(start,end);
function storage(){const map=new Map();return {
  getItem:k=>map.has(k)?map.get(k):null,
  setItem:(k,v)=>map.set(k,String(v)),
  removeItem:k=>map.delete(k)
};}
const jwt=sub=>'test.'+Buffer.from(JSON.stringify({sub,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.sig';
function boot(url,local=storage(),session=storage()){
 const location=new URL(url);
 location.replace=next=>{location.redirected=next};
 const app=new Function('location','localStorage','sessionStorage','atob','URL','URLSearchParams',
  entry+';return {id:STORE_ENTRY_ID,lock:STORE_ENTRY_LOCK,invalid:STORE_ENTRY_INVALID,fromPin:STORE_ENTRY_FROM_PIN,rememberVerifiedManagerStore,verifiedManagerStorePin,forgetVerifiedManagerStore,restoreHqFromManagerPin};')
  (location,local,session,atob,URL,URLSearchParams);
 return {app,location,local,session};
}
const base='https://example.invalid/index.html';
test('a server-verified Gumi manager survives Safari idle token expiration and unscoped reload',()=>{
 const local=storage(),session=storage();
 local.setItem('baekeok_auth',JSON.stringify({access_token:jwt('gumi-owner')}));
 const first=boot(base+'?mode=store&store=290#admin',local,session);
 first.app.rememberVerifiedManagerStore({role:'STORE_MANAGER',store_id:290});
 assert.equal(first.app.verifiedManagerStorePin(),290);
 local.removeItem('baekeok_auth'); // Auth invalidated while the tab stayed open
 const restored=boot(base+'#admin',local,session);
 assert.deepEqual({id:restored.app.id,lock:restored.app.lock,fromPin:restored.app.fromPin},
   {id:290,lock:true,fromPin:true});
});
test('persistent pin survives Safari tab eviction, without sessionStorage',()=>{
 const local=storage();local.setItem('baekeok_auth',JSON.stringify({access_token:jwt('gumi-owner')}));
 boot(base+'?mode=store&store=290#admin',local).app.rememberVerifiedManagerStore({role:'STORE_MANAGER',store_id:290});
 local.removeItem('baekeok_auth');
 const freshTab=boot(base+'#admin',local,storage());
 assert.equal(freshTab.app.id,290);
});
test('different authenticated account clears the previous manager store pin',()=>{
 const local=storage();
 local.setItem('baekeok_auth',JSON.stringify({access_token:jwt('gumi-owner')}));
 boot(base,local).app.rememberVerifiedManagerStore({role:'STORE_MANAGER',store_id:290});
 local.setItem('baekeok_auth',JSON.stringify({access_token:jwt('other-owner')}));
 const switched=boot(base+'#admin',local);
 assert.equal(switched.app.id,0);
 assert.equal(switched.app.verifiedManagerStorePin(),0);
 assert.equal(local.getItem('baekeok_verified_manager_store_v1'),null);
});
test('HQ, public store and malformed store URLs never steal manager proof',()=>{
 const local=storage();local.setItem('baekeok_auth',JSON.stringify({access_token:jwt('gumi-owner')}));
 const i=boot(base,local);i.app.rememberVerifiedManagerStore({role:'HQ',store_id:1});
 assert.equal(i.app.id,0);
 i.app.rememberVerifiedManagerStore({role:'STORE_MANAGER',store_id:290});
 const explicit=boot(base+'?mode=store&store=1#pos',local);
 assert.deepEqual({id:explicit.app.id,fromPin:explicit.app.fromPin},{id:1,fromPin:false});
 const invalid=boot(base+'?mode=store#pos',local);
 assert.equal(invalid.app.invalid,true);assert.equal(invalid.app.id,0);
 const hq=boot(base+'?mode=hq#dashboard',local);
 assert.equal(hq.app.id,0);assert.equal(hq.app.fromPin,false);
});
test('stale or corrupted store locator is ignored',()=>{
 const local=storage();local.setItem('baekeok_verified_manager_store_v1',JSON.stringify({store_id:290,subject:'gumi-owner',verified_at:Date.now()-31*86400000}));
 assert.equal(boot(base,local).app.id,0);
 local.setItem('baekeok_verified_manager_store_v1','{"store_id":1,"subject":"spoofed","verified_at":9999999999999999}');
 assert.equal(boot(base,local).app.id,0);
});
test('HQ authenticated after an idle manager recovers the HQ dashboard',()=>{
 const local=storage();local.setItem('baekeok_auth',JSON.stringify({access_token:jwt('gumi-owner')}));
 boot(base,local).app.rememberVerifiedManagerStore({role:'STORE_MANAGER',store_id:290});
 local.removeItem('baekeok_auth');
 const app=boot(base+'#admin',local);
 assert.equal(app.app.id,290);
 app.app.restoreHqFromManagerPin();
 assert.equal(app.location.redirected,'/index.html?mode=hq#dashboard');
 assert.equal(local.getItem('baekeok_verified_manager_store_v1'),null);
});
test('cached store id is only navigation: existing server manager scope remains mandatory',()=>{
 assert.match(html,/if\(context\?\.role==="STORE_MANAGER"\)/);
 assert.match(html,/rememberVerifiedManagerStore\(context\)/);
 assert.match(html,/if\(STORE_ENTRY_ID!==own\|\|STORE_ENTRY_RAW_ID===null\|\|STORE_ENTRY_MODE!=="store"\)/);
 assert.match(html,/rememberVerifiedManagerStore\(ctx\)/);
 assert.match(html,/if\(ctx\?\.role==="HQ"&&STORE_ENTRY_FROM_PIN\)/);
 assert.doesNotMatch(entry,/return .*is_admin/);
});

test('legacy Gumi manager tab without a v0.385 pin restores store 290, never Inha',()=>{
 const session=storage();session.setItem('baekeok_store_id','290');
 const restored=boot(base+'#admin',storage(),session);
 assert.deepEqual({id:restored.app.id,lock:restored.app.lock,fromPin:restored.app.fromPin},
  {id:290,lock:true,fromPin:true});
});
test('explicit store and HQ bookmarks override the legacy store hint',()=>{
 const session=storage();session.setItem('baekeok_store_id','290');
 assert.equal(boot(base+'?mode=store&store=1#admin',storage(),session).app.id,1);
 assert.equal(boot(base+'?mode=hq#dashboard',storage(),session).app.id,0);
 assert.equal(boot(base+'#dashboard',storage(),session).app.id,0);
});
test('invalid and Inha-only legacy selection never gets promoted to manager proof',()=>{
 const session=storage();session.setItem('baekeok_store_id','1');
 assert.equal(boot(base+'#admin',storage(),session).app.id,0);
 session.setItem('baekeok_store_id','290x');
 assert.equal(boot(base+'#admin',storage(),session).app.id,0);
 session.setItem('baekeok_store_id','99999999999999999999');
 assert.equal(boot(base+'#admin',storage(),session).app.id,0);
});
test('missing all locators requires manager login instead of silently loading Inha private view',()=>{
 const restored=boot(base+'#admin');
 assert.equal(restored.app.id,0);
 assert.match(html,/STORE_ENTRY_FAILURE_KIND="AUTH_SCOPE_MISSING"/);
 assert.match(html,/!verifiedAdminContext&&STORE_ENTRY_ID===0/);
 assert.match(html,/STORE_ENTRY_RAW_ID===null\|\|STORE_ENTRY_MODE!=="store"/);
});

test('public generic POS and staff attendance ignore a legacy HQ selection',()=>{
 const session=storage();session.setItem('baekeok_store_id','290');
 assert.equal(boot(base+'#pos',storage(),session).app.id,0);
 assert.equal(boot(base+'#attendance',storage(),session).app.id,0);
 assert.equal(boot(base,storage(),session).app.id,0);
});
