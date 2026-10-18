// SEC-01 #998: HTTP replay against disposable PostgREST/PostgreSQL.
// Subjects/JWT keys are synthetic. Real users and production are untouched.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='http://127.0.0.1:3000';
const secret='synthetic-fixture-jwt-signing-secret-with-at-least-32-chars-2026';
const uid='11111111-1111-1111-1111-111111111111';
const old='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const latest='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const next='dddddddd-dddd-dddd-dddd-dddddddddddd';
const staff='22222222-2222-2222-2222-222222222222';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=(role,sub,session_id)=>{
 const h=b64({alg:'HS256',typ:'JWT'});
 const p=b64({role,sub,session_id,iat:Math.floor(Date.now()/1000)-5,exp:Math.floor(Date.now()/1000)+1200});
 const sig=crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64url');
 return h+'.'+p+'.'+sig;
};
async function rpc(token){
 const response=await fetch(root+'/rpc/qa_session_http_probe',{
  headers:token?{Authorization:'Bearer '+token}:{},
  signal:AbortSignal.timeout(10000)
 });
 return {status:response.status,body:await response.text()};
}
const anon=await rpc(null);
assert.equal(anon.status,200,'anon POS/public RPC must work when pre-request enabled: '+anon.status+' '+anon.body.slice(0,180));
const working=await rpc(jwt('authenticated',uid,latest));
assert.equal(working.status,200,'latest admin login denied: '+working.status+' '+working.body.slice(0,180));
const stale=await rpc(jwt('authenticated',uid,old));
assert.ok(stale.status>=400,'old admin session unexpectedly authorized');
assert.match(stale.body,/SESSION_SUPERSEDED/,'old login must be refused by server, not merely JS watcher');
const missing=await rpc(jwt('authenticated',uid,null));
assert.ok(missing.status>=400,'manager JWT without session_id unexpectedly authorized');
assert.match(missing.body,/SESSION_SUPERSEDED/);
const other=await rpc(jwt('authenticated',staff,null));
assert.equal(other.status,200,'non-admin authenticated staff must not be revoked');
execFileSync('psql',['-d','postgres','-v','ON_ERROR_STOP=1','-c',
 "INSERT INTO auth.sessions(id,user_id) VALUES ('"+next+"','"+uid+"')"],
 {encoding:'utf8',stdio:'pipe',timeout:10000});
const switched=await rpc(jwt('authenticated',uid,next));
assert.equal(switched.status,200,'new login must work after auth session insertion');
const revoked=await rpc(jwt('authenticated',uid,latest));
assert.ok(revoked.status>=400,'old once-latest admin session must be rejected on next request');
assert.match(revoked.body,/SESSION_SUPERSEDED/);
const stillAnon=await rpc(null);
assert.equal(stillAnon.status,200,'new login must not disrupt shared POS');
console.log('PASS SEC-01 real HTTP: anon=200, staff=200, fresh admin=200, stale/missing denied, new login revokes previous');
