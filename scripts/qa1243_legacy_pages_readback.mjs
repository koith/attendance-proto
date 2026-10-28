// Read-only verification of the real original URLs; never logs credentials,
// user names, attendance values, mail links or response bodies.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://koith.github.io/attendance-proto/';
const sha=s=>createHash('sha256').update(s).digest('hex');
const expected=readFileSync('index.html','utf8'),expectedSha=sha(expected);
const version=expected.match(/const APP_VERSION="([^"]+)"/)?.[1];
const api=expected.match(/SUPABASE_URL:\s*"([^"]+)"/)?.[1];
const key=expected.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
assert.ok(api&&key);
async function get(url){
 const r=await fetch(url,{cache:'no-store',redirect:'follow',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
 assert.equal(new URL(r.url).origin,'https://koith.github.io');assert.equal(r.status,200);
 return {url,final:r.url,status:r.status,body:await r.text(),etag:r.headers.get('etag'),cacheControl:r.headers.get('cache-control')};
}
let published=false;
for(let i=0;i<12;i++){
 const index=await get(base);if(sha(index.body)===expectedSha){published=true;break;}
 if(i<11)await new Promise(done=>setTimeout(done,5000));
}
assert.ok(published,'original root URL still serves an older release');
const paths=['','index.html','?v=24#pos','?mode=hq#dashboard','index.html#dashboard',
 '?mode=store&store=1#pos','index.html?mode=store&store=1&v=0.371#pos'];
const rows=await Promise.all(paths.map(async p=>{
 const r=await get(base+p);assert.equal(sha(r.body),expectedSha,'original URL bytes differ: '+p);
 return {url:r.url,final:r.final,status:r.status,version,sha256:sha(r.body),etag:r.etag,cacheControl:r.cacheControl};
}));
const helper=await get(base+'app_release_probe_v1.js');
assert.equal(sha(helper.body),sha(readFileSync('app_release_probe_v1.js','utf8')));
const manifest=JSON.parse((await get(base+'app-release.json?check='+Date.now())).body);
assert.equal(manifest.version,version);assert.equal(manifest.index_sha256,expectedSha);assert.equal(manifest.commit,process.env.GITHUB_SHA);
// Configuration and public READY-store discovery are real production reads.
const auth=await fetch(api+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(15000)});assert.equal(auth.status,200);
const storeResponse=await fetch(api+'/rest/v1/rpc/list_stores',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
assert.equal(storeResponse.status,200);const stores=await storeResponse.json();assert.ok(stores.some(s=>Number(s.id)===1&&s.is_active!==false));
mkdirSync('qa-results',{recursive:true});
const proof={version,commit:manifest.commit,rows,helperExact:true,manifestExact:true,authSettingsStatus:auth.status,storeStatus:storeResponse.status,inhaActive:true,operatingWrite:false};
writeFileSync('qa-results/legacy-entry-public-readback.json',JSON.stringify(proof,null,2));
console.log('LEGACY_ENTRY_PUBLIC_READBACK_PASS '+JSON.stringify(proof));
