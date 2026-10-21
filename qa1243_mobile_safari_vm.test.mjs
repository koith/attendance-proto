import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {QA1243_RUNNER_SCOPES} from './scripts/qa1243_oauth_scopes.mjs';

const source=readFileSync('supabase/functions/qa1243-mobile-auth/index.ts','utf8');
const start=source.indexOf('const page=\x60');
const end=source.indexOf('\nfunction pageResponse(',start);
assert.ok(start>=0&&end>start,'Must parse actual shipped Safari HTML source');
const pageOnly=source.slice(start,end);
const context={crypto:webcrypto};
vm.runInNewContext(pageOnly+'\nthis.shown=page;',context);
const html=String(context.shown)
 .replaceAll('QA1243_NONCE','TESTONLY_CSP_NONCE')
 .replace('QA1243_SCOPE_LIST',JSON.stringify(QA1243_RUNNER_SCOPES));
assert.match(html,/<meta name="referrer" content="no-referrer">/);
assert.match(html,/https:\/\/github.com\/koith\/attendance-proto\/settings\/secrets\/actions\/new/);
assert.match(html,/QA1243_GOOGLE_OAUTH_ACCESS_TOKEN/);
assert.ok(!html.includes('QA1243_SCOPE_LIST'));
const inline=html.match(/<script nonce="TESTONLY_CSP_NONCE">\s*([\s\S]*?)<\/script><\/body>/);
assert.ok(inline,'Source must contain inline script with CSP nonce');

function runBrowser({profileEmail='webuielf@gmail.com',extraScope='',expired=false}={}){
 const events={};
 const nodes=Object.fromEntries(['login','copy','client','status'].map(id=>[id,{
  value:id==='client'?'123456789-qa1243test.apps.googleusercontent.com':'',
  disabled:id==='copy',textContent:'',
  addEventListener(kind,cb){events[id+':'+kind]=cb;}
 }]));
 const calls=[],copied=[];
 let callback;
 const google={accounts:{oauth2:{
  initTokenClient(opts){
   assert.equal(opts.login_hint,'webuielf@gmail.com');
   assert.equal(opts.scope,QA1243_RUNNER_SCOPES.join(' '));
   callback=opts.callback;
   return{requestAccessToken(options){assert.equal(options.prompt,'consent');}};
  },
  hasGrantedAllScopes(_response,...scopes){return scopes.length===5;}
 }}};
 const now=Date.now();
 const fakeDate={now:()=>now+(expired?11*60*1000:1000)};
 const browser={
  document:{getElementById(id){return nodes[id]}},
  window:{google},google,
  Date:fakeDate,
  navigator:{clipboard:{async writeText(t){copied.push(t);}}},
  fetch:async(url,options)=>{
   calls.push({url,headers:options.headers});
   assert.equal(url,'https://www.googleapis.com/oauth2/v3/userinfo');
   assert.ok(options.headers.Authorization.startsWith('Bearer '));
   return{ok:true,json:async()=>({email:profileEmail,email_verified:true})};
  },
  Set,Error,String,Number
 };
 vm.runInNewContext(inline[1],browser);
 return{nodes,events,calls,copied,get callback(){return callback}};
}
const ok=runBrowser();
ok.events['login:click']();
assert.equal(typeof ok.callback,'function');
await ok.callback({access_token:'FAKE_GOOGLE_ACCESS_TOKEN_FOR_TEST_ONLY',
 scope:QA1243_RUNNER_SCOPES.join(' '),expires_in:3500});
assert.equal(ok.nodes.copy.disabled,false);
assert.equal(ok.calls.length,1);
await ok.events['copy:click']();
assert.equal(ok.copied.length,1);
assert.equal(ok.copied[0],'FAKE_GOOGLE_ACCESS_TOKEN_FOR_TEST_ONLY');
assert.equal(ok.nodes.copy.disabled,true);
await ok.events['copy:click']();
assert.equal(ok.copied.length,1,'One page may copy only once');
const wrong=runBrowser({profileEmail:'dokodemoitsho@gmail.com'});
wrong.events['login:click']();
await wrong.callback({access_token:'FAKE_ONLY',scope:QA1243_RUNNER_SCOPES.join(' '),expires_in:3500});
assert.equal(wrong.nodes.copy.disabled,true,'Never copy operating Google account token');
const broad=runBrowser({extraScope:'https://www.googleapis.com/auth/drive'});
broad.events['login:click']();
await broad.callback({access_token:'FAKE_ONLY',
 scope:QA1243_RUNNER_SCOPES.join(' ')+' https://www.googleapis.com/auth/drive',expires_in:3500});
assert.equal(broad.nodes.copy.disabled,true,'Reject overprivileged Google scopes');
const old=runBrowser({expired:true});
old.events['login:click']();
assert.equal(old.nodes.login.disabled,true,'Expire local session after ten minutes');
assert.equal(typeof old.callback,'undefined','Expired session cannot call Google popup');
assert.doesNotMatch(source,/api\.github\.com|github_pat_|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(source,/localStorage|sessionStorage|Deno\.env/);
assert.match(source,/if\(req\.method!=='GET'\)/);
assert.match(source,/QA1243_QUERY_NOT_ALLOWED/);
console.log('PASS QA1243 Safari DOM VM: exact Google scopes, QA-only account, no extra Drive, 10-minute session, one-time copy, no privileged server');
