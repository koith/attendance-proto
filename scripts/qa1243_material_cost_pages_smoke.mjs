// v0.355 public HTTP readback only. No Auth account, Sheet or DB mutation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='https://koith.github.io/attendance-proto/';
const record='/tmp/qa1243_material_cost_pages_before.json';
const immutable=['owner_activation.html','owner_activation.js','actual_attendance.html','actual_attendance.js','hq_store_onboarding_ui.js','recipe_access_v220.js'];
const sha=text=>createHash('sha256').update(text).digest('hex');
async function get(file){const r=await fetch(root+file+'?qa1243_cost='+Date.now(),{redirect:'error',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,file);return r.text();}
async function baseline(){return Object.fromEntries(await Promise.all(immutable.map(async f=>[f,sha(await get(f))])));}
async function published(){
 const local=Object.fromEntries(['index.html','operations_v1.js'].map(f=>[f,readFileSync(f,'utf8')]));
 assert.match(local['index.html'],/const APP_VERSION="v0\.355";/);
 assert.match(local['index.html'],/operations_v1\.js\?v=20261023v355/);
 for(let i=0;i<18;i++){
  const remote=await Promise.all(Object.keys(local).map(get));
  if(Object.keys(local).every((f,n)=>sha(local[f])===sha(remote[n])))return Object.fromEntries(Object.entries(local).map(([f,v])=>[f,sha(v)]));
  if(i<17)await new Promise(r=>setTimeout(r,10000));
 }
 throw Error('MATERIAL_COST_PAGES_BYTE_MISMATCH');
}
const mode=process.argv[2];
if(mode==='--before'){writeFileSync(record,JSON.stringify(await baseline()));console.log('QA1243_COST_PAGES_BASELINE_CAPTURED');}
else if(['--after','--independent'].includes(mode)){
 const proof=await published();
 if(mode==='--after')assert.deepEqual(await baseline(),JSON.parse(readFileSync(record,'utf8')),'Unapproved app assets changed');
 console.log('QA1243_V355_MATERIAL_COST_PAGES_PASS '+JSON.stringify({version:'v0.355',proof,operatingSheetWrite:false,mode}));
}else throw Error('READBACK_MODE_REQUIRED');
