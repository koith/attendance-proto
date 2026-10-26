// QA1243 temporary-owner onboarding fail-closed contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=x=>fs.readFileSync(new URL("./"+x,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261026094500_qa1243_owner_temp_first_login.sql");
const nativeSql=read("supabase/migrations/20261026115000_qa1243_native_owner_invite_after_password.sql");
const edge=read("supabase/functions/server-sync-sheet/index.ts");
const deployed=read("edge-release/supabase/functions/server-sync-sheet/index.ts");
const hq=read("hq_store_onboarding_ui.js");
const index=read("index.html");
const html=read("owner_temp_activation.html");
const js=read("owner_temp_activation.js");
const mail=read("supabase/functions/server-sync-sheet/owner_invitation_email.mjs");
const nativeMail=read("edge-release/supabase/functions/server-sync-sheet/owner_invitation_email.mjs");
assert.equal(mail,nativeMail,"branded invite email mirrors canonical Edge source");
assert.match(mail,/api\.resend\.com\/emails/);
assert.match(mail,/OWNER_INVITE_FROM_EMAIL/);
assert.match(mail,/RESEND_API_KEY/);
assert.match(mail,/Idempotency-Key/);
assert.match(mail,/최초 로그인 및 비밀번호 설정/);
assert.match(mail,/임시 비밀번호/);
assert.match(mail,/encodeURIComponent\(String\(storeId\)\)/);
assert.match(edge,/sendOwnerOnboardingEmail/);
assert.match(edge,/OWNER_INVITE_MAIL_NOT_CONFIGURED/);
assert.match(edge,/OWNER_INVITE_MAIL_STATUS_UNCERTAIN/);
assert.match(edge,/OWNER_INVITE_MAIL_REJECTED_CLEANED/);
assert.doesNotMatch(edge,/temporary_password:temporaryPassword/);

