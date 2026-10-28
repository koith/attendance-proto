import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('app_release_probe_v1.js','utf8');
async function check({current='v0.371',release={version:'v0.372',commit:'a'.repeat(40),index_sha256:'b'.repeat(64)},fail=false,blocked=false,url='https://koith.github.io/attendance-proto/index.html?v=24&store=80#admin',attempt=false}={}){
 const saved=new Map([['baekeok_auth','unchanged-account'],['baekeok_store_id','80']]);
 if(attempt)saved.set('baekeok_release_attempt_'+'a'.repeat(16),'1');
 const calls=[],redirects=[];
 const context={window:{},URL,AbortController,setTimeout,clearTimeout,Date,
  location:{href:url,replace:u=>redirects.push(u)},
  sessionStorage:{getItem:k=>{if(blocked)throw Error('blocked');return saved.get(k)||null},setItem:(k,v)=>saved.set(k,v)},
  fetch:async(u,options)=>{calls.push({u,options});if(fail)throw Error('offline');return {ok:true,json:async()=>release}}};
 vm.runInNewContext(source,context);const upgrading=await context.window.BaekeokReleaseProbe(current);
 assert.equal(saved.get('baekeok_auth'),'unchanged-account');assert.equal(saved.get('baekeok_store_id'),'80');
 assert.equal(calls.length,1);assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.redirect,'error');
 assert.equal(new URL(calls[0].u).pathname,'/attendance-proto/app-release.json');
 return {upgrading,redirects};
}
test('new release repairs the same bookmarked path while preserving store, old query and route',async()=>{
 const r=await check();assert.equal(r.upgrading,true);const u=new URL(r.redirects[0]);
 assert.equal(u.pathname,'/attendance-proto/index.html');assert.equal(u.searchParams.get('store'),'80');
 assert.equal(u.searchParams.get('v'),'24');assert.equal(u.hash,'#admin');assert.equal(u.searchParams.get('__app_release'),'a'.repeat(16));
});
test('current/older release and malformed public metadata never reload',async()=>{
 for(const release of [{version:'v0.371'},{version:'v0.370'},{version:'bad'},
  {version:'v0.372',commit:'invalid',index_sha256:'b'.repeat(64)}])assert.equal((await check({release})).upgrading,false);
});
test('partial rollout, inaccessible storage and offline metadata cannot cause a reload loop or logout',async()=>{
 for(const options of [{attempt:true},{blocked:true},{fail:true},{url:'https://koith.github.io/attendance-proto/?__app_release='+'a'.repeat(16)+'#dashboard'}]){
  const r=await check(options);assert.equal(r.upgrading,false);assert.deepEqual(r.redirects,[]);
 }
});
