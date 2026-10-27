// Public HTTP only: never Auth login, RPC, mail or Sheets mutation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='https://koith.github.io/attendance-proto/';
const record='/tmp/qa1243_temp_owner_pages_before.json';
const unchanged=['operations_v1.js','hq_store_onboarding_ui.js','actual_attendance.html',
 'actual_attendance.js','actual_attendance.css','owner_activation.html','owner_activation.js','recipe_access_v220.js'];
const changed=['index.html','owner_temp_activation.html','owner_temp_activation.js'];
const digest=text=>createHash('sha256').update(text).digest('hex');
async function get(path){const r=await fetch(root+path+'?v=qa1243-owner-resume-'+Date.now(),{
 redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,path);return r.text();}
async function baseline(){return Object.fromEntries(await Promise.all(unchanged.map(async p=>[p,digest(await get(p))])));}
async function published(){
 const expected=Object.fromEntries(changed.map(p=>[p,digest(readFileSync(p,'utf8'))]));
 assert.match(readFileSync('index.html','utf8'),/const APP_VERSION="v0\.(?:364|367)";/);
 for(let n=0;n<18;n++){
  const actual=Object.fromEntries(await Promise.all(changed.map(async p=>[p,digest(await get(p))])));
  if(changed.every(p=>actual[p]===expected[p]))return actual;
  if(n<17)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 throw Error('TEMP_OWNER_PAGES_BYTE_MISMATCH');
}
const mode=process.argv[2];
if(mode==='--before'){writeFileSync(record,JSON.stringify(await baseline()));console.log('TEMP_OWNER_PAGES_BASELINE_CAPTURED');}
else if(['--after','--independent'].includes(mode)){
 const proof=await published();if(mode==='--after')assert.deepEqual(await baseline(),JSON.parse(readFileSync(record,'utf8')));
 console.log('TEMP_OWNER_PAGES_PASS '+JSON.stringify({mode,proof,
  appVersion:readFileSync('index.html','utf8').match(/const APP_VERSION="([^"]+)";/)?.[1],
  operatingDataWrite:false,mailSent:false}));
}else throw Error('READBACK_MODE_REQUIRED');
