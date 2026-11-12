// This test is valid only inside the real GitHub Actions Docker sandbox.
// No production key or data is used; host canary is a synthetic string.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from 'node:net';

test('untrusted QA container inherits no host secret names',()=>{
 for(const key of ['GITHUB_TOKEN','GH_TOKEN','SUPABASE_DB_URL',
   'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','OPENAI_API_KEY',
   'AWS_SECRET_ACCESS_KEY','SEC_AUTOPILOT_HOST_PRIVATE_CANARY'])
  assert.equal(process.env[key],undefined,'unexpected key '+key);
});
test('untrusted QA container cannot connect to an external network address',async()=>{
 const result=await new Promise(resolve=>{
  const socket=connect({host:'203.0.113.1',port:443});
  let ended=false;
  const done=value=>{if(!ended){ended=true;socket.destroy();resolve(value)}};
  socket.once('error',e=>done(e.code||'ERROR'));
  socket.once('connect',()=>done('CONNECTED'));
  socket.setTimeout(1500,()=>done('TIMEOUT'));
 });
 assert.ok(['ENETUNREACH','EHOSTUNREACH','ENETDOWN'].includes(result),
  'unexpected outbound network result '+result);
});
test('untrusted QA container has a read-only source mount',()=>{
 assert.ok(process.getuid&&process.getuid()!==0,'must not run as root');
 assert.throws(()=>writeFileSync('/src/qa/security/autopilot/.sandbox-write-probe','bad'));
});
test('untrusted QA container has no effective capabilities or privilege escalation',()=>{
 const status=readFileSync('/proc/self/status','utf8');
 assert.match(status,/^NoNewPrivs:\s*1\s*$/m);
 assert.match(status,/^CapEff:\s*0+\s*$/m);
});
