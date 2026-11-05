// AISEC-07 synthetic drill + repository custody check (no real keys involved).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {check,drill} from './key_custody.mjs';

test('rotation, dual custody, revocation, single-key loss and tamper drill',()=>{
 const r=drill();
 assert.equal(r.result,'DRILL_PASS',JSON.stringify(r.steps.filter(s=>!s.ok)));
 assert.equal(r.steps.length,9);assert.equal(r.temp_removed,true);
});

test('repository check: recipient keys are RSA>=3072 and no private key is tracked',()=>{
 const r=check(process.cwd());
 assert.deepEqual(r.tracked_private_key_files,[]);
 assert.ok(r.recipients.length>=1);
 assert.ok(r.recipients.every(k=>k.ok&&k.bits>=3072),JSON.stringify(r.recipients));
 assert.equal(r.result,'PASS');
});

test('check fails closed when a private key is committed',()=>{
 const d=mkdtempSync(join(tmpdir(),'sec-custody-repo-'));
 try{
  execFileSync('git',['init','-q',d]);mkdirSync(join(d,'security'));
  execFileSync('openssl',['genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',join(d,'security','leak.pem')],{stdio:'ignore'});
  execFileSync('git',['-C',d,'add','.']);
  const r=check(d);
  assert.equal(r.result,'FAIL');assert.deepEqual(r.tracked_private_key_files,['security/leak.pem']);
  assert.ok(!JSON.stringify(r).includes('PRIVATE KEY-----'),'never echoes key material');
  // Regression: a nested invocation must not silently skip the root-tracked leaked key.
  const nested=join(d,'scripts','security','recovery');
  mkdirSync(nested,{recursive:true});
  const fromNested=check(nested);
  assert.equal(fromNested.result,'FAIL');
  assert.deepEqual(fromNested.tracked_private_key_files,['security/leak.pem']);
 }finally{rmSync(d,{recursive:true,force:true})}
});
