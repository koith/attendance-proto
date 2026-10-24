import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';
import {postGas,verifyConnectivity,handleConnectivity,assertConnectivityIdentity,QA_GAS_URL,QA_AUDIENCE} from '../supabase/functions/qa1243-google-mail-bridge/connectivity.mjs';

const secret='qa1243-synthetic-only-connectivity-secret';
const json=value=>Response.json(value);

test('ContentService redirect switches POST to GET without signed body, credentials or query logging',async()=>{
 const calls=[];
 const output=await postGas('{',{fetcher:async(url,options)=>{
  calls.push({url,options});
  return calls.length===1?new Response('',{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?opaque=never-log-this'}}):json({ok:false,code:'BAD_JSON'});
 }});
 assert.equal(calls[0].options.method,'POST');assert.equal(calls[1].options.method,'GET');
 assert.equal(calls[1].options.body,undefined);assert.equal(calls[1].options.headers,undefined);
 assert.equal(output.receipt.code,'BAD_JSON');assert.doesNotMatch(JSON.stringify(output),/opaque|never-log/);
});

test('reject untrusted redirects, target changes, redirects that retain POST and missing Location',async()=>{
 for(const location of ['https://evil.example/macros/echo','http://script.googleusercontent.com/macros/echo',
   'https://user:pass@script.googleusercontent.com/macros/echo','https://script.googleusercontent.com/wrong','']) {
  let count=0;
  await assert.rejects(postGas('{',{fetcher:async()=>{count++;return new Response('',{status:302,headers:{location}});}}),/GAS_REDIRECT_/);
  assert.equal(count,1);
 }
 await assert.rejects(postGas('{',{fetcher:async()=>new Response('',{status:307,headers:{location:'https://script.googleusercontent.com/macros/echo'}})}),/GAS_REDIRECT_REJECTED/);
 await assert.rejects(postGas('{',{endpoint:'https://evil.example'}),/CONNECTIVITY_TARGET_REJECTED/);
});

test('Google Access Denied is a transport failure, never BAD_JSON or an SMTP diagnosis',async()=>{
 const result=await postGas('{',{fetcher:async()=>new Response('<title>Access Denied</title>You need access',{status:403,headers:{'content-type':'text/html; charset=utf-8'}})});
 assert.equal(result.classification,'GOOGLE_ACCESS_DENIED_BEFORE_RUNTIME');
 assert.equal(result.receipt,null);assert.equal(result.httpStatus,403);assert.deepEqual(result.redirects,[]);
});

test('verified OIDC claims are restricted to exact main workflow or approved PR1361',()=>{
 const claims={iss:'https://token.actions.githubusercontent.com',aud:QA_AUDIENCE,repository:'koith/attendance-proto',
  ref:'refs/heads/main',event_name:'workflow_dispatch',run_id:'123',
  workflow_ref:'koith/attendance-proto/.github/workflows/qa1243-google-mail-bridge.yml@refs/heads/main'};
 assert.equal(assertConnectivityIdentity(claims),'123');
 assert.equal(assertConnectivityIdentity({...claims,ref:'refs/pull/1361/merge',event_name:'pull_request',
  workflow_ref:'koith/attendance-proto/.github/workflows/qa1243-google-mail-bridge.yml@refs/pull/1361/merge'}),'123');
 for(const patch of [{repository:'attacker/repo'},{aud:'other'},{iss:'https://evil.example'},{ref:'refs/pull/1362/merge'},
  {workflow_ref:'koith/attendance-proto/.github/workflows/other.yml@refs/heads/main'},
  {event_name:'pull_request_target'},{run_id:'../secret'}])
  assert.throws(()=>assertConnectivityIdentity({...claims,...patch}),/CONNECTIVITY_IDENTITY_REJECTED/);
});

test('Edge connectivity exercises the unchanged GAS entrypoint with real HMAC, invalid JSON and replay',async()=>{
 const cache=new Map();let executions=0;
 const ctx={Date,Number,Math,JSON,Object,
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
  MailApp:new Proxy({}, {get(){throw Error('No mail service calls allowed');}}),
  Utilities:{computeHmacSha256Signature:(s,k)=>[...createHmac('sha256',k).update(s).digest()],base64Encode:b=>Buffer.from(b).toString('base64')},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({setMimeType:()=>s})}
 };
 vm.runInNewContext(await readFile(new URL('../gas/qa1243-auth-mail/Code.gs',import.meta.url),'utf8'),ctx);
 const result=await verifyConnectivity({secret,endpoint:QA_GAS_URL,runId:'123',nonce:'synthetic',fetcher:async(url,options)=>{
  assert.equal(url,QA_GAS_URL);executions++;
  return new Response(ctx.doPost({postData:{contents:options.body}}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(executions,4);assert.equal(result.ok,true);assert.equal(result.mailSent,false);
 assert.equal(cache.size,1);assert.equal(result.checks.length,4);assert.ok(result.checks.every(c=>c.pass));
 assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
});

test('unreachable GAS stops after one failure and cannot be marked successful',async()=>{
 let calls=0;
 const result=await verifyConnectivity({secret,endpoint:QA_GAS_URL,runId:'123',fetcher:async()=>{calls++;return new Response('Access Denied',{status:403});}});
 assert.equal(calls,1);assert.equal(result.ok,false);assert.equal(result.checks[0].pass,false);
 assert.equal(result.checks.length,1);assert.equal(result.mailSent,false);
});

test('Edge rejects absent/invalid identity before accessing secrets or making network calls',async()=>{
 const configuration=()=>{throw Error('Secrets must not be accessed');};
 const fetcher=()=>{throw Error('Network must not be accessed');};
 const req=headers=>new Request(QA_AUDIENCE+'/connectivity',{method:'POST',headers,body:'{}'});
 assert.equal((await handleConnectivity(req({}),{configuration,fetcher,authenticate:()=>{throw Error('must not verify absent token');}})).status,401);
 assert.equal((await handleConnectivity(req({authorization:'Bearer invalid'}),{configuration,fetcher,authenticate:()=>{throw Error('invalid JWT');}})).status,403);
});

test('Edge rejects caller-selected message data and distinguishes missing configuration from authorization',async()=>{
 const authenticate=async()=>({iss:'https://token.actions.githubusercontent.com',aud:QA_AUDIENCE,repository:'koith/attendance-proto',
  ref:'refs/heads/main',event_name:'push',run_id:'123',workflow_ref:'koith/attendance-proto/.github/workflows/qa1243-google-mail-bridge.yml@refs/heads/main'});
 const req=body=>new Request(QA_AUDIENCE+'/connectivity',{method:'POST',headers:{authorization:'Bearer synthetic'},body});
 const rejected=await handleConnectivity(req('{"to":"owner@example.org"}'),{authenticate,configuration:()=>{throw Error('must not read config');}});
 assert.equal(rejected.status,400);
 const unavailable=await handleConnectivity(req('{}'),{authenticate,configuration:()=>({secret:'',endpoint:QA_GAS_URL})});
 assert.equal(unavailable.status,503);
 assert.deepEqual(await unavailable.json(),{error:'CONNECTIVITY_TRANSPORT_UNAVAILABLE'});
});
