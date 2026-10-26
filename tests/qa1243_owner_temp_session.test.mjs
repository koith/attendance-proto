import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../owner_temp_activation.js',import.meta.url),'utf8');
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
function browser({failFirstPreflight=false,refreshUser='owner-1',refreshFails=false,blockStorage=false}={}) {
 const tab=new Map(),persistent=new Map();let hash='#type=recovery&access_token=callback-access&refresh_token=callback-refresh';
 let preflights=0,expiredAccess=false,revoked=false,store=80;const calls=[];
 async function load() {
  const nodes=new Map();
  const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:id==='firstLoginForm',value:'',textContent:'',disabled:false,addEventListener(){}});return nodes.get(id);};
  const fetch=async(url,options={})=>{
   calls.push({url,options});
   if(url==='./index.html')return {ok:true,text:async()=>'SUPABASE_URL: "https://test.supabase.co" SUPABASE_ANON_KEY: "public-test-key"'};
   if(url.endsWith('/auth/v1/user'))return expiredAccess?response(401,{message:'JWT expired'}):response(200,{id:'owner-1',email:'owner@example.test'});
   if(url.includes('grant_type=refresh_token')){
    assert.equal(options.headers.Authorization,undefined,'Do not forward an expired access token to refresh');
    if(refreshFails)return response(400,{message:'Refresh token invalid'});
    expiredAccess=false;
    return response(200,{access_token:'fresh-access',refresh_token:'fresh-refresh',user:{id:refreshUser}});
   }
   if(url.endsWith('/store_owner_temp_preflight')){
    if(failFirstPreflight&&++preflights===1)throw Error('temporary network outage');
    if(revoked)return response(400,{message:'NO_TEMP_OWNER_INVITATION'});
    return response(200,{ok:true,email:'owner@example.test',store_id:store,password_change_required:true,expires_at:'2099-01-01T00:00:00Z'});
   }
   throw Error('Unexpected network call');
  };
  const storage=map=>({getItem:k=>{if(blockStorage&&map===tab)throw Error('storage blocked');return map.get(k)||null;},
   setItem:(k,v)=>{if(blockStorage&&map===tab)throw Error('storage blocked');map.set(k,v);},removeItem:k=>map.delete(k)});
  await vm.runInNewContext(source,{fetch,URLSearchParams,Date,JSON,Number,String,Error,console,
   document:{getElementById:element},history:{replaceState(){hash='';}},
   location:{get hash(){return hash;},pathname:'/owner_temp_activation.html',replace(){}},
   localStorage:storage(persistent),sessionStorage:storage(tab)});
  return {form:element('firstLoginForm'),status:element('status')};
 }
 return {load,tab,persistent,calls,get hash(){return hash;},expire(){expiredAccess=true;},revoke(){revoked=true;},changeStore(){store=81;}};
}
test('reloading the consumed recovery link preserves the owner session only in this tab',async()=>{
 const b=browser();assert.equal((await b.load()).form.hidden,false);assert.equal(b.hash,'');
 assert.equal(b.persistent.size,0,'Do not replace the main app/HQ session before owner verification');
 assert.equal((await b.load()).form.hidden,false,'Reload must not discard the already redeemed recovery session');
 assert.ok(b.tab.size>0);
});
test('a transient first preflight failure does not permanently consume the recovery session',async()=>{
 const b=browser({failFirstPreflight:true});assert.equal((await b.load()).form.hidden,true);
 assert.equal((await b.load()).form.hidden,false,'Retry after network loss must retain the same recovery session');
});
test('an expired access token refreshes once and rechecks identity and claim before showing form',async()=>{
 const b=browser();await b.load();b.expire();
 assert.equal((await b.load()).form.hidden,false);
 assert.equal(b.calls.filter(x=>x.url.includes('grant_type=refresh_token')).length,1);
 const saved=JSON.parse([...b.tab.values()][0]);
 assert.equal(saved.session.refresh_token,'fresh-refresh');assert.equal(saved.owner.user_id,'owner-1');
 assert.equal(b.persistent.size,0);
});
test('refreshing into another identity cannot resume the original owner claim',async()=>{
 const b=browser({refreshUser:'different-owner'});await b.load();b.expire();
 assert.equal((await b.load()).form.hidden,true);assert.equal(b.tab.size,0);
});
test('a changed store claim cannot reuse a cached owner activation',async()=>{
 const b=browser();await b.load();b.changeStore();
 assert.equal((await b.load()).form.hidden,true);assert.equal(b.tab.size,0);
});
test('revoked claim clears the tab session and does not display activation form',async()=>{
 const b=browser();await b.load();b.revoke();
 assert.equal((await b.load()).form.hidden,true);assert.equal(b.tab.size,0);
});
test('expired pending state is discarded without using the saved tokens',async()=>{
 const b=browser();await b.load();const key=[...b.tab.keys()][0],entry=JSON.parse(b.tab.get(key));
 entry.deadline=Date.now()-1;b.tab.set(key,JSON.stringify(entry));
 const initial=b.calls.length;assert.equal((await b.load()).form.hidden,true);
 assert.equal(b.calls.length,initial);assert.equal(b.tab.size,0);
});
test('a revoked refresh token fails once without authentication or role escalation',async()=>{
 const b=browser({refreshFails:true});await b.load();b.expire();
 assert.equal((await b.load()).form.hidden,true);assert.equal(b.tab.size,0);
 assert.equal(b.calls.filter(x=>x.url.includes('grant_type=refresh_token')).length,1);
 assert.ok(!b.calls.some(x=>x.url.includes('store_owner_temp_complete')));
});
test('blocked session storage does not prevent the current authenticated page from working',async()=>{
 const b=browser({blockStorage:true});assert.equal((await b.load()).form.hidden,false);
 assert.equal(b.persistent.size,0);
});
