import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const q=x=>assert.match(html,x);
q(/const STORE_ENTRY_MISSING_ID=STORE_ENTRY_MODE==="store"&&STORE_ENTRY_RAW_ID===null&&!STORE_ENTRY_PATH/);
q(/const STORE_ENTRY_INVALID=STORE_ENTRY_MISSING_ID\|\|/);
q(/!Number\.isSafeInteger\(Number\(STORE_ENTRY_RAW_ID\)\)/);
q(/let STORE_ENTRY_UNAVAILABLE=STORE_ENTRY_LOCK&&LIVE/);
q(/if\(STORE_ENTRY_INVALID\)return;/);
q(/const active=rows\.find\(x=>Number\(x\.id\)===CURRENT_STORE_ID&&x\.is_active!==false\)/);
q(/if\(!active\)\{STORE_ENTRY_UNAVAILABLE=true;return;\}/);
q(/catch\(e\)\{STORE_ENTRY_UNAVAILABLE=true;console\.warn\("dedicated store not verified",e\)/);
q(/if\(STORE_ENTRY_UNAVAILABLE\)\{[\s\S]*?지점 운영 준비 중[\s\S]*?return;\}/);
q(/if\(STORE_ENTRY_LOCK&&\(!requested\|\|STORE_ENTRY_INVALID\)\)\{STORE_ENTRY_UNAVAILABLE=true;return;\}/);
q(/const tabs=Number\(CURRENT_STORE_ID\)===1/);
q(/\["report","리포트"\]/);
q(/\["inventory","재고"\]/);
q(/const APP_VERSION="v0\.214"/);
assert.ok(!/CURRENT_STORE_ID=STORE_ENTRY_ID\|\|1;[\s\S]{0,500}catch\(e\)\{\}/.test(html),
  'Store identity lookup must not silently swallow readiness failures');
// Run the shipped URL decoder in isolation: a missing store ID must never become Inha.
const routeSource=html.slice(html.indexOf('const STORE_ENTRY_PARAMS='),html.indexOf('const STORE_ENTRY_URL='));
assert.ok(routeSource.includes('STORE_ENTRY_MISSING_ID'),'Dedicated entry decoder unavailable');
const {runInNewContext}=await import('node:vm');
const resolve=(search,pathname='/attendance-proto/index.html')=>
  runInNewContext(routeSource+'\n({invalid:STORE_ENTRY_INVALID,id:STORE_ENTRY_ID,locked:STORE_ENTRY_LOCK})',{
    location:{search,pathname},URLSearchParams,sessionStorage:{removeItem(){}}
  });
for(const search of ['?mode=store','?mode=store&store=','?mode=store&store=0',
                     '?mode=store&store=nope','?store=01']){
  const x=resolve(search);
  assert.equal(x.invalid,true,'Dedicated invalid URL accepted: '+search);
  assert.equal(x.id,0,'Dedicated invalid URL fell back to Inha: '+search);
  assert.equal(x.locked,true,'Dedicated invalid URL escaped store entry lock: '+search);
}
assert.equal(resolve('?mode=store&store=1').id,1,'Explicit Inha URL must remain valid');
assert.equal(resolve('?mode=store&store=2').id,2,'Explicit other store identity must remain valid');
assert.equal(resolve('', '/attendance-proto/inha').id,1,'Legacy Inha path must remain valid');
assert.equal(resolve('').locked,false,'HQ root must not become a dedicated URL');
console.log('PASS READY-only branch page routing, invalid-id rejection, zero cross-store fallback, Inha menu preserved');
