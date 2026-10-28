// QA1243 synthetic browser regression: no live Auth, email or operational DB writes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";

const script=readFileSync(new URL("../owner_temp_activation.js",import.meta.url),"utf8");
const reply=(status,body)=>({ok:status>=200&&status<300,status,
  json:async()=>body,text:async()=>String(body)});

async function scenario(mode) {
 let submit=null,redirect=null,completed=0,changes=0,logins=0;
 const fields=new Map();
 const element=id=>{
  if(!fields.has(id))fields.set(id,{value:"",textContent:"",hidden:false,disabled:false,
   addEventListener:(event,handler)=>{if(id==="firstLoginForm"&&event==="submit")submit=handler;}});
  return fields.get(id);
 };
 element("password").value="valid-new-password-123";
 element("repeat").value="valid-new-password-123";
 const calls=[];
 const fetch=async(url,options={})=>{
  const u=String(url),method=options.method||"GET";
  calls.push(method+" "+u);
  if(u==="./index.html")return {ok:true,text:async()=>(
   'SUPABASE_URL: "https://test.supabase.co" SUPABASE_ANON_KEY: "public-test-key"')};
  if(u.endsWith("/auth/v1/user")&&method==="GET")
   return reply(200,{id:"user-1",email:"owner@example.test"});
  if(u.includes("/store_owner_temp_preflight")&&mode==="native-recovery")return reply(403,{message:"NO_TEMP_OWNER_INVITATION"});
  if(u.includes("/native_owner_invitation_preflight"))return reply(200,{ok:true,intended_role:"OWNER",password_change_required:true,store_id:80,expires_at:"2099-01-01T00:00:00Z"});
  if(u.includes("/store_owner_temp_preflight"))
   return reply(200,{ok:true,email:"owner@example.test",store_id:80,
    password_change_required:true,expires_at:"2099-01-01T00:00:00Z"});
  if(u.endsWith("/auth/v1/user")&&method==="PUT"){
   changes++;
   if(mode==="same-current-password"&&changes===1)
    return reply(422,{code:422,error_code:"same_password",msg:"New password should be different from the old password."});
   if(mode==="unrelated-error")return reply(422,{code:"weak_password",message:"bad password"});
   if(mode==="network-loss"&&changes===1)throw Error("network disconnected after save");
   if(mode==="already-saved"||(mode==="network-loss"&&changes>1))
    return reply(422,{code:"same_password",message:"The new password should differ"});
   return reply(200,{id:"user-1"});
  }
  if(u.includes("/store_owner_temp_complete")||u.includes("/native_owner_invitation_complete")){
   completed++;
   assert.ok(["valid-new-password-123","another-new-password-456"].includes(JSON.parse(options.body).p_new_password));
   if(mode==="same-current-password"&&changes===1)return reply(400,{code:"P0001",message:"PERSONAL_PASSWORD_NOT_VERIFIED"});
   if(mode==="completion-loss"&&completed===1)throw Error("completion response lost after commit");
   return reply(200,{ok:true,owner_assigned:true,store_id:80,store_opened:mode==="completion-loss"||mode==="native-recovery",already_completed:mode==="completion-loss"});
  }
  if(u.includes("/auth/v1/token?grant_type=password")){
   logins++;
   return reply(200,{access_token:"new-token",refresh_token:"new-refresh",user:{id:"user-1"}});
  }
  if(u.includes("/admin_context"))return reply(200,{role:"STORE_MANAGER",store_id:80});
  throw Error("Unexpected request: "+method+" "+u);
 };
 let savedSession=null;
 const context={fetch,URLSearchParams,Date,JSON,Number,String,Error,console,
  document:{getElementById:element},
  history:{replaceState(){}},
  location:{pathname:"/owner_temp_activation.html",
   hash:"#type=recovery&access_token=old-token&refresh_token=old-refresh",
   replace(url){redirect=url;}},
  localStorage:{getItem:()=>null,setItem(_key,value){savedSession=JSON.parse(value);}}
 };
 await vm.runInNewContext(script,context,{filename:"owner_temp_activation.js"});
 assert.equal(typeof submit,"function","The signed-in owner should see the password form");
 const event={preventDefault(){}};
 await submit(event);
 if(mode==="same-current-password"){
  assert.equal(logins,0);assert.equal(redirect,null);
  assert.match(element("status").textContent,/다른 새 비밀번호.*12자/);
  assert.doesNotMatch(element("status").textContent,/PERSONAL_PASSWORD_NOT_VERIFIED|완료됐을 수/);
  assert.equal(element("confirm").disabled,false);
  element("password").value="another-new-password-456";
  element("repeat").value="another-new-password-456";
  await submit(event);
 }
 if(mode==="network-loss"||mode==="completion-loss"){
  assert.equal(completed,mode==="completion-loss"?1:0,"Do not claim ownership after a lost password update");
  element("password").value="valid-new-password-123";
  element("repeat").value="valid-new-password-123";
  await submit(event);
 }
 if(mode==="unrelated-error"){
  assert.equal(completed,0,"Do not elevate after another GoTrue error");
  assert.equal(logins,0);
  assert.equal(redirect,null);
  assert.match(element("status").textContent,/처리 실패/);
 } else {
  assert.equal(completed,["completion-loss","same-current-password"].includes(mode)?2:1);
  assert.equal(logins,1);
  assert.equal(savedSession.access_token,"new-token");
  assert.match(redirect,/store=80/);
  assert.match(element("status").textContent,(mode==="completion-loss"||mode==="native-recovery")?/대표 관리자 등록과 지점 개통이 완료/:/본사 승인/);
 }
 return {changes,completed,calls};
}
test("normal first-login password change preserves server-side verification",async()=>{
 assert.equal((await scenario("normal")).changes,1);
});
test("Hosted numeric same_password + unchanged hash explains the old password and permits a new one without another invitation",async()=>{
 const result=await scenario("same-current-password");
 assert.equal(result.changes,2);assert.equal(result.completed,2);
 assert.ok(!result.calls.some(x=>x.includes("/recover")||x.includes("/invite")));
});
test("422/same_password retry resumes and verifies ownership",async()=>{
 assert.equal((await scenario("already-saved")).changes,1);
});
test("lost PUT response followed by 422 resumes without premature promotion",async()=>{
 assert.equal((await scenario("network-loss")).changes,2);
});
test("unrelated GoTrue 422 never promotes owner",async()=>{
 assert.equal((await scenario("unrelated-error")).changes,1);
});

test("a lost committed owner completion retries without a new invitation or role grant",async()=>{
 assert.equal((await scenario("completion-loss")).completed,2);
});

test("confirmed passwordless recovery uses only its verified native claim and native completion",async()=>{
 const result=await scenario("native-recovery");
 assert.ok(result.calls.some(c=>c.includes("native_owner_invitation_complete")));
 assert.ok(!result.calls.some(c=>c.includes("store_owner_temp_complete")));
});