assert.equal(edge,deployed,"canonical and native Edge must be byte-identical");
new vm.Script(js,{filename:"owner_temp_activation.js"});
assert.match(html,/minlength="12"/);
assert.match(html,/src="owner_temp_activation\.js/);
assert.match(hq,/issue_store_owner_temporary_password/);
assert.doesNotMatch(hq,/showOneTimeOwnerCredential|output\?\.temporary_password|data\?\.temporary_password/);
assert.match(hq,/OWNER_INVITE_EMAIL_NOT_ACCEPTED/);
assert.match(hq,/store_owner_temp|ownerTemps/);
assert.match(index,/tempOwnerPreflight\(\)/);
assert.match(index,/owner_temp_activation\.html/);
assert.ok(!js.includes("SUPABASE_SERVICE_ROLE_KEY"));
assert.ok(!html.includes("123456789012"));
assert.match(edge,/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
assert.match(edge,/client\.auth\.admin\.createUser/);
assert.doesNotMatch(edge,/client\.auth\.admin\.updateUserById/);
assert.ok(edge.includes('delivery:"AUTH_RECOVERY_ACCEPTED"'));
assert.match(edge,/OWNER_INVITE_USE_RESEND/);
assert.match(edge,/AUTH_INVITE_ACCEPTED/);
assert.match(hq,/AUTH_INVITE_ACCEPTED/);
assert.match(edge,/dispatchInvitation\(email,storeId,actor\.userId,"HQ_OWNER"\)/);
assert.match(edge,/service_native_owner_invitation_issue/);
assert.match(edge,/delivery:"AUTH_INVITE_ACCEPTED"/);
assert.match(nativeSql,/REVOKE ALL ON FUNCTION public\.service_native_owner_invitation_issue\(bigint,uuid,uuid,text\) FROM PUBLIC,anon,authenticated/);
assert.match(nativeSql,/REVOKE ALL ON FUNCTION public\.native_owner_invitation_complete\(text\) FROM PUBLIC,anon/);
assert.match(nativeSql,/IF coalesce\(auth\.jwt\(\)->>'role',''\) <> 'service_role'/);
assert.match(nativeSql,/i\.source='native_mail_v1'/);
const issuer=nativeSql.split('CREATE OR REPLACE FUNCTION public.service_native_owner_invitation_issue(')[1]
  .split('CREATE OR REPLACE FUNCTION public.native_owner_invitation_preflight()')[0];
assert.doesNotMatch(issuer,/INSERT INTO public\.admin_users|INSERT INTO public\.store_primary_owners/);
const promoter=nativeSql.split('CREATE OR REPLACE FUNCTION public.native_owner_invitation_complete(p_new_password text)')[1];
assert.ok(promoter.indexOf("extensions.crypt(p_new_password,v_auth.encrypted_password)")<
  promoter.indexOf("INSERT INTO public.admin_users"),"native invite cannot grant admin before real Auth password proof");
assert.ok(promoter.indexOf("INSERT INTO public.admin_users")<
  promoter.indexOf("INSERT INTO public.store_primary_owners"),"native owner assignment requires role");
assert.match(read("owner_activation.js"),/native_owner_invitation_preflight/);
assert.match(read("owner_activation.js"),/native_owner_invitation_complete/);

assert.ok(edge.indexOf('Deno.env.get("OWNER_INVITE_USE_RESEND")!=="true"')<
  edge.indexOf('Deno.env.get("RESEND_API_KEY")'),"native invite must be default before optional Resend gate");
assert.ok(edge.includes("/auth/v1/recover?redirect_to="));
assert.ok(hq.includes("AUTH_RECOVERY_ACCEPTED"));
assert.ok(js.includes("recoverySession"));
assert.ok(read("owner_activation.js").includes('hash.get("type")==="recovery"'));
assert.match(edge,/service_store_owner_temp_existing_lookup/);
assert.match(edge,/verifiedExistingUserId/);
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.service_store_owner_temp_existing_lookup/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.service_store_owner_temp_existing_lookup\(bigint,text,uuid\) FROM PUBLIC,anon,authenticated/);
assert.match(sql,/IF EXISTS\(SELECT 1 FROM public\.admin_users WHERE user_id=v_uid\)/);
assert.match(edge,/if\(!verifiedExistingUserId\)/);

assert.match(edge,/email_confirm:true/);
assert.match(edge,/delivery:"EMAIL_ACCEPTED"/);
assert.match(edge,/sendOwnerOnboardingEmail/);
assert.doesNotMatch(edge,/temporary_password:temporaryPassword/);
assert.match(edge,/issue_store_owner_temporary_password/);
assert.match(edge,/service_store_owner_temp_issue/);
assert.ok(edge.indexOf('if(actor.internal||actor.adminRole!=="HQ"')<
    edge.indexOf('client.auth.admin.createUser'),"must authenticate HQ before creating user");
assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/REVOKE ALL ON TABLE public\.store_owner_temp_first_logins FROM PUBLIC, anon, authenticated/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.service_store_owner_temp_issue\(bigint,uuid,uuid\) FROM PUBLIC,anon,authenticated/);
assert.match(sql,/NEW_EMAIL_ACCOUNT_REQUIRED|ACCOUNT_ALREADY_ASSIGNED/);
assert.match(sql,/TEMP_OWNER_CREDENTIAL_EXPIRED/);
assert.match(sql,/PERSONAL_PASSWORD_NOT_VERIFIED/);
assert.match(sql,/length\(p_new_password\)<12/);
assert.match(sql,/extensions\.crypt\(p_new_password,v_auth\.encrypted_password\)/);
const complete=sql.split("CREATE OR REPLACE FUNCTION public.store_owner_temp_complete(p_new_password text)")[1].split("COMMIT;")[0];
assert.ok(complete.indexOf("v_auth.encrypted_password=v_claim.temporary_auth_hash")<
  complete.indexOf("INSERT INTO public.admin_users"),"cannot grant admin role before genuine credential change");
assert.ok(complete.indexOf("INSERT INTO public.admin_users")<
  complete.indexOf("INSERT INTO public.store_primary_owners"),"owner designation requires account role");
