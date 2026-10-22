import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Never invite owners or activate a real store. Test the production CSV
// formatter with synthetic HQ data; no network, account or DB writes.
const source=fs.readFileSync('hq_store_onboarding_ui.js','utf8');
const start=source.indexOf('const activationBlockers=');
const end=source.indexOf('window.mountHqStoreOnboarding=async function(box){',start);
assert.ok(start>0 && end>start,'Real HQ readiness formatter is present');
const csv=vm.runInNewContext(source.slice(start,end)+'\nreadinessCsv;', {});
assert.match(source,/id="hqStoreReadinessExport"/,'HQ can explicitly request full rollout checklist');
assert.match(source,/readinessCsv\(stores,proofs,sampleCounts,primaryOwners,managers\)/,'Use unfiltered HQ RPC data plus real owner roster');
assert.match(source,/type:"text\/csv;charset=utf-8"/,'Export actual CSV data');
assert.match(source,/link\.download="baekeok-store-readiness-"/,'Trigger local download only');

const stores=[
 {id:1,name:'인하대학교점',code:'INHA',region_group:'인천',onboarding_status:'READY',manager_count:0},
 {id:2,name:'=HYPERLINK("evil")',code:'TWO',region_group:'서울',onboarding_status:'STAGED',manager_count:0},
 {id:3,name:'검증대기점',code:'THREE',region_group:'경기',onboarding_status:'STAGED',manager_count:1},
 {id:4,name:'개통준비점',code:'FOUR',region_group:'경기',onboarding_status:'STAGED',manager_count:1}
];
const proof=[{store_id:3,decision:'VERIFIED'},{store_id:4,decision:'VERIFIED'}];
const demo=[{store_id:2,sample_employee_count:3},{store_id:3,sample_employee_count:1}];
const primary=[
 {store_id:3,user_id:'owner-3'}, {store_id:4,user_id:'owner-4'}
];
const managers=[
 {store_id:3,user_id:'owner-3',email:'third@synthetic.invalid'},
 {store_id:4,user_id:'owner-4',email:'fourth@synthetic.invalid'}
];
const data=csv(stores,proof,demo,primary,managers);
assert.ok(data.startsWith('\uFEFF'),'UTF-8 BOM needed for Korean Excel');
assert.ok(data.endsWith('\r\n'),'RFC4180 lines');
assert.equal(data.split('\r\n').filter(Boolean).length,5,'Every registered store exported, regardless of UI filter');
assert.match(data,/지점ID.*미완료조건/);
assert.match(data,/"인하대학교점".*"운영 중"/);
assert.match(data,/"'=HYPERLINK\(""evil""\)"/,'Excel formula characters are escaped');
assert.match(data,/샘플·데모 직원 검토/,'Sample data blocks rollout');
assert.match(data,/인증 관리자 계정/,'Unconfirmed manager blocks rollout');
assert.match(data,/본사 실재 확인/,'Unverified franchise blocks rollout');
const eligible=data.split('\r\n').find(line=>line.includes('"개통준비점"'));
assert.match(eligible,/"지정","0","예",""$/,'Verified store with linked primary owner, manager and no samples eligible');
const missing=data.split('\r\n').find(line=>line.includes('"검증대기점"'));
assert.match(missing,/"아니오".*샘플·데모 직원 검토/);
const ownerMissing=csv(stores,proof,demo,[{store_id:3,user_id:'owner-3'}],managers);
assert.match(ownerMissing.split('\r\n').find(line=>line.includes('"개통준비점"')),
 /"아니오".*대표 관리자 지정·연결/,'Assistant or manager without appointed owner cannot be READY');
const wrongStore=csv(stores,proof,demo,[{store_id:4,user_id:'owner-3'}],managers);
assert.match(wrongStore.split('\r\n').find(line=>line.includes('"개통준비점"')),
 /"아니오".*대표 관리자 지정·연결/,'Cross-store owner must not unlock READY');
const dangling=csv(stores,proof,demo,[{store_id:4,user_id:'missing-owner'}],managers);
assert.match(dangling.split('\r\n').find(line=>line.includes('"개통준비점"')),
 /"아니오".*대표 관리자 지정·연결/,'Orphan primary owner cannot unlock READY');
assert.match(source,/activationBlockers\(store,proof,sampleEmployeeCount,primaryOwnerId,list\)\.length===0/,
 'HQ READY button must be fail-closed on same owner predicate as CSV');
assert.match(source,/if\(!canActivate\)return err\(/,'HQ click handler must recheck owner readiness');
assert.doesNotMatch(data,/@example\.com|pin_bcrypt|secret/i,'No owner emails or secret fields');
console.log('PASS nationwide HQ readiness export: 4 synthetic stores, blockers, BOM, CSV formula protection');
