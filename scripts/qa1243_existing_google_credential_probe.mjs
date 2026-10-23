import {QA1243_RUNNER_SCOPES,assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';

// QA-only capability probe: does not access Scripts, Sheets, Drive files or write data.
// No tokens, secret contents, or API response bodies are printed.
const names=['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN'];
if(names.some(name=>!process.env[name]))throw Error('QA1243_EXISTING_OAUTH_CREDENTIALS_ABSENT');

async function checked(url,options={}){
 let response;
 try{response=await fetch(url,{...options,signal:AbortSignal.timeout(15000),redirect:'error'});}
 catch{throw Error('QA1243_EXISTING_OAUTH_NETWORK_FAILURE');}
 if(!response.ok)throw Error('QA1243_EXISTING_OAUTH_HTTP_'+response.status);
 try{return await response.json();}
 catch{throw Error('QA1243_EXISTING_OAUTH_INVALID_JSON');}
}
const refreshed=await checked('https://oauth2.googleapis.com/token',{
 method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({
  client_id:process.env.GOOGLE_OAUTH_CLIENT_ID,
  client_secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  refresh_token:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  grant_type:'refresh_token'
 })
});
if(typeof refreshed.access_token!=='string'||!refreshed.access_token)
 throw Error('QA1243_EXISTING_OAUTH_NO_ACCESS_TOKEN');
const identity=await checked('https://www.googleapis.com/oauth2/v3/userinfo',{
 headers:{Authorization:'Bearer '+refreshed.access_token}
});
if(identity.email_verified!==true||String(identity.email||'').toLowerCase()!=='webuielf@gmail.com')
 throw Error('QA1243_EXISTING_OAUTH_WRONG_OWNER');
const info=await checked('https://www.googleapis.com/oauth2/v2/tokeninfo',{
 method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({access_token:refreshed.access_token})
});
try{assertQa1243RunnerScopes(info.scope);}
catch{
 const scopes=new Set(String(info.scope||'').split(/\s+/).filter(Boolean));
 const missing=QA1243_RUNNER_SCOPES.filter(scope=>!scopes.has(scope));
 const allowed=new Set([...QA1243_RUNNER_SCOPES,'openid','email','profile']);
 const extra=[...scopes].filter(scope=>!allowed.has(scope));
 console.log('QA1243_EXISTING_OAUTH_MISSING_SCOPE_COUNT='+missing.length);
 console.log('QA1243_EXISTING_OAUTH_EXTRA_SCOPE_COUNT='+extra.length);
 throw Error('QA1243_EXISTING_OAUTH_SCOPES_INCOMPATIBLE');
}
console.log('QA1243_EXISTING_OAUTH_READ_ONLY_PROBE_PASS: OWNER_AND_FIVE_EXACT_SCOPES');
