import assert from 'node:assert/strict';
import fs from 'node:fs';
const yaml=fs.readFileSync('.github/workflows/apps-script-deploy.yml','utf8');
const section=yaml.split('      - name: Confirm Sheet refresh after Apps Script deployment')[1]?.split('\n      - name: ')[0];
assert.ok(section,'Actual GAS deployment post-release sheet proof must remain');
const source=section.split('          script: |\n')[1]?.split('\n').map(line=>line.startsWith('            ')?line.slice(12):line).join('\n');
assert.ok(source,'GAS sheet proof script present');
assert.match(source,/response\.status === 409 && result\?\.error === 'SHEET_SYNC_BUSY'/);
assert.match(source,/response\.status === 502 && result\?\.error === 'SHEET_NON_JSON_RESPONSE'/);
assert.match(source,/result\.written === true/);
assert.match(source,/result\.column_resize_applied === true/);
assert.match(source,/if \(!transient \|\| attempt === 8\)/);
const execute=new Function('fetch','core','setTimeout','return (async()=>{\n'+source+'\n})();');
const seq=[
 {status:409,error:'SHEET_SYNC_BUSY'},
 {status:502,error:'SHEET_NON_JSON_RESPONSE'},
 {status:200,ok:true,written:true,column_resize_applied:true,spreadsheet_id:'synthetic-QA',ym:'2026-10'}
];let requests=[],credentials=[],delays=[],i=0;
const core={getIDToken:async(url)=>{assert.match(url,/\/functions\/v1\/server-sync-sheet$/);let value='fresh-'+(credentials.length+1);credentials.push(value);return value;},info:()=>{},warning:()=>{}};
const fetch=async(url,options)=>{requests.push(options.headers.Authorization);const x=seq[i++];return {status:x.status,ok:x.status===200,json:async()=>x}};
await execute(fetch,core,(cb,delay)=>{delays.push(delay);cb()});
assert.equal(i,3);
assert.deepEqual(requests,credentials.map(v=>'Bearer '+v),'Must never reuse OIDC token on delayed GAS retries');
assert.deepEqual(delays,[15000,30000]);
let rejected=false,invalidAttempts=0;
try{await execute(async()=>{invalidAttempts++;return {status:403,ok:false,json:async()=>({error:'DEPLOYMENT_IDENTITY_REJECTED'})}},core,()=>{throw Error('Never retry untrusted identity')})}
catch(e){rejected=String(e.message).includes('Deployment Sheet write unconfirmed')}
assert.ok(rejected);assert.equal(invalidAttempts,1);
const transient=Array.from({length:7},()=>({status:502,error:'SHEET_NON_JSON_RESPONSE'}));
transient.push({status:200,ok:true,written:true,column_resize_applied:true,spreadsheet_id:'synthetic-last',ym:'2026-10'});
let c=0,tokens=[];
await execute(async(url,opts)=>{tokens.push(opts.headers.Authorization);const row=transient[c++];return {status:row.status,ok:row.status===200,json:async()=>row}},
 {getIDToken:async()=> 'case-'+(tokens.length+1),info:()=>{},warning:()=>{}}, (cb)=>cb());
assert.equal(c,8);assert.equal(new Set(tokens).size,8);
console.log('PASS QA-05 / #1243 Apps Script deployment proof: 3/8 attempts renew OIDC, Sheets readback required, fatal auth not retried');
