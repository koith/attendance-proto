import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('./owner_session_recovery.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'recovery client script present');
new vm.Script(script,{filename:'owner_session_recovery.html'});
for(const forbidden of ['SUPABASE_SERVICE_ROLE_KEY','auth/v1/admin/users','encrypted_password','password: "123456789012"']){
 assert.ok(!html.includes(forbidden),'no privileged reset path or hardcoded user password');
}
assert.match(html,/minlength="12"/);
assert.match(html,/no-referrer/);

function setup({refresh='saved-refresh',email='owner@example.test',role='STORE_MANAGER',store=80}={}){
 const ids={};
 for(const id of ['email','status','recover','change','sessionBtn','changeBtn','password','repeat']){
  ids[id]={id,value:'',hidden:id==='change',disabled:false,handlers:{},
   addEventListener(type,listener){this.handlers[type]=listener}};
 }
 ids.email.value=email;
 ids.password.value='123456789012';
 ids.repeat.value='123456789012';
 const session=refresh?{refresh_token:refresh,access_token:'old-access'}:null;
 let saved=session?JSON.stringify(session):null;
 let puts=0,logins=0,requestCount=0;
 const storage={getItem(){return saved},setItem(k,v){assert.equal(k,'baekeok_auth');saved=v}};
 const api=async (url,opts={})=>{
  requestCount++;
  if(url==='./index.html')return {ok:true,text:async()=> 'SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-key"'};
  if(url.endsWith('/auth/v1/token?grant_type=refresh_token')){
   assert.equal(JSON.parse(opts.body).refresh_token,refresh);
   return {ok:true,json:async()=>({access_token:'new-access',refresh_token:'new-refresh'})};
  }
  if(url.endsWith('/auth/v1/user')&&opts.method==='GET')
   return {ok:true,json:async()=>({email:'owner@example.test',id:'same-account'})};
  if(url.endsWith('/rest/v1/rpc/admin_context'))
   return {ok:true,json:async()=>({role,store_id:store})};
  if(url.endsWith('/auth/v1/user')&&opts.method==='PUT'){
   puts++;
   assert.equal(opts.headers.Authorization,'Bearer new-access');
   assert.equal(JSON.parse(opts.body).password,'123456789012');
   return {ok:true,json:async()=>({email:'owner@example.test'})};
  }
  if(url.endsWith('/auth/v1/token?grant_type=password')){
   logins++;
   assert.equal(JSON.parse(opts.body).email,'owner@example.test');
   return {ok:true,json:async()=>({access_token:'password-access',refresh_token:'password-refresh',user:{id:'same-account'}})};
  }
  throw Error('UNEXPECTED_TEST_REQUEST: '+url);
 };
 vm.runInNewContext(script,{document:{getElementById(id){return ids[id]}},localStorage:storage,fetch:api,JSON,Error,Number,String},{timeout:1000});
 const submit=async id=>ids[id].handlers.submit({preventDefault(){}});
 return {ids,submit,stored:()=>saved,puts:()=>puts,logins:()=>logins,requestCount:()=>requestCount};
}

// Complete self-owned owner session recovery; signed-in context is the sole authority.
{
 const app=setup();await app.submit('recover');
 assert.equal(app.ids.change.hidden,false);
 assert.equal(app.puts(),0);
 await app.submit('change');
 assert.equal(app.puts(),1);
 assert.equal(app.logins(),1);
 assert.match(app.ids.status.textContent,/모두 완료/);
 assert.equal(JSON.parse(app.stored()).access_token,'password-access');
 assert.equal(app.ids.password.value,'');
}
// Missing stored refresh cannot initiate password change.
{
 const app=setup({refresh:''});await app.submit('recover');
 assert.equal(app.puts(),0);assert.equal(app.requestCount(),0);
 assert.match(app.ids.status.textContent,/세션이 없습니다/);
}
// An existing session for another email does not permit password modification.
{
 const app=setup({email:'other@example.test'});await app.submit('recover');await app.submit('change');
 assert.equal(app.puts(),0);assert.match(app.ids.status.textContent,/다른 계정/);
}
// Valid user outside the owner store is denied even if Auth session refresh succeeds.
{
 const app=setup({role:'HQ'});await app.submit('recover');await app.submit('change');
 assert.equal(app.puts(),0);assert.match(app.ids.status.textContent,/1호점 관리자 권한/);
}
{
 const app=setup({store:1});await app.submit('recover');await app.submit('change');
 assert.equal(app.puts(),0);
}
console.log('PASS owner session recovery: syntax/no privilege, successful 2-stage Auth login, no session, wrong email, wrong role/store');
