// Public HTTP only; no Auth login, SQL, mail, Google or Sheets requests.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://koith.github.io/attendance-proto/';
const changed=['index.html','hq_owner_console.js','hq_store_onboarding_ui.js',
 'owner_activation.html','owner_activation.js','owner_temp_activation.html','owner_temp_activation.js'];
const unchanged=['operations_v1.js','actual_attendance.html','actual_attendance.js',
 'actual_attendance.css','recipe_access_v220.js','recipe_access_v220.css'];
const receipt='/tmp/qa1243_approved_owner_pages_before.json';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function get(file){const r=await fetch(base+file+'?qa1243_opening='+Date.now(),{
 redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,200,'LIVE_OWNER_ASSET_HTTP '+file);return r.text();}
async function hashes(paths){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await get(p))])));}
async function published(){
 assert.match(readFileSync('index.html','utf8'),/const APP_VERSION="v0\.369";/);
 const expected=Object.fromEntries(changed.map(p=>[p,sha(readFileSync(p,'utf8'))]));
 for(let n=0;n<18;n++){
  const observed=await hashes(changed);
  if(changed.every(p=>observed[p]===expected[p]))return observed;
  if(n<17)await new Promise(r=>setTimeout(r,10000));
 }
 throw Error('APPROVED_OWNER_PAGES_BYTE_MISMATCH');
}
const mode=process.argv[2];
if(mode==='--before'){
 writeFileSync(receipt,JSON.stringify(await hashes(unchanged)));
 console.log('APPROVED_OWNER_PAGES_BASELINE_CAPTURED');
}else if(['--after','--independent'].includes(mode)){
 const proof=await published();
 if(mode==='--after')assert.deepEqual(await hashes(unchanged),JSON.parse(readFileSync(receipt,'utf8')));
 console.log('APPROVED_OWNER_V369_PAGES_PASS '+JSON.stringify({mode,proof,mailSent:false,operatingDataWrite:false}));
}else throw Error('READ_ONLY_PUBLIC_MODE_REQUIRED');
