import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const edge = readFileSync("supabase/functions/hq-pending-account-provision/index.ts","utf8");
const page = readFileSync("hq_admin_account_provision.html","utf8");
const dashboard = readFileSync("hq_owner_console.js","utf8");
const index = readFileSync("index.html","utf8");

function runnable(source) {
  return source
    .replace(/^import[^\n]*\n/, "")
    .replace("(status: number, code: string)", "(status, code)")
    .replace("(u: any)", "(u)")
    .replace("(path: string, method: string, jwt: string, data?: unknown)", "(path, method, jwt, data)")
    .replace("(userId: string)", "(userId)")
    .replace("(request: Request): Promise<Response>", "(request)")
    .replace("let submitted: any;", "let submitted;");
}
const actorId="11111111-1111-4111-8111-111111111111";
const targetId="22222222-2222-4222-8222-222222222222";
const actorEmail="hq-operator@fixture.test";
const targetEmail="pending-hq@fixture.test";
const service="synthetic_server_key";
const production="https://waluhdgqhwjjwmflhrle.supabase.co";

function harness({role="HQ", actorConfirmed=true, targetConfirmed=false, targetRole="HQ"}={}) {
 let callback=null,updates=[],confirmed=targetConfirmed;
 const actor={id:actorId,email:actorEmail,email_confirmed_at:actorConfirmed?"2026-11-18T00:00:00Z":null,
  deleted_at:null,is_anonymous:false,banned_until:null};
 const adminOperator={user_id:actorId,email:actorEmail,admin_role:role,store_id:role==="HQ"?null:20};
 const adminTarget={user_id:targetId,email:targetEmail,admin_role:targetRole,store_id:targetRole==="HQ"?null:20};
 const target=()=>({id:targetId,email:targetEmail,email_confirmed_at:confirmed?"2026-11-18T00:01:00Z":null});
 const fetch=async (input,opt={})=>{
  const u=new URL(String(input));const p=u.pathname;
  const adminRequest=p.startsWith("/auth/v1/admin/users/")||p==="/rest/v1/admin_users";
  if(adminRequest)assert.equal(opt.headers.Authorization,"Bearer "+service);
  if(p==="/auth/v1/user") {
   assert.equal(opt.headers.Authorization,"Bearer token-operator");
   return Response.json(actor);
  }
  if(p==="/rest/v1/admin_users") {
    return Response.json(u.searchParams.has("user_id")?[adminOperator]:[adminTarget]);
  }
  if(p==="/auth/v1/admin/users/"+targetId) {
    if(opt.method==="PUT") {
      const payload=JSON.parse(opt.body);updates.push(payload);
      assert.equal(payload.email_confirm,true);
      confirmed=true;
    }
    return Response.json({user:target()});
  }
  throw new Error("Unexpected call "+p);
 };
 vm.runInNewContext(runnable(edge),{
  Deno:{env:{get:k=>k==="SUPABASE_URL"?production:k==="SUPABASE_SERVICE_ROLE_KEY"?service:""},
   serve:fn=>{callback=fn}},
  fetch,Response,URL,Date,console:{info(){}}
 },{filename:"hq-pending-account-provision/index.ts"});
 assert.equal(typeof callback,"function");
 const invoke=(password="Sample12345",withAuth=true)=>callback(new Request(production+"/functions/v1/hq-pending-account-provision",{
  method:"POST",
  headers:{Origin:"https://koith.github.io", ...(withAuth?{Authorization:"Bearer token-operator"}:{}),"Content-Type":"application/json"},
  body:JSON.stringify({email:targetEmail,password})
 }));
 return {invoke,updates};
}

test("one-time 11-char initial credential accepted by application boundary and provider update invoked",async()=>{
 const h=harness();
 const result=await h.invoke("Sample12345");
 assert.equal(result.status,200);
 assert.deepEqual(JSON.parse(await result.text()),{ok:true,code:"ACCOUNT_PROVISIONED"});
 assert.equal(h.updates.length,1);
 assert.equal(h.updates[0].password,"Sample12345");
});
test("cannot provision without actor token",async()=>{
 const h=harness(),r=await h.invoke("Sample12345",false);
 assert.equal(r.status,401); assert.equal(h.updates.length,0);
});
test("cannot provision from unconfirmed actor",async()=>{
 const h=harness({actorConfirmed:false}),r=await h.invoke();
 assert.equal(r.status,401); assert.equal(h.updates.length,0);
});
test("cannot provision from store manager",async()=>{
 const h=harness({role:"STORE_MANAGER"}),r=await h.invoke();
 assert.equal(r.status,403); assert.equal(h.updates.length,0);
});
test("cannot provision store manager target",async()=>{
 const h=harness({targetRole:"STORE_MANAGER"}),r=await h.invoke();
 assert.equal(r.status,403); assert.equal(h.updates.length,0);
});
test("cannot modify already confirmed HQ target",async()=>{
 const h=harness({targetConfirmed:true}),r=await h.invoke();
 assert.equal(r.status,409); assert.equal(h.updates.length,0);
});
test("rejects invalid password without mutation",async()=>{
 const h=harness(),r=await h.invoke("short1");
 assert.equal(r.status,400); assert.equal(h.updates.length,0);
});
test("UI requires HQ operator and password confirmation; never embeds service role",()=>{
 assert.match(index,/const APP_VERSION="v0\.391"/);
 assert.match(index,/hq_admin_account_provision\.html/);
 assert.match(dashboard,/hq_admin_account_provision\.html/);
 assert.match(page,/admin_context/);
 assert.match(page,/password!==repeat/);
 assert.match(page,/minlength="10"/);
 assert.match(page,/functions\/v1\/hq-pending-account-provision/);
 assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|echon174902/);
 assert.doesNotMatch(edge,/echon174902/);
 assert.match(edge,/if \(target\.email_confirmed_at\)/);
});
