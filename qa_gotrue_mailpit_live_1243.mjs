// #1243: REAL GoTrue HTTP/Auth + Mailpit SMTP sandbox (GitHub-hosted disposable containers).
// No Supabase production URL/key and no real email recipient; all addresses use .invalid.
// The app's SQL/RPC cancellation gate is exercised separately, not emulated as Auth revocation.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const ROOT=process.env.QA_GOTRUE_URL||'http://127.0.0.1:9999';
const MAIL=process.env.QA_MAILPIT_URL||'http://127.0.0.1:8025';
const SECRET=process.env.QA_JWT_SECRET;
assert.ok(SECRET?.length>=32,'Sandbox JWT secret must be present and ephemeral');
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const payload={role:'service_role',aud:'authenticated',iss:ROOT,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+1800};
const str=b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload);
const adminToken=str+'.'+createHmac('sha256',SECRET).update(str).digest('base64url');
let testResults=[];
async function request(path,method='GET',data=null,token=null){
 const res=await fetch(ROOT+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===null?undefined:JSON.stringify(data)});
 const raw=await res.text();let obj;try{obj=JSON.parse(raw)}catch{obj={raw:raw.slice(0,250)}}
 return {status:res.status,headers:res.headers,body:obj};
}
async function messages(){
 const res=await fetch(MAIL+'/api/v1/messages');assert.equal(res.status,200,'Mailpit must be reachable');
 const data=await res.json();return data.messages||data.Messages||[];
}
async function mailFor(addr,seen=new Set()){
 for(let attempt=0;attempt<36;attempt++){
  const msg=(await messages()).find(m=>{
    const tos=m.To||m.to||[];
    return !seen.has(m.ID||m.id)&&tos.some(t=>String(t.Address||t.address||t).toLowerCase()===addr);
  });
  if(msg){const id=msg.ID||msg.id;const r=await fetch(MAIL+'/api/v1/message/'+encodeURIComponent(id));
   assert.equal(r.status,200);const mail=await r.json();return {id,mail};
  }
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 throw Error('SMTP_MAIL_NOT_RECEIVED_FOR_'+addr);
}
function actionUrl(m){
 const html=String(m.HTML||m.Html||m.html||'');
 const plain=String(m.Text||m.text||'');
 const src=(html+' '+plain).replaceAll('&amp;','&');
 const candidates=[...src.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(x=>x[0].replace(/[).,]+$/g,''));
 const link=candidates.find(s=>s.includes('/verify?')&&(s.includes('token=')||s.includes('token_hash=')));
 assert.ok(link,'Expected actual Auth verify hyperlink in SMTP inbox');
 return new URL(link);
}
async function redeem(m,expectType){
 const link=actionUrl(m),typ=link.searchParams.get('type');
 assert.equal(typ,expectType,'Email action must be of expected type');
 // The SMTP link may reference hostname exposed in a container, but only localhost is contacted.
 const p=link.pathname+link.search;assert.equal(link.pathname,'/verify','Direct GoTrue sandbox links only');
 const res=await request(p);
 assert.ok([302,303].includes(res.status),'Real Auth verification redirect expected, got '+res.status+': '+JSON.stringify(res.body));
 const location=res.headers.get('location')||'';
 const fragment=(location.split('#')[1]||'');const params=new URLSearchParams(fragment);
 const access=params.get('access_token');assert.ok(access,'Real GoTrue session access token required after '+expectType);
 const user=await request('/user','GET',null,access);assert.equal(user.status,200,'Auth /user must accept live token');
 return {access, user:user.body, redirect:location};
}
const ok=(name,extra={})=>{testResults.push({name,result:'PASS',...extra});console.log('PASS #1243 '+name)};
const fresh='new@qa1243.invalid',old='existing@qa1243.invalid',cancelled='cancelled@qa1243.invalid';
const pass='LongSyntheticTestPassword-1243!';
const startMail=new Set((await messages()).map(m=>m.ID||m.id));
let r=await request('/health');assert.equal(r.status,200);ok('GoTrue server /health');
r=await request('/admin/users','GET',null,adminToken);assert.equal(r.status,200,'Service role admin HTTP API must be operational: '+JSON.stringify(r.body));ok('Admin JWT authenticated');
r=await request('/invite','POST',{email:fresh},adminToken);assert.ok([200,201].includes(r.status),'Invitation failed '+r.status+': '+JSON.stringify(r.body));const freshId=r.body.id||r.body.user?.id;assert.ok(freshId);ok('New identity Auth /invite accepted');
const first=await mailFor(fresh,startMail);const a=await redeem(first.mail,'invite');assert.equal(a.user.email,fresh);ok('SMTP invite delivered, link redeemed, real Auth user session');
r=await request('/user','PUT',{password:pass},a.access);assert.equal(r.status,200,'Invitation password update '+r.status+': '+JSON.stringify(r.body));r=await request('/token?grant_type=password','POST',{email:fresh,password:pass});assert.equal(r.status,200,'Login with set password must succeed');assert.ok(r.body.access_token);ok('Invite password set and password login');

r=await request('/signup','POST',{email:old,password:pass});assert.ok([200,201].includes(r.status),'Sign-up failed '+r.status+': '+JSON.stringify(r.body));const signupMail=await mailFor(old,startMail);const b=await redeem(signupMail.mail,'signup');assert.equal(b.user.email,old);ok('Real email signup confirmation via SMTP, session');
r=await request('/token?grant_type=password','POST',{email:old,password:pass});assert.equal(r.status,200,'Verified existing account must log in');ok('Existing verified account login');
r=await request('/invite','POST',{email:old},adminToken);assert.ok(r.status>=400,'GoTrue should reject re-invite of existing verified account');ok('Existing confirmed account re-invite rejected by GoTrue',{httpStatus:r.status});
const before=(await messages()).map(x=>x.ID||x.id);r=await request('/recover','POST',{email:old});assert.ok([200,204].includes(r.status),'Password recovery delivery '+r.status+': '+JSON.stringify(r.body));
const recMail=await mailFor(old,new Set(before));const c=await redeem(recMail.mail,'recovery');assert.equal(c.user.email,old);ok('Existing verified-account recovery SMTP + URL + Auth session');
const changed='RecoveredSyntheticPassword-1243!';
r=await request('/user','PUT',{password:changed},c.access);assert.equal(r.status,200);
r=await request('/token?grant_type=password','POST',{email:old,password:changed});assert.equal(r.status,200);ok('Recovered password login');

const seenCancel=new Set((await messages()).map(x=>x.ID||x.id));r=await request('/invite','POST',{email:cancelled},adminToken);assert.ok([200,201].includes(r.status),'Cancel target invite failed');
const doomed=r.body.id||r.body.user?.id;assert.ok(doomed);
const doomedMail=await mailFor(cancelled,seenCancel);
r=await request('/admin/users/'+encodeURIComponent(doomed),'DELETE',null,adminToken);assert.ok([200,204].includes(r.status),'Sandbox invite recipient deletion failed '+r.status);
const link=actionUrl(doomedMail.mail);
r=await request(link.pathname+link.search);assert.ok(r.status>=400||[302,303].includes(r.status)&&!(r.headers.get('location')||'').includes('access_token='),'Deleted invite must not mint a working Auth session');ok('Deleted sandbox invitation cannot yield valid session');
r=await request('/invite','POST',{email:cancelled},adminToken);assert.ok([200,201].includes(r.status),'Re-invite after deleted account failed');ok('Cancelled/deleted account fresh re-invite');

const bad=actionUrl(doomedMail.mail);bad.searchParams.set('token','invalid-expired-synthetic-1243');
bad.searchParams.set('token_hash','invalid-expired-synthetic-1243');
r=await request(bad.pathname+bad.search);assert.ok(r.status>=400||[302,303].includes(r.status)&&!(r.headers.get('location')||'').includes('access_token='),'Invalid/expired-like token must not mint session');ok('Invalid/expired-like Auth verification token denied');
// Real timed expiration: the official GoTrue mailer is configured for 60-second OTP lifetime.
// Wait on an actual, never-used invite link rather than substituting a tampered token.
const expAddr='actualexpiry@qa1243.invalid';
const beforeExpiry=new Set((await messages()).map(x=>x.ID||x.id));
r=await request('/invite','POST',{email:expAddr},adminToken);
assert.ok([200,201].includes(r.status),'Real expiring invite not delivered');
const expMail=await mailFor(expAddr,beforeExpiry);
const realLink=actionUrl(expMail.mail);
assert.equal(realLink.searchParams.get('type'),'invite');
await new Promise(resolve=>setTimeout(resolve,70000));
r=await request(realLink.pathname+realLink.search);
const location=r.headers.get('location')||'';
assert.ok(r.status>=400||([302,303].includes(r.status)&&!location.includes('access_token=')),
  'Expired 60-second GoTrue invite must not mint a live session: HTTP '+r.status);
ok('Real 60-second invite link expired and rejected',{expirySeconds:60,waitSeconds:70});
console.log('QA1243_GOTRUE_MAILPIT_RESULTS '+JSON.stringify({scope:'SELF_HOSTED_GOTRUE_REAL_HTTP_MAILPIT_REAL_SMTP',count:testResults.length,results:testResults,productionAuthNotTested:true,actualExpiryClockNotTested:false,appAuthorizationRevocationNotTested:true}));
