// Independent public Pages check, no Google OAuth tokens or operating data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const base='https://koith.github.io/attendance-proto/';
const guard='/tmp/qa1243_pages_before.json';
const digest=s=>createHash('sha256').update(s).digest('hex');
const request=async(url)=>{
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'text/html,text/javascript,text/css'}});
 return {status:response.status,mime:response.headers.get('content-type')||'',body:await response.text()};
};
const existing=['index.html','actual_attendance.html','owner_activation.html'];
async function baseline(){
 const values={};
 for(const name of existing){
  const r=await request(base+name);
  assert.equal(r.status,200,'Existing production Pages asset must be reachable: '+name);
  values[name]=digest(r.body);
 }
 return values;
}
async function prove(){
 const prior=JSON.parse(readFileSync(guard,'utf8'));
 let html;
 for(let attempt=0;attempt<18;attempt++){
  const r=await request(base+'qa1243-safari/index.html');
  if(r.status===200 && /^text\/html/i.test(r.mime) && r.body.includes('QA1243 · iPhone 인증')){
   html=r.body;break;
  }
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert.ok(html,'QA1234_SAFARI_STATIC_HTML_NOT_PUBLISHED');
 assert.match(html,/http-equiv="Content-Security-Policy"/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/script-src 'self'/);
 assert.doesNotMatch(html,/unsafe-inline|QA1243_NONCE|QA1243_SCOPE_LIST/);
 assert.match(html,/https:\/\/github\.com\/koith\/attendance-proto\/settings\/secrets\/actions\/new/);
 assert.match(html,/webuielf@gmail\.com/);
 const js=await request(base+'qa1243-safari/oauth.js');
 assert.equal(js.status,200);assert.match(js.mime,/javascript/i);
 assert.match(js.body,/QA1243_IFRAMED_OAUTH_BLOCKED/);
 assert.match(js.body,/google\.accounts\.oauth2\.initTokenClient/);
 assert.match(js.body,/navigator\.clipboard\.writeText\(token\)/);
 assert.doesNotMatch(js.body,/api\.github\.com|localStorage|sessionStorage/);
 const css=await request(base+'qa1243-safari/style.css');
 assert.equal(css.status,200);assert.match(css.mime,/css/i);
 assert.ok(css.body.length>100);
 const current=await baseline();
 for(const name of existing)
  assert.equal(current[name],prior[name],'QA-only Pages deploy changed operating asset '+name);
 console.log('QA1243_SAFARI_PAGES_REAL_PASS '+JSON.stringify({
  get:200,html:true,assets:3,cspMeta:true,oauthOwner:'webuielf@gmail.com',
  operatingAssetSha256Unchanged:true,checkedExistingAssets:existing.length,
  googleTokenProvided:false,operatingSheetWrite:false
 }));
}
if(process.argv[2]==='--before'){
 writeFileSync(guard,JSON.stringify(await baseline()),{encoding:'utf8',mode:0o600});
 console.log('QA1243_PAGES_EXISTING_ASSET_BASELINE_CAPTURED '+JSON.stringify({checkedAssets:existing.length}));
}else if(process.argv[2]==='--after')await prove();
else throw Error('QA1243_PAGES_SMOKE_ARGUMENT_REQUIRED');