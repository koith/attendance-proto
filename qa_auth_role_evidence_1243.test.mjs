import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAuthRoleEvidence} from './qa_auth_role_evidence_1243.mjs';
// Unit fixture only: never emitted as actual Auth evidence.
const src=readFileSync('qa_auth_role_evidence_1243.mjs','utf8');
const names=[...src.split('const required=[')[1].split('];')[0].matchAll(/'([^']+)'/g)].map(x=>x[1]);
const sha='a'.repeat(40),valid={commit:sha,scope:'ISOLATED_REAL_AUTH_SMTP_POSTGREST',hostedAuthTested:false,googleE2ERepeated:false,results:names.map(name=>({name,result:'PASS'}))};
assert.equal(validateAuthRoleEvidence(valid,sha).result,'PASS');
for(const bad of [null,{}, {...valid,commit:'b'.repeat(40)},{...valid,scope:'MOCK'},
 {...valid,hostedAuthTested:true},{...valid,googleE2ERepeated:true},
 {...valid,results:valid.results.slice(1)},
 {...valid,results:valid.results.map((r,i)=>i?valid.results[0]:r)},
 {...valid,results:valid.results.map((r,i)=>i?r:{...r,result:'FAIL'})}])
 assert.throws(()=>validateAuthRoleEvidence(bad,sha),/AUTH_ROLE_EVIDENCE_UNVERIFIED/);
console.log('PASS Auth role evidence validator rejects old, incomplete, duplicate, failed and overstated proofs');
