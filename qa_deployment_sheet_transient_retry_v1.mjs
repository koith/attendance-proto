import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const yaml=fs.readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
const section=yaml.split('      - name: Confirm immediate Sheet refresh after Pages deployment')[1]?.split('\n      - name: ')[0];
assert.ok(section,'Production deployment Sheet proof must remain');
const src=section.split('          script: |\n')[1]?.split('\n').map(line=>line.startsWith('            ')?line.slice(12):line).join('\n');
assert.ok(src,'Sheet verification script missing');
assert.match(src,/response\.status === 409 && result\?\.error === 'SHEET_SYNC_BUSY'/);
assert.match(src,/response\.status === 502 && result\?\.error === 'SHEET_NON_JSON_RESPONSE'/);
assert.match(src,/result\.written === true/);
assert.match(src,/result\.column_resize_applied === true/);
assert.match(src,/if \(!confirmed\) throw new Error/);
const replies=[
  {status:502,error:'SHEET_NON_JSON_RESPONSE'},
  {status:409,error:'SHEET_SYNC_BUSY'},
  {status:200,ok:true,written:true,spreadsheet_id:'QA',column_resize_applied:true,ym:'2026-10'}
];
let count=0;
const sleeps=[];
const run=new Function('fetch','core','setTimeout','console',
  'return (async()=>{\n'+src+'\n})();');
const originalSetTimeout=(fn,ms)=>{sleeps.push(ms);fn();};
const fetch=async(url,options)=>{
  assert.equal(url,'https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet');
  seen.push(options.headers.Authorization);
  const x=replies[count++];
  return {status:x.status,ok:x.status>=200&&x.status<300,json:async()=>x};
};
let tokenCalls=0;const issued=[],seen=[];
const core={getIDToken:async audience=>{
  assert.match(audience,/\/functions\/v1\/server-sync-sheet$/);
  const token='test-short-lived-oidc-'+(++tokenCalls);
  issued.push(token);
  return token;
},info:()=>{},warning:()=>{}};
await run(fetch,core,originalSetTimeout,console);
assert.equal(count,3,'Must wait until explicit Sheet confirmation');
assert.equal(tokenCalls,3,'New OIDC JWT must be fetched immediately before each attempt');
assert.deepEqual(seen,issued.map(token=>'Bearer '+token),
  'Never reuse an expired OIDC JWT across slow Sheet retries');
assert.deepEqual(sleeps,[30000,15000],'Retry backoff for known transient failures');
let rejected=false;
try{await run(async()=>({status:403,ok:false,json:async()=>({error:'NOT_AUTHORIZED'})}),core,()=>{throw Error('Must not retry auth failures')},console)}
catch(e){rejected=String(e.message).includes('Deployment Sheet write unconfirmed')}
assert.equal(rejected,true,'Must reject non-retryable authorization failures');
// Worst-case transient retry sequence must refresh identity on every call.
const longSequence=Array.from({length:7},()=>({status:502,error:'SHEET_NON_JSON_RESPONSE'}));
longSequence.push({status:200,ok:true,written:true,spreadsheet_id:'QA-LONG',column_resize_applied:true,ym:'2026-10'});
let longIdx=0,authHeader=[],refreshCalls=0;
const longCore={getIDToken:async()=> 'renewed-'+(++refreshCalls),info:()=>{},warning:()=>{}};
await run(async(url,options)=>{
 authHeader.push(options.headers.Authorization);
 const row=longSequence[longIdx++];
 return {status:row.status,ok:row.status===200,json:async()=>row};
},longCore,originalSetTimeout,console);
assert.equal(longIdx,8);
assert.equal(refreshCalls,8);
assert.deepEqual(authHeader,Array.from({length:8},(_,i)=>'Bearer renewed-'+(i+1)));
console.log('PASS #1248: confirmed sheet refresh only; every retry rotates short-lived OIDC, including 8-attempt slow-GAS scenario');
