import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {githubClient} from './github.mjs';
const require=createRequire(import.meta.url);
const {decideRecovery}=require('../release_recovery_policy.cjs');
const response=(status,headers={})=>new Response(JSON.stringify({ok:status===200}),{status,headers});
test('authentication, permission and consent errors block once with minimum action',async()=>{
 for(const [status,headers,reason] of [[401,{},'AUTHENTICATION_FAILED'],[403,{},'PERMISSION_DENIED'],[403,{'x-github-sso':'required; url=https://github.com'},'CONSENT_REQUIRED']]){
  let calls=0,waits=0;
  const api=githubClient('koith/attendance-proto',{fetchImpl:async()=>{calls++;return response(status,headers);},sleep:async()=>waits++});
  await assert.rejects(api('/issues/1331'),e=>e.state==='BLOCKED'&&e.message===reason&&e.required_action.length>10);
  assert.equal(calls,1);assert.equal(waits,0);
 }
});
test('transient reads retry at most three times; retry-after never causes an early retry',async()=>{
 let calls=0,waits=[];
 const api=githubClient('koith/attendance-proto',{fetchImpl:async()=>response(++calls<3?503:200),sleep:async ms=>waits.push(ms)});
 assert.deepEqual(await api('/issues/1331'),{ok:true});assert.equal(calls,3);assert.equal(waits.length,2);
 calls=0;
 const exhausted=githubClient('koith/attendance-proto',{fetchImpl:async()=>{calls++;return response(502);},sleep:async()=>{}});
 await assert.rejects(exhausted('/issues/1331'),/HTTP_502/);assert.equal(calls,3);
 calls=0;
 const limited=githubClient('koith/attendance-proto',{fetchImpl:async()=>{calls++;return response(429,{'retry-after':'120'});},sleep:async()=>assert.fail('must defer, not retry early')});
 await assert.rejects(limited('/issues/1331'),/RATE_LIMIT_DEFERRED/);assert.equal(calls,1);
});
test('unknown POST outcome never retries or silently claims persistence',async()=>{
 let calls=0;
 const api=githubClient('koith/attendance-proto',{fetchImpl:async()=>{calls++;throw Error('connection lost after write');},sleep:async()=>assert.fail()});
 await assert.rejects(api('/issues/1331/comments',{method:'POST',body:{body:'fixture'}}),e=>e.state==='BLOCKED'&&e.message==='WRITE_OUTCOME_UNKNOWN'&&e.required_action.includes('event_id'));
 assert.equal(calls,1);
});
test('an external service failure leaves independent work executable',async()=>{
 let calls=0;
 const api=githubClient('koith/attendance-proto',{fetchImpl:async()=>{calls++;throw Error('external timeout');},sleep:async()=>{}});
 const results=await Promise.allSettled([api('/issues/1331'),Promise.resolve('local QA remains runnable')]);
 assert.equal(results[0].reason.state,'BLOCKED');assert.equal(calls,3);assert.equal(results[1].status,'fulfilled');
});
test('reuse existing release recovery: stale commits and deterministic/permission failures never redeploy',()=>{
 const sha='a'.repeat(40),gate={name:'P0 deployment gate',conclusion:'success'};
 assert.equal(decideRecovery({conclusion:'failure',sha,mainSha:'b'.repeat(40),attempt:1,jobs:[gate]}).action,'terminal');
 assert.equal(decideRecovery({conclusion:'failure',sha,mainSha:sha,attempt:1,jobs:[gate]}).action,'terminal');
 const jobs=[gate,{name:'Build Pages artifact',conclusion:'failure'},{name:'Deploy GitHub Pages',conclusion:'skipped'}];
 assert.equal(decideRecovery({conclusion:'failure',sha,mainSha:sha,attempt:1,jobs}).action,'retry');
 assert.equal(decideRecovery({conclusion:'failure',sha,mainSha:sha,attempt:5,jobs}).action,'terminal');
});