assert.match(sql,/expires_at\s*>\s*issued_at/);
assert.ok(!sql.includes("123456789012"));
// Client cannot access admin screen before the temp account is confirmed.
assert.match(index,/if\(firstLogin\?\.ok===true&&firstLogin\?\.password_change_required===true\)/);
// GoTrue same_password is retriable only with the scoped DB password proof.
assert.match(js,/const update=await fetch\(cfg\.url\+"\/auth\/v1\/user"/);
assert.match(js,/savedAlready=update\.status===422/);
assert.match(js,/updateResult\.code==="same_password"/);
assert.match(js,/if\(!update\.ok&&!savedAlready\)/);
assert.match(js,/await call\("\/rest\/v1\/rpc\/store_owner_temp_complete"/);
assert.match(js,/NEW_PASSWORD_LOGIN_NOT_VERIFIED/);
assert.ok(js.indexOf('store_owner_temp_complete')<
  js.indexOf('localStorage.setItem("baekeok_auth"'),"role activation must precede saving new session");

function mock({token=true,recovery=false,claimOk=true,store=301,userEmail="recipient@example.test",authId="new-user"}={}){
 const nodes={};
 for(const id of ["status","firstLoginForm","confirm","storeDescription","password","repeat"]){
  nodes[id]={textContent:"",hidden:id==="firstLoginForm",disabled:false,value:"",handlers:{},
   addEventListener(t,fn){this.handlers[t]=fn}};
 }
 nodes.password.value="VerySecurePersonal2026!";
 nodes.repeat.value="VerySecurePersonal2026!";
 const history=[];
 const saved=token?JSON.stringify({access_token:"temporary-token"}):null;
 let redirected=false;
 const context={
  document:{getElementById:id=>nodes[id]},
  localStorage:{getItem:()=>saved,setItem:()=>{history.push("SESSION_SAVED")}},
  location:{hash:recovery?"#type=recovery&access_token=verified-email-token&refresh_token=rotatable-token":"",pathname:"/owner_temp_activation.html",replace:()=>{redirected=true}},
  history:{replaceState:()=>{history.push("RECOVERY_TOKEN_STRIPPED")}},
  fetch:async(url,opts={})=>{
   if(url==="./index.html")return {ok:true,text:async()=> 'SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "pub-anon-key"'};
   if(url.endsWith("/auth/v1/user")&&opts.method==="GET")return {ok:true,json:async()=>({id:authId,email:userEmail})};
   if(url.endsWith("/rest/v1/rpc/store_owner_temp_preflight"))return {ok:true,json:async()=>({ok:claimOk,password_change_required:claimOk,store_id:store,email:"recipient@example.test",expires_at:"2027-01-01T00:00:00Z"})};
   if(url.endsWith("/auth/v1/user")&&opts.method==="PUT"){history.push("PASSWORD_UPDATED");return {ok:true,json:async()=>({})};}
   if(url.endsWith("/rest/v1/rpc/store_owner_temp_complete")){assert.equal(JSON.parse(opts.body).p_new_password,"VerySecurePersonal2026!");history.push("OWNER_ASSIGNED");return {ok:true,json:async()=>({ok:true,owner_assigned:true,store_id:store})};}
   if(url.endsWith("/auth/v1/token?grant_type=password")){history.push("LOGIN_VERIFIED");return {ok:true,json:async()=>({access_token:"personal-token",refresh_token:"fresh",user:{id:authId}})};}
   if(url.endsWith("/rest/v1/rpc/admin_context")){history.push("ROLE_VERIFIED");return {ok:true,json:async()=>({role:"STORE_MANAGER",store_id:store})};}
   throw Error("Unexpected URL "+url);
  },
  String,Number,Date,JSON,Error,URLSearchParams,
 };
 return {nodes,context,history,redirected:()=>redirected};
}
async function run(options){
 const app=mock(options);
 vm.runInNewContext(js,app.context);
 await new Promise(resolve=>setTimeout(resolve,10));
 return app;
}
{
 const app=await run();
 assert.equal(app.nodes.firstLoginForm.hidden,false,"first-login form shown only after scope preflight");
 await app.nodes.firstLoginForm.handlers.submit({preventDefault(){}});
 assert.deepEqual(app.history,["PASSWORD_UPDATED","OWNER_ASSIGNED","LOGIN_VERIFIED","ROLE_VERIFIED","SESSION_SAVED"]);
 assert.equal(app.redirected(),true);
}
{
 const app=await run({token:false});
 assert.equal(app.nodes.firstLoginForm.hidden,true);
 assert.deepEqual(app.history,[]);
}
{
 const app=await run({token:false,recovery:true});
 assert.equal(app.nodes.firstLoginForm.hidden,false,"GoTrue verified-email recovery works without old login");
 await app.nodes.firstLoginForm.handlers.submit({preventDefault(){}});
 assert.deepEqual(app.history,["RECOVERY_TOKEN_STRIPPED","PASSWORD_UPDATED","OWNER_ASSIGNED","LOGIN_VERIFIED","ROLE_VERIFIED","SESSION_SAVED"]);
 assert.equal(app.redirected(),true);
}
{
 const app=await run({claimOk:false});
 assert.equal(app.nodes.firstLoginForm.hidden,true);
 assert.deepEqual(app.history,[]);
}
{
 const app=await run({userEmail:"other@example.test"});
 assert.equal(app.nodes.firstLoginForm.hidden,true);
 assert.deepEqual(app.history,[]);
}
console.log("PASS temp first-login contract: HQ-only issuance, 32-byte random, SQL role staging, account isolation, actual client step ordering, no-token/cross-account denied");
