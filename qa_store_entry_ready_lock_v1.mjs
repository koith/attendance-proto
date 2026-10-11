import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('index.html','utf8');
const q=x=>assert.match(html,x);
q(/const STORE_ENTRY_INVALID=STORE_ENTRY_RAW_ID!==null&&/);
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
q(/const APP_VERSION="v0\.207"/);
assert.ok(!/CURRENT_STORE_ID=STORE_ENTRY_ID\|\|1;[\s\S]{0,500}catch\(e\)\{\}/.test(html),
  'Store identity lookup must not silently swallow readiness failures');
console.log('PASS READY-only branch page routing, invalid-id rejection, zero cross-store fallback, Inha menu preserved');
