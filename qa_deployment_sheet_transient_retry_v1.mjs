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
const fetch=async()=>{const x=replies[count++];return {status:x.status,ok:x.status>=200&&x.status<300,json:async()=>x};};
const core={getIDToken:async()=> 'test-token',info:()=>{},warning:()=>{}};
await run(fetch,core,originalSetTimeout,console);
assert.equal(count,3,'Must wait until explicit Sheet confirmation');
assert.deepEqual(sleeps,[30000,15000],'Retry backoff for known transient failures');
let rejected=false;
try{await run(async()=>({status:403,ok:false,json:async()=>({error:'NOT_AUTHORIZED'})}),core,()=>{throw Error('Must not retry auth failures')},console)}
catch(e){rejected=String(e.message).includes('Deployment Sheet write unconfirmed')}
assert.equal(rejected,true,'Must reject non-retryable authorization failures');
console.log('PASS deployment accepts only confirmed Sheet write/auto-resize and bounded known transient retries');
