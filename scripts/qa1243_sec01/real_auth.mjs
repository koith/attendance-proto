// New SEC-01 evidence only: real GoTrue-issued login/refresh JWTs, no SMTP,
// owner invitations, Google, production credentials or operating database.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'qa1243_sec01');
assert.equal(process.env.PGPORT,'5432');
const AUTH='http://127.0.0.1:9999',REST='http://127.0.0.1:3001';
const secret=process.env.QA_SEC01_JWT_SECRET;
assert.ok(secret?.length>=32);
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const input=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role:'service_role',aud:'authenticated',exp:Math.floor(Date.now()/1000)+1800});
const service=input+'.'+createHmac('sha256',secret).update(input).digest('base64url');
const password='Synthetic-SEC01-Local-Password!';
const results=[];
const sql=query=>execFileSync('psql',['-XAt','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
const uuid=value=>{assert.match(value,/^[a-f0-9-]{36}$/);return value;};
const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
async function request(base,path,token,body,method='POST'){
 const r=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{
  'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>null);return {status:r.status,data};
}
async function success(p){const r=await p;assert.ok(r.status>=200&&r.status<300,'Local expected success; HTTP '+r.status);return r.data;}
const probe=token=>request(REST,'/rpc/qa_sec01_probe',token,undefined,'GET');
async function rejected(token){const r=await probe(token);assert.ok(r.status>=400);assert.equal(r.data?.message,'SESSION_SUPERSEDED');}
const login=user=>success(request(AUTH,'/token?grant_type=password',null,{email:user.email,password}));
async function account(label,admin=true){
 const email=label+'@sec01-isolated.invalid';
 const u=await success(request(AUTH,'/admin/users',service,{email,password,email_confirm:true}));uuid(u.id);
 if(admin)sql("INSERT INTO public.admin_users(user_id) VALUES('"+u.id+"')");
 return {id:u.id,email};
}
const ok=name=>{results.push({name,result:'PASS'});console.log('PASS SEC01 '+name);};
try{
 // Three local HQ-like administrators are independent users, never production HQ3.
 const admins=[];for(let i=0;i<3;i++)admins.push(await account('admin'+i));
 const a=admins[0],first=await login(a),second=await login(a);
 assert.notEqual(claims(first.access_token).session_id,claims(second.access_token).session_id);
 assert.equal(claims(second.access_token).sub,a.id);
 await success(probe(second.access_token));await rejected(first.access_token);
 ok('new real Auth login permits new device and refuses the previous JWT');
 for(const other of admins.slice(1)){const session=await login(other);await success(probe(session.access_token));}
 await success(probe(second.access_token));await success(probe(null));
 ok('three independent administrators and anonymous POS remain usable');
 const staff=await account('staff',false),staff1=await login(staff),staff2=await login(staff);
 await success(probe(staff1.access_token));await success(probe(staff2.access_token));
 ok('non-admin employee sessions are outside single-device policy');
 const refreshed=await success(request(AUTH,'/token?grant_type=refresh_token',null,{refresh_token:second.refresh_token}));
 assert.equal(claims(refreshed.access_token).session_id,claims(second.access_token).session_id);
 await success(probe(refreshed.access_token));await rejected(first.access_token);
 ok('normal current-session refresh remains authorized');
 const oldRefresh=await request(AUTH,'/token?grant_type=refresh_token',null,{refresh_token:first.refresh_token});
 if(oldRefresh.status<300){assert.equal(claims(oldRefresh.data.access_token).session_id,claims(first.access_token).session_id);await rejected(oldRefresh.data.access_token);}
 else assert.ok(oldRefresh.status>=400);
 await success(probe(refreshed.access_token));
 ok('refreshing an older Auth session cannot resurrect administrator access');
 await success(request(AUTH,'/logout?scope=local',refreshed.access_token,undefined));
 await rejected(refreshed.access_token);
 ok('logout-deleted Auth session is refused even while its JWT has not expired');
 const recovery=await login(a);await success(probe(recovery.access_token));
 await rejected(first.access_token);await success(probe(null));
 ok('new login recovers administrator access without affecting anonymous POS');
 // Roll back only the disposable fixture role config. An environment override
 // would mask this reset; assert that real HTTP behavior actually changes.
 sql("ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst,'reload config';");
 let restored=false;
 for(let i=0;i<40;i++){
  const r=await probe(first.access_token);
  if(r.status===200){restored=true;break;}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert.equal(restored,true,'Real PostgREST config rollback must restore prior behavior');
 await success(probe(null));await success(probe(staff2.access_token));
 ok('actual role reset and PostgREST reload restore prior policy, staff and POS');
 // Reactivation must be just as real and reversible, on this local DB only.
 sql("ALTER ROLE authenticator SET pgrst.db_pre_request='session_guard.require_latest_session'; NOTIFY pgrst,'reload config';");
 let enforced=false;
 for(let i=0;i<40;i++){
  const r=await probe(first.access_token);
  if(r.status>=400&&r.data?.message==='SESSION_SUPERSEDED'){enforced=true;break;}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert.equal(enforced,true);await success(probe(recovery.access_token));await success(probe(null));
 ok('controlled local reactivation again rejects old JWT and preserves current access');
}catch(error){results.push({name:'new SEC01 real-session preparation',result:'FAIL'});throw error;}
finally{
 mkdirSync('qa-results',{recursive:true});
 writeFileSync('qa-results/sec01-preactivation.json',JSON.stringify({scope:'ISOLATED_REAL_AUTH_SESSION_POSTGREST',
  commit:process.env.GITHUB_SHA||null,productionActivated:false,hostedAuthTested:false,
  priorAuthE2ERepeated:false,googleE2ERepeated:false,results},null,2));
}
