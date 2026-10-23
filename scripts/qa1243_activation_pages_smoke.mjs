// Public HTTP receipt for the activation-only v0.356 fix. No Auth/DB/Sheet write.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://koith.github.io/attendance-proto/';
const record='/tmp/qa1243_activation_pages_before.json';
const immutable=['operations_v1.js','hq_store_onboarding_ui.js','actual_attendance.html','actual_attendance.js','recipe_access_v220.js'];
const hash=text=>createHash('sha256').update(text).digest('hex');
async function get(file){
 const response=await fetch(base+file+'?qa1243_activation='+Date.now(),{redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,file);return response.text();
}
async function baseline(){return Object.fromEntries(await Promise.all(immutable.map(async f=>[f,hash(await get(f))])));}
async function published(){
 const files=['index.html','owner_activation.html','owner_activation.js'];
 const local=Object.fromEntries(files.map(f=>[f,readFileSync(f,'utf8')]));
 assert.match(local['index.html'],/const APP_VERSION="v0\.356";/);
 assert.match(local['owner_activation.html'],/owner_activation\.js\?v=20261023v356/);
 assert.match(local['owner_activation.js'],/change\.status===422&&updated\.code==="same_password"/);
 for(let attempt=0;attempt<18;attempt++){
  const remote=await Promise.all(files.map(get));
  if(files.every((f,i)=>hash(local[f])===hash(remote[i])))return Object.fromEntries(files.map(f=>[f,hash(local[f])]));
  if(attempt<17)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 throw Error('ACTIVATION_PAGES_BYTE_MISMATCH');
}
const mode=process.argv[2];
if(mode==='--before'){writeFileSync(record,JSON.stringify(await baseline()));console.log('QA1243_ACTIVATION_PAGES_BASELINE_CAPTURED');}
else if(['--after','--independent'].includes(mode)){
 const proof=await published();
 if(mode==='--after')assert.deepEqual(await baseline(),JSON.parse(readFileSync(record,'utf8')),'Unapproved operating app assets changed');
 console.log('QA1243_ACTIVATION_V356_PAGES_PASS '+JSON.stringify({version:'v0.356',proof,mode,operatingSheetWrite:false,hostedAuthConfigured:false}));
}else throw Error('READBACK_MODE_REQUIRED');
