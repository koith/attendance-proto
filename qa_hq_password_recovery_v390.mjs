import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const owner=readFileSync("owner_activation.js","utf8");
const hq=readFileSync("hq_password_setup.html","utf8");
const entry=readFileSync("owner_activation.html","utf8");
assert.match(entry,/owner_activation\.js\?v=20261118hq390/);
const index=readFileSync("index.html","utf8");

assert.equal((index.match(/const APP_VERSION="(v\d+\.\d+)"/)||[])[1],"v0.391");
assert.match(index,/href="\.\/hq_password_setup\.html" rel="noopener noreferrer"/);
assert.match(owner,/sessionStorage\.setItem\("baekeok_hq_account_recovery_v1"/);
assert.match(owner,/scope\?\.role!=="HQ"\|\|scope\.store_id!==null/);
assert.match(owner,/location\.replace\("\.\/hq_password_setup\.html"\)/);
assert.match(owner,/owner_temp_activation\.html/,"owner recovery stays intact");
assert.match(hq,/\/auth\/v1\/recover\?redirect_to=/);
assert.match(hq,/https:\/\/koith\.github\.io\/attendance-proto\/owner_activation\.html/);
assert.match(hq,/\/auth\/v1\/user","PUT",\{password:pass\}/);
assert.match(hq,/\/auth\/v1\/token\?grant_type=password/);
assert.match(hq,/await checkHq\(login\.access_token\)/);
assert.match(hq,/login\?\.user\?\.id!==active\.id/);
assert.match(hq,/pass\.length<12\|\|pass\.length>128\|\|pass!==repeat/);
assert.doesNotMatch(hq,/\$2[aby]\$|service_role|echon174902/);
assert.doesNotMatch(owner,/\$2[aby]\$|echon174902/);

const script=hq.match(/<script>([\s\S]+?)<\/script>/)?.[1];
assert.ok(script,"hq activation script");
new Function(script);new Function(owner);

// The extracted real route helper must match an authenticated, confirmed HQ
// context, never merely an arbitrary recovery token or another store role.
const begin=owner.indexOf("async function routeConfirmedHqRecovery(");
const end=owner.indexOf("// Official one-click recovery:",begin);
assert.ok(begin>0&&end>begin,"real owner recovery helper");
const helper=owner.slice(begin,end);
async function testContext(role){
 const storage=new Map();let target=null,contextReads=0,userReads=0;
 const fakeIndex='SUPABASE_URL: "https://waluhdgqhwjjwmflhrle.supabase.co" SUPABASE_ANON_KEY: "test-public-key"';
 const fetch=async (url,options={})=>{
  if(url==="./index.html")return {ok:true,text:async()=>fakeIndex};
  if(url.endsWith("/rest/v1/rpc/admin_context")){
   contextReads++;assert.match(options.headers.Authorization,/^Bearer test-access$/);
   return {ok:true,json:async()=>({role,store_id:role==="HQ"?null:290,email:"owner@example.test"})};
  }
  if(url.endsWith("/auth/v1/user")){
   userReads++;return {ok:true,json:async()=>({id:"test-id",email:"owner@example.test"})};
  }
  throw Error("UNEXPECTED_FETCH "+url);
 };
 const sessionStorage={setItem(k,v){storage.set(k,JSON.parse(v))}};
 const location={replace(path){target=path}};
 const make=new Function("fetch","sessionStorage","location",helper+"\nreturn routeConfirmedHqRecovery;");
 const fn=make(fetch,sessionStorage,location);
 const res=await fn("test-access","test-refresh");
 return {res,storage,target,contextReads,userReads};
}
const h=await testContext("HQ");
assert.equal(h.res,true);assert.equal(h.target,"./hq_password_setup.html");
assert.equal(h.contextReads,1);assert.equal(h.userReads,1);
assert.equal(h.storage.get("baekeok_hq_account_recovery_v1").user_id,"test-id");
assert.equal(h.storage.get("baekeok_hq_account_recovery_v1").session.refresh_token,"test-refresh");
const store=await testContext("STORE_MANAGER");
assert.equal(store.res,false);assert.equal(store.userReads,0);
assert.equal(store.storage.size,0);assert.equal(store.target,null);
const noRole=await testContext(null);
assert.equal(noRole.res,false);assert.equal(noRole.storage.size,0);

console.log("PASS verified HQ-only email recovery routing + password/login contract, owner path preserved");
