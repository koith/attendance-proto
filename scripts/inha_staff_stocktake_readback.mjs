import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const phase=process.argv[2],base='https://koith.github.io/attendance-proto/',digest=s=>createHash('sha256').update(s).digest('hex');
const changing=['index.html','operations_staff_stocktake_v1.js'];
const immutable=['actual_attendance.html','actual_attendance.js','recipe_access_v220.js','operations_v1.js','owner_activation.html','owner_activation.js','owner_temp_activation.html','owner_temp_activation.js','operations_staff_stocktake_v1.css','store_manager_tab.js','store_limited_manager.js','payroll_contract_authority_v1.js','version_test_toggle_982.js'];
async function get(path){const r=await fetch(base+path+(path.includes('?')?'&':'?')+'scope_check='+Date.now(),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return r.text()}
async function capture(){return Object.fromEntries(await Promise.all(immutable.map(async p=>[p,digest(await get(p))])))}
const state='/tmp/inha-staff-stocktake-before.json';
if(phase==='--before'){writeFileSync(state,JSON.stringify(await capture()));console.log('INHA_STOCKTAKE_IMMUTABLE_BASELINE');}
else{
 assert.ok(['--after','--independent'].includes(phase));
 let exact=false;for(let i=0;i<12;i++){
  const all=await Promise.all(changing.map(async p=>digest(await get(p))===digest(readFileSync(p))));
  if(all.every(Boolean)){exact=true;break}if(i<11)await new Promise(r=>setTimeout(r,5000));
 }
 assert.ok(exact,'reviewed runtime files not served');
 const local=readFileSync('index.html','utf8'),version=local.match(/const APP_VERSION="([^"]+)"/)[1];assert.equal(version,'v0.382');
 const paths=['','index.html','?v=24#pos','?mode=hq#dashboard','index.html?mode=store&store=1#pos','index.html?mode=store&store=80#admin','index.html?mode=store&store=290#pos'];
 for(const p of paths)assert.equal(digest(await get(p.split('#')[0])),digest(local));
 const marker=JSON.parse(await get('app-release.json'));assert.equal(marker.version,version);assert.equal(marker.index_sha256,digest(local));assert.equal(marker.commit,process.env.GITHUB_SHA);
 const hashes=await capture();if(phase==='--after')assert.deepEqual(hashes,JSON.parse(readFileSync(state,'utf8')));
 mkdirSync('qa-results',{recursive:true});writeFileSync('qa-results/inha-stocktake-readback.json',JSON.stringify({version,commit:marker.commit,urls:paths.length,changing,immutable,hashes,operatingWrite:false},null,2));
 console.log('INHA_STOCKTAKE_READBACK_PASS '+JSON.stringify({version,commit:marker.commit,urls:paths.length,unchangedAssets:phase==='--after'?immutable.length:'publication-receipt',operatingWrite:false}));
}
