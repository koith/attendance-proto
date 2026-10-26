// QA1243 temporary-owner onboarding fail-closed contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=x=>fs.readFileSync(new URL("./"+x,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261026094500_qa1243_owner_temp_first_login.sql");
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
assert.doesNotMatch(hq,/showOneTimeOwnerCredential|temporary_password/);
assert.match(hq,/OWNER_INVITE_EMAIL_NOT_ACCEPTED/);
assert.match(hq,/store_owner_temp|ownerTemps/);
assert.match(index,/tempOwnerPreflight\(\)/);
assert.match(index,/owner_temp_activation\.html/);
assert.ok(!js.includes("SUPABASE_SERVICE_ROLE_KEY"));
assert.ok(!html.includes("123456789012"));
assert.match(edge,/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
assert.match(edge,/client\.auth\.admin\.createUser/);
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
assert.match(js,/await call\("\/auth\/v1\/user","PUT",\{password\}\)/);
assert.match(js,/await call\("\/rest\/v1\/rpc\/store_owner_temp_complete"/);
assert.match(js,/NEW_PASSWORD_LOGIN_NOT_VERIFIED/);
assert.ok(js.indexOf('store_owner_temp_complete')<
  js.indexOf('localStorage.setItem("baekeok_auth"'),"role activation must precede saving new session");

function mock({token=true,claimOk=true,store=301,userEmail="recipient@example.test",authId="new-user"}={}){
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
  location:{replace:()=>{redirected=true}},
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
