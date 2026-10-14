import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const host='https://koith.github.io/attendance-proto';
const files=JSON.parse(process.env.CHANGED_RELEASE_FILES||'[]');
const sha=process.env.DEPLOY_SHA||'';
assert.match(sha,/^[0-9a-f]{40}$/,'Deployment commit required');
const relevant=files.filter(p=>/^(index\.html|[a-zA-Z0-9_-]+\.(?:js|html|css))$/.test(p));
const timeout=15000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const path of relevant){
 assert.ok(fs.existsSync(path),'Changed app asset missing from deployed commit: '+path);
 const expected=crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
 let actual='',status=0;
 for(let i=0;i<8;i++){
  const response=await fetch(host+'/'+path+'?release_sha='+sha+'&try='+i,{
   headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(timeout)});
  status=response.status;
  if(response.ok){
   const bytes=Buffer.from(await response.arrayBuffer());
   actual=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  if(status===200&&actual===expected)break;
  if(i<7)await sleep(3000);
 }
 assert.equal(status,200,'Published changed asset missing: '+path);
 assert.equal(actual,expected,'Published asset differs from exact commit: '+path);
 console.log('PASS exact published bytes '+path+' '+sha);
}
console.log('PASS release source parity '+relevant.length+' changed public assets; commit '+sha);
