// New proof: actual SMTP -> GoTrue JWT -> PostgREST -> shipped role migrations.
// This never calls Hosted Supabase or Google; existing Google proof is reused.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const AUTH='http://127.0.0.1:9999', REST='http://127.0.0.1:3001', MAIL='http://127.0.0.1:8025';
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'qa1243_gotrue');
assert.equal(process.env.PGPORT,'5432');
const secret=process.env.QA_JWT_SECRET;assert.ok(secret?.length>=32);
const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const input=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({role:'service_role',aud:'authenticated',exp:Math.floor(Date.now()/1000)+1800});
const service=input+'.'+createHmac('sha256',secret).update(input).digest('base64url');
const results=[],approvedOwnerOpening=[];
const pass='Synthetic-Only-Password-1243!';
const sql=query=>execFileSync('psql',['-XAt','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const uuid=id=>{assert.match(id,/^[a-f0-9-]{36}$/);return id;};
async function http(base,path,token,body,method='POST'){
 const r=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=null}
 return {status:r.status,data,location:r.headers.get('location')||''};
}
const rpc=(name,args,token)=>http(REST,'/rpc/'+name,token,args);
async function success(p){const r=await p;assert.ok(r.status>=200&&r.status<300,'HTTP '+r.status+' '+(r.data?.message||''));return r.data;}
async function denied(p,message){const r=await p;assert.ok(r.status>=400,'Expected RPC rejection');assert.equal(r.data?.message,message);}
const ok=name=>{results.push({name,result:'PASS'});console.log('PASS '+name);};
async function inboxIds(){return new Set((await (await fetch(MAIL+'/api/v1/messages')).json()).messages.map(x=>x.ID));}
async function redeem(email,seen){
 for(let i=0;i<40;i++){
  const list=await (await fetch(MAIL+'/api/v1/messages')).json();
  const m=list.messages.find(m=>!seen.has(m.ID)&&m.To.some(t=>t.Address===email));
  if(m){
   const detail=await (await fetch(MAIL+'/api/v1/message/'+m.ID)).json();
   const urls=[...(String(detail.HTML)+' '+String(detail.Text)).replaceAll('&amp;','&').matchAll(/https?:\/\/[^\s"'<>]+/g)].map(x=>new URL(x[0]));
   const url=urls.find(x=>x.pathname==='/verify');assert.ok(url);assert.equal(url.origin,AUTH);
   const r=await http(AUTH,url.pathname+url.search,null,undefined,'GET');
   assert.ok([302,303].includes(r.status));const params=new URLSearchParams(r.location.split('#')[1]);
   const token=params.get('access_token');assert.ok(token);
   const user=await success(http(AUTH,'/user',token,undefined,'GET'));assert.equal(user.email,email);
   return {token,id:user.id,email};
  }
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('ISOLATED_SMTP_RECEIPT_TIMEOUT');
}
async function invite(email,store,mode,actor){
 const pre=await success(rpc('service_store_invitation_dispatch_preflight',{p_store_id:store,p_email:email,p_actor_id:actor,p_mode:mode},service));
 assert.equal(pre.delivery,'INVITE');const seen=await inboxIds();
 const user=await success(http(AUTH,'/invite',service,{email}));uuid(user.id);
 await success(rpc(mode==='HQ_OWNER'?'service_store_manager_attach_invited_user':'service_store_delegated_manager_attach_invited_user',
  {p_store_id:store,p_user_id:user.id,p_actor_id:actor},service));
 return redeem(email,seen);
}
async function activate(person,role,store){
 const pre=await success(rpc('store_invitation_activation_preflight',{},person.token));
 assert.equal(pre.intended_role,role);assert.equal(pre.store_id,store);
 await success(http(AUTH,'/user',person.token,{password:pass},'PUT'));
 const accepted=await success(rpc('store_primary_owner_accept_invitation',{},person.token));
 assert.equal(accepted.owner_assigned,role==='OWNER');
 const login=await success(http(AUTH,'/token?grant_type=password',null,{email:person.email,password:pass}));
 assert.equal(login.user.id,person.id);person.token=login.access_token;
}
function protectedSnapshot(){return sql(`SELECT jsonb_build_object(
 'stores',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.stores s WHERE id=1),
 'employees',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.employees e WHERE store_id=1),
 'hq',(SELECT jsonb_agg(to_jsonb(a) ORDER BY user_id) FROM public.admin_users a WHERE admin_role='HQ'),
 'beta',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.employees e WHERE store_id=702),
 'payroll',(SELECT jsonb_agg(to_jsonb(p) ORDER BY store_id) FROM public.payroll_snapshot p))::text`);}
try{
 // Create exactly three real local Auth HQ identities, then bind local fixture roles.
 const hqs=[];for(let i=0;i<3;i++){
  const email=`hq${i}@journey1243.invalid`;
  const u=await success(http(AUTH,'/admin/users',service,{email,password:pass,email_confirm:true}));uuid(u.id);hqs.push(u);
  sql(`INSERT INTO public.admin_users(user_id,email,admin_role) VALUES('${u.id}','${email}','HQ')`);
 }
 const hq=hqs[0];const hqSession=await success(http(AUTH,'/token?grant_type=password',null,{email:hq.email,password:pass}));
 const before=protectedSnapshot();
 await denied(rpc('hq_store_onboarding_set',{p_store_id:701,p_status:'READY'},hqSession.access_token),'CONFIRMED_STORE_MANAGER_REQUIRED');
 const owner=await invite('owner@journey1243.invalid',701,'HQ_OWNER',hq.id);
 await denied(rpc('hq_store_onboarding_set',{p_store_id:701,p_status:'READY'},hqSession.access_token),'CONFIRMED_PRIMARY_OWNER_REQUIRED');
 await activate(owner,'OWNER',701);ok('Actual SMTP, owner acceptance, password and login JWT');
 assert.equal(sql('SELECT onboarding_status FROM public.stores WHERE id=701'),'STAGED');
 await success(rpc('hq_store_onboarding_set',{p_store_id:701,p_status:'READY'},hqSession.access_token));
 ok('HQ READY requires accepted password-ready primary owner');
 await denied(rpc('hq_store_onboarding_set',{p_store_id:702,p_status:'READY'},owner.token),'NOT_AUTHORIZED');
 await denied(rpc('store_limited_employee_list',{p_store_id:702},owner.token),'NOT_AUTHORIZED');
 ok('Owner JWT cannot activate or read another branch');
 const assistant=await invite('assistant@journey1243.invalid',701,'STORE_ASSISTANT',owner.id);
 await activate(assistant,'ASSISTANT',701);ok('Actual SMTP assistant acceptance, password and login JWT');
 await denied(rpc('store_limited_employee_list',{p_store_id:701},assistant.token),'NOT_AUTHORIZED');
 await success(rpc('store_delegated_permissions_set',{p_store_id:701,p_user_id:assistant.id,p_staff_edit:true,p_attendance_approve:false,p_payroll_view:false},owner.token));
 const staff=await success(rpc('store_limited_employee_list',{p_store_id:701},assistant.token));assert.deepEqual(staff.map(e=>e.id),[70101]);
 await denied(rpc('store_limited_employee_update',{p_store_id:701,p_employee_id:70201,p_name:'Forbidden',p_memo:''},assistant.token),'EMPLOYEE_NOT_FOUND');
 await denied(rpc('store_limited_payroll_read',{p_store_id:701,p_ym:'2026-10'},assistant.token),'NOT_AUTHORIZED');
 await denied(rpc('store_limited_pending_requests',{p_store_id:701},assistant.token),'NOT_AUTHORIZED');
 await success(rpc('store_delegated_permissions_set',{p_store_id:701,p_user_id:assistant.id,p_staff_edit:true,p_attendance_approve:true,p_payroll_view:true},owner.token));
 const payroll=await success(rpc('store_limited_payroll_read',{p_store_id:701,p_ym:'2026-10'},assistant.token));assert.deepEqual(payroll.map(p=>p.gross_pay),[45000]);
 assert.deepEqual(await success(rpc('store_limited_pending_requests',{p_store_id:701},assistant.token)),[]);
 await denied(rpc('store_limited_payroll_read',{p_store_id:702,p_ym:'2026-10'},assistant.token),'NOT_AUTHORIZED');
 await success(rpc('store_delegated_permissions_set',{p_store_id:701,p_user_id:assistant.id,p_staff_edit:false,p_attendance_approve:false,p_payroll_view:false},owner.token));
 await denied(rpc('store_limited_employee_list',{p_store_id:701},assistant.token),'NOT_AUTHORIZED');
 await denied(rpc('store_limited_payroll_read',{p_store_id:701,p_ym:'2026-10'},assistant.token),'NOT_AUTHORIZED');
 ok('Same assistant JWT observes immediate grant/revoke and cross-branch denial');
 await success(rpc('store_delegated_manager_change',{p_store_id:701,p_email:null,p_user_id:assistant.id,p_action:'REVOKE'},owner.token));
 await success(http(AUTH,'/user',assistant.token,undefined,'GET'));
 await denied(rpc('store_invitation_activation_preflight',{},assistant.token),'INVITATION_CANCELLED_OR_NOT_FOUND');
 await denied(rpc('store_limited_employee_list',{p_store_id:701},assistant.token),'NOT_AUTHORIZED');
 await denied(rpc('store_limited_payroll_read',{p_store_id:701,p_ym:'2026-10'},assistant.token),'NOT_AUTHORIZED');
 ok('Revoked unexpired real Auth JWT still authenticates but loses RPC access');
 await denied(rpc('service_store_invitation_dispatch_preflight',{p_store_id:701,p_email:assistant.email,p_actor_id:hq.id,p_mode:'HQ_ASSISTANT'},service),'USE_EXISTING_VERIFIED_ACCOUNT');
 await success(rpc('hq_store_existing_verified_account_connect',{p_email:assistant.email,p_store_id:701,p_intended_role:'ASSISTANT'},hqSession.access_token));
 const permissions=await success(rpc('store_delegated_permissions_self',{},assistant.token));
 assert.equal(permissions.staff_edit,false);assert.equal(permissions.payroll_view,false);assert.equal(permissions.attendance_approve,false);
 await denied(rpc('store_limited_employee_list',{p_store_id:701},assistant.token),'NOT_AUTHORIZED');
 ok('Verified existing account reconnect resets all delegated permissions');
 const after=protectedSnapshot();assert.equal(after,before);ok('Protected branch, HQ3, staff10, Beta and payroll rows unchanged');
 // Exercise the NEW canonical invitation contracts with actual SMTP,
 // GoTrue password hashing/login and PostgREST-verified recipient JWTs.
 const newEmail='approved-native@journey1243.invalid';
 await success(rpc('service_store_owner_opening_preflight',{p_store_id:703,p_actor_id:hq.id},service));
 const nativeSeen=await inboxIds();
 const invited=await success(http(AUTH,'/invite',service,{email:newEmail}));uuid(invited.id);
 await success(rpc('service_native_owner_invitation_issue_for_opening',{
  p_store_id:703,p_user_id:invited.id,p_actor_id:hq.id,p_email:newEmail,p_auto_open_after_accept:true},service));
 const native=await redeem(newEmail,nativeSeen);
 const nativePre=await success(rpc('native_owner_invitation_preflight',{},native.token));
 assert.equal(nativePre.store_id,703);assert.equal(nativePre.auto_open_after_accept,true);
 assert.equal(sql('SELECT is_active FROM public.stores WHERE id=703'),'f');
 await denied(rpc('native_owner_invitation_complete',{p_new_password:pass},native.token),'PERSONAL_PASSWORD_NOT_VERIFIED');
 await success(http(AUTH,'/user',native.token,{password:pass},'PUT'));
 const nativeDone=await success(rpc('native_owner_invitation_complete',{p_new_password:pass},native.token));
 assert.equal(nativeDone.store_opened,true);assert.equal(nativeDone.owner_assigned,true);
 const nativeLogin=await success(http(AUTH,'/token?grant_type=password',null,{email:newEmail,password:pass}));
 const nativeContext=await success(rpc('admin_context',{},nativeLogin.access_token));
 assert.equal(nativeContext.role,'STORE_MANAGER');assert.equal(nativeContext.store_id,703);
 assert.equal(await success(rpc('can_manage_store',{p_store_id:1},nativeLogin.access_token)),false);
 assert.equal((await success(rpc('native_owner_invitation_complete',{p_new_password:pass},nativeLogin.access_token))).already_completed,true);
 approvedOwnerOpening.push({name:'native-mail-password-login-atomic-ready',result:'PASS'});
 console.log('PASS new approved native SMTP/password/login/READY without second HQ action');
 const recoveryEmail='approved-existing@journey1243.invalid',initial='Initial-personal-1243!';
 const existing=await success(http(AUTH,'/admin/users',service,{email:recoveryEmail,password:initial,email_confirm:true}));uuid(existing.id);
 // Match the production test precondition: this identity previously completed
 // owner setup, then HQ explicitly revoked it and returned its store to STAGED.
 const formerPassword='Previous-owner-personal-1243!';
 const firstSession=await success(http(AUTH,'/token?grant_type=password',null,{email:recoveryEmail,password:initial}));
 await success(rpc('service_store_owner_temp_issue_for_opening',{
  p_store_id:704,p_user_id:existing.id,p_actor_id:hq.id,p_auto_open_after_accept:true},service));
 await success(http(AUTH,'/user',firstSession.access_token,{password:formerPassword},'PUT'));
 assert.equal((await success(rpc('store_owner_temp_complete',{p_new_password:formerPassword},firstSession.access_token))).store_opened,true);
 sql(`BEGIN; UPDATE public.stores SET onboarding_status='STAGED',is_active=false WHERE id=704;
 DELETE FROM public.store_primary_owners WHERE user_id='${uuid(existing.id)}' AND store_id=704;
 DELETE FROM public.store_admin_memberships WHERE user_id='${uuid(existing.id)}' AND store_id=704;
 DELETE FROM public.store_delegated_permissions WHERE user_id='${uuid(existing.id)}' AND store_id=704;
 DELETE FROM public.admin_users WHERE user_id='${uuid(existing.id)}' AND store_id=704;
 DELETE FROM auth.refresh_tokens WHERE user_id='${uuid(existing.id)}';
 DELETE FROM auth.sessions WHERE user_id='${uuid(existing.id)}'; COMMIT;`);
 assert.equal((await success(rpc('admin_context',{},firstSession.access_token))).role,null);
 assert.equal(await success(rpc('can_manage_store',{p_store_id:704},firstSession.access_token)),false);
 await denied(rpc('service_store_invitation_dispatch_preflight',{
  p_store_id:704,p_email:recoveryEmail,p_actor_id:hq.id,p_mode:'HQ_OWNER'},service),'USE_EXISTING_VERIFIED_ACCOUNT');
 const sameOwner=await success(rpc('service_store_owner_temp_existing_lookup',{
  p_store_id:704,p_email:recoveryEmail,p_actor_id:hq.id},service));
 assert.equal(sameOwner.user_id,existing.id);
 await success(rpc('service_store_owner_temp_issue_for_opening',{
  p_store_id:704,p_user_id:existing.id,p_actor_id:hq.id,p_auto_open_after_accept:true},service));
 const claimBefore=sql("SELECT jsonb_build_object('expiry',expires_at,'approved',auto_open_after_accept)::text FROM public.store_owner_temp_first_logins WHERE store_id=704");
 const recoveryPre=await success(rpc('service_store_owner_invitation_resend_preflight',{
  p_store_id:704,p_email:recoveryEmail,p_actor_id:hq.id},service));
 assert.equal(recoveryPre.delivery,'RECOVERY');assert.equal(recoveryPre.auto_open_after_accept,true);
 assert.equal(sql("SELECT jsonb_build_object('expiry',expires_at,'approved',auto_open_after_accept)::text FROM public.store_owner_temp_first_logins WHERE store_id=704"),claimBefore);
 const recoverySeen=await inboxIds();await success(http(AUTH,'/recover',null,{email:recoveryEmail}));
 const recovered=await redeem(recoveryEmail,recoverySeen);assert.equal(recovered.id,existing.id);
 await success(rpc('store_owner_temp_preflight',{},recovered.token));
 await denied(rpc('store_owner_temp_complete',{p_new_password:formerPassword},recovered.token),'PERSONAL_PASSWORD_NOT_VERIFIED');
 await success(http(AUTH,'/user',recovered.token,{password:pass},'PUT'));
 const recoveredDone=await success(rpc('store_owner_temp_complete',{p_new_password:pass},recovered.token));
 assert.equal(recoveredDone.store_opened,true);assert.equal(recoveredDone.store_id,704);
 const recoveredLogin=await success(http(AUTH,'/token?grant_type=password',null,{email:recoveryEmail,password:pass}));
 assert.equal(recoveredLogin.user.id,existing.id);
 const recoveredContext=await success(rpc('admin_context',{},recoveredLogin.access_token));
 assert.equal(recoveredContext.store_id,704);assert.equal(recoveredContext.role,'STORE_MANAGER');
 assert.equal(await success(rpc('can_manage_store',{p_store_id:703},recoveredLogin.access_token)),false);
 assert.equal((await success(rpc('store_owner_temp_complete',{p_new_password:pass},recoveredLogin.access_token))).already_completed,true);
 approvedOwnerOpening.push({name:'existing-mail-password-login-atomic-ready',result:'PASS'});
 console.log('PASS former owner revoked and STAGED: same UID recovery SMTP/new password/login/READY and response replay');
 // Cancellation must not force deletion/recreation of an unconfirmed Auth user.
 const cancelEmail='cancel-unconfirmed@journey1243.invalid';
 const originalInvite=await success(http(AUTH,'/invite',service,{email:cancelEmail}));uuid(originalInvite.id);
 await success(rpc('service_native_owner_invitation_issue_for_opening',{
  p_store_id:705,p_user_id:originalInvite.id,p_actor_id:hq.id,p_email:cancelEmail,p_auto_open_after_accept:true},service));
 await success(rpc('hq_store_owner_invitation_cancel',{p_store_id:705,p_user_id:originalInvite.id},hqSession.access_token));
 assert.equal(sql(`SELECT count(*) FROM auth.users WHERE id='${uuid(originalInvite.id)}'`),'1');
 const retryGate=await success(rpc('service_store_invitation_dispatch_preflight',{
  p_store_id:705,p_email:cancelEmail,p_actor_id:hq.id,p_mode:'HQ_OWNER'},service));
 assert.equal(retryGate.delivery,'INVITE');assert.equal(retryGate.user_id,originalInvite.id);
 await success(rpc('service_native_owner_invitation_issue_for_opening',{
  p_store_id:705,p_user_id:originalInvite.id,p_actor_id:hq.id,p_email:cancelEmail,p_auto_open_after_accept:true},service));
 const retrySeen=await inboxIds(),reinvited=await success(http(AUTH,'/invite',service,{email:cancelEmail}));
 assert.equal(reinvited.id,originalInvite.id);
 const retryPerson=await redeem(cancelEmail,retrySeen);assert.equal(retryPerson.id,originalInvite.id);
 await success(rpc('native_owner_invitation_preflight',{},retryPerson.token));
 await success(http(AUTH,'/user',retryPerson.token,{password:pass},'PUT'));
 assert.equal((await success(rpc('native_owner_invitation_complete',{p_new_password:pass},retryPerson.token))).store_opened,true);
 const retryLogin=await success(http(AUTH,'/token?grant_type=password',null,{email:cancelEmail,password:pass}));
 assert.equal((await success(rpc('admin_context',{},retryLogin.access_token))).store_id,705);
 approvedOwnerOpening.push({name:'cancel-reinvite-same-uid-atomic-ready',result:'PASS'});
 console.log('PASS canceled unconfirmed owner: new invite preserves original UID and opens only after personal password');
 const noPasswordEmail='confirmed-passwordless@journey1243.invalid';
 const passwordless=await success(http(AUTH,'/admin/users',service,{email:noPasswordEmail,email_confirm:true}));uuid(passwordless.id);
 // GoTrue admin create auto-generates a hash even when password is omitted.
 // Model a pre-existing provider-only/passwordless identity in THIS isolated DB;
 // all following recovery email, password save, login JWT and RPC calls are real.
 sql(`UPDATE auth.users SET encrypted_password=NULL WHERE id='${uuid(passwordless.id)}'`);
 assert.equal(sql(`SELECT encrypted_password IS NULL FROM auth.users WHERE id='${uuid(passwordless.id)}'`),'t');
 const passwordlessGate=await success(rpc('service_store_invitation_dispatch_preflight',{
  p_store_id:706,p_email:noPasswordEmail,p_actor_id:hq.id,p_mode:'HQ_OWNER'},service));
 assert.equal(passwordlessGate.delivery,'RECOVERY');assert.equal(passwordlessGate.user_id,passwordless.id);
 await success(rpc('service_native_owner_invitation_issue_for_opening',{
  p_store_id:706,p_user_id:passwordless.id,p_actor_id:hq.id,p_email:noPasswordEmail,p_auto_open_after_accept:true},service));
 const noPasswordSeen=await inboxIds();await success(http(AUTH,'/recover',null,{email:noPasswordEmail}));
 const noPasswordPerson=await redeem(noPasswordEmail,noPasswordSeen);
 await success(rpc('native_owner_invitation_preflight',{},noPasswordPerson.token));
 await success(http(AUTH,'/user',noPasswordPerson.token,{password:pass},'PUT'));
 assert.equal((await success(rpc('native_owner_invitation_complete',{p_new_password:pass},noPasswordPerson.token))).store_opened,true);
 const noPasswordLogin=await success(http(AUTH,'/token?grant_type=password',null,{email:noPasswordEmail,password:pass}));
 assert.equal(noPasswordLogin.user.id,passwordless.id);
 assert.equal((await success(rpc('admin_context',{},noPasswordLogin.access_token))).store_id,706);
 approvedOwnerOpening.push({name:'confirmed-passwordless-recovery-atomic-ready',result:'PASS'});
 console.log('PASS confirmed passwordless owner: recovery mail/native claim/new password/login/READY');
 assert.equal(protectedSnapshot(),before,'approved opening must preserve the protected branch/HQ/other staff/payroll');
} catch(e){results.push({name:'journey',result:'FAIL',error:String(e.message)});throw e;}
finally{mkdirSync('qa-results',{recursive:true});writeFileSync('qa-results/auth-role-journey-1243.json',JSON.stringify({scope:'ISOLATED_REAL_AUTH_SMTP_POSTGREST',commit:process.env.GITHUB_SHA||null,hostedAuthTested:false,googleE2ERepeated:false,approvedOwnerOpening,results},null,2));}
