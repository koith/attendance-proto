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
  if(u.includes("/store_owner_temp_preflight"))
   return reply(200,{ok:true,email:"owner@example.test",store_id:80,
    password_change_required:true,expires_at:"2099-01-01T00:00:00Z"});
  if(u.endsWith("/auth/v1/user")&&method==="PUT"){
   changes++;
   if(mode==="unrelated-error")return reply(422,{code:"weak_password",message:"bad password"});
   if(mode==="network-loss"&&changes===1)throw Error("network disconnected after save");
   if(mode==="already-saved"||(mode==="network-loss"&&changes>1))
    return reply(422,{code:"same_password",message:"The new password should differ"});
   return reply(200,{id:"user-1"});
  }
  if(u.includes("/store_owner_temp_complete")){
   completed++;
   assert.equal(JSON.parse(options.body).p_new_password,"valid-new-password-123");
   return reply(200,{ok:true,owner_assigned:true,store_id:80});
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
 if(mode==="network-loss"){
  assert.equal(completed,0,"Do not claim ownership after a lost password update");
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
  assert.equal(completed,1);
  assert.equal(logins,1);
  assert.equal(savedSession.access_token,"new-token");
  assert.match(redirect,/store=80/);
  assert.match(element("status").textContent,/본사 승인/);
 }
 return {changes,completed,calls};
}
test("normal first-login password change preserves server-side verification",async()=>{
 assert.equal((await scenario("normal")).changes,1);
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
