import test from 'node:test';
import assert from 'node:assert/strict';
import {restrictedProviderEnv} from '../../../scripts/security/autopilot/provider_env.mjs';
const baseline={
 GITHUB_REPOSITORY:'koith/attendance-proto',
 GITHUB_TOKEN:'synthetic-readonly-token',
 PATH:'/bin:/usr/bin',HOME:'/home/runner',RUNNER_TEMP:'/tmp',CI:'true'
};
test('synthetic arbitrary secret names and command injection never reach provider',()=>{
 const source={...baseline,OPENAI_API_KEY:'synthetic-key',
  ANTHROPIC_API_KEY:'synthetic-key',SUPABASE_DB_URL:'synthetic-db',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-key',SUPABASE_ACCESS_TOKEN:'synthetic-key',
  GITHUB_WRITE_TOKEN:'synthetic-write',GH_TOKEN:'synthetic-write',
  GOOGLE_APPLICATION_CREDENTIALS:'synthetic-key',AWS_SECRET_ACCESS_KEY:'synthetic-key',
  PGPASSWORD:'synthetic-password',NODE_OPTIONS:'--require /tmp/evil.js',
  HTTPS_PROXY:'http://malicious.invalid',SEC_AUTOPILOT_HOST_PRIVATE_CANARY:'synthetic-key'};
 const actual=restrictedProviderEnv(source);
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(baseline).sort());
 for(const key of Object.keys(source)){
  if(!Object.hasOwn(baseline,key))assert.equal(actual[key],undefined,key);
 }
});
test('future unknown keys are also denied by default',()=>{
 const actual=restrictedProviderEnv({...baseline,SECRET_2027:'synthetic-secret',
  PASSWORD_2027:'synthetic-password',GITHUB_ENV:'/tmp/protected'});
 for(const key of ['SECRET_2027','PASSWORD_2027','GITHUB_ENV'])
  assert.equal(actual[key],undefined);
});
test('missing or wrong repo permission boundary fails closed',()=>{
 assert.throws(()=>restrictedProviderEnv(null),/INVALID_PROVIDER_ENV/);
 assert.throws(()=>restrictedProviderEnv({...baseline,GITHUB_TOKEN:''}),/READONLY_PROVIDER_CONTEXT_MISSING/);
 assert.throws(()=>restrictedProviderEnv({...baseline,GITHUB_REPOSITORY:'attacker/repo'}),/READONLY_PROVIDER_CONTEXT_MISSING/);
});
test('approved process-runtime keys remain usable',()=>{
 const actual=restrictedProviderEnv({...baseline,LANG:'C.UTF-8',
  XDG_CACHE_HOME:'/tmp/cache',NODE_ENV:'production'});
 assert.equal(actual.LANG,'C.UTF-8');
 assert.equal(actual.XDG_CACHE_HOME,'/tmp/cache');
 assert.equal(actual.NODE_ENV,undefined);
});
