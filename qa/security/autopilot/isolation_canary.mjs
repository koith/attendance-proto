// Isolated, synthetic CI canary: run ONLY inside --network none --read-only
// container from SEC policy job. No external requests are allowed to succeed.
import {strict as assert} from 'node:assert';
import {readFileSync,writeFileSync} from 'node:fs';
import {connect} from 'node:net';

assert.equal(process.getuid(),1000,'untrusted QA must not run as root');
for(const key of ['GITHUB_TOKEN','GH_TOKEN','OPENAI_API_KEY','SUPABASE_DB_URL',
 'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','GOOGLE_OAUTH_CLIENT_SECRET']){
 assert.ok(!process.env[key],'CANARY_SECRET_ENV_PRESENT_'+key);
}
const proc=readFileSync('/proc/self/status','utf8');
assert.match(proc,/^CapEff:\s*0+\s*$/m,'container capabilities must be absent');
assert.throws(()=>writeFileSync('/src/.sec-isolation-canary-write','nope'),error=>
 ['EROFS','EACCES','EPERM'].includes(error?.code),'checkout must be mounted read-only');
const result=await new Promise(resolve=>{
 const socket=connect({host:'1.1.1.1',port:443});
 let done=false;
 const finish=answer=>{
  if(done)return;done=true;socket.destroy();resolve(answer);
 };
 socket.setTimeout(1200,()=>finish('TIMEOUT'));
 socket.once('connect',()=>finish('CONNECTED'));
 socket.once('error',e=>finish(e.code||'UNKNOWN_ERROR'));
});
assert.match(result,/^(?:ENETUNREACH|EHOSTUNREACH|EACCES|EPERM)$/,
 'no network route may exist for synthetic QA: '+result);
console.log('PASS_AI_SEC_ISOLATION_CANARY no_network read_only no_capabilities no_secrets nonroot');
