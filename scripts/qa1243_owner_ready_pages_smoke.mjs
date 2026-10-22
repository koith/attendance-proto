// QA1243 safe app-only Pages deploy receipt. No database, Auth or Sheet writes.
// This may publish index.html and HQ UI only when the reviewed patch is approved.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://koith.github.io/attendance-proto/';
const record='/tmp/qa1243_owner_ready_pages_before.json';
const immutable=['actual_attendance.html','owner_activation.html'];
const digest=s=>createHash('sha256').update(s).digest('hex');
async function get(name){
 const response=await fetch(base+name+'?qa1243_readback='+Date.now(),{
  redirect:'error',headers:{'cache-control':'no-cache'},
  signal:AbortSignal.timeout(20000)
 });
 assert.equal(response.status,200,'QA1243_SAFE_PAGES_ASSET_UNAVAILABLE: '+name);
 return {content:await response.text(),type:response.headers.get('content-type')||''};
}
async function currentImmutable(){
 const result={};
 for(const name of immutable)result[name]=digest((await get(name)).content);
 return result;
}
async function proveLocalPublished(){
 const localHtml=readFileSync('index.html','utf8');
 const localUi=readFileSync('hq_store_onboarding_ui.js','utf8');
 assert.match(localHtml,/const APP_VERSION="v0\.354";/);
 assert.match(localHtml,/id="appVersion"[^>]*>v0\.354<\/button>/);
 assert.match(localHtml,/hq_store_onboarding_ui\.js\?v=20261022v354/);
 assert.match(localUi,/activationBlockers\(store,proof,sampleEmployeeCount,primaryOwnerId,list\)\.length===0/);
 for(let n=0;n<18;n++){
  const [html,ui]=await Promise.all([get('index.html'),get('hq_store_onboarding_ui.js')]);
  if(digest(html.content)===digest(localHtml)&&digest(ui.content)===digest(localUi)){
   assert.match(html.type,/text\/html/);
   assert.match(ui.type,/javascript/);
   return {htmlSha256:digest(localHtml),uiSha256:digest(localUi),version:'v0.354'};
  }
  if(n!==17)await new Promise(resolve=>setTimeout(resolve,10000));
 }
 throw Error('QA1243_SAFE_PAGES_VERSIONED_ASSET_MISMATCH');
}
if(process.argv[2]==='--before'){
 const existing=await currentImmutable();
 writeFileSync(record,JSON.stringify(existing),{mode:0o600});
 console.log('QA1243_SAFE_PAGES_IMMUTABLE_BASELINE_CAPTURED '+JSON.stringify({files:immutable.length}));
}else if(process.argv[2]==='--after'){
 const before=JSON.parse(readFileSync(record,'utf8'));
 const proof=await proveLocalPublished();
 const after=await currentImmutable();
 assert.deepEqual(after,before,'Unapproved operating Pages assets changed');
 console.log('QA1243_SAFE_PAGES_V354_DEPLOYED '+JSON.stringify({
  ...proof,unchangedPublicAssets:immutable,operatingGoogleSheetWrite:false
 }));
}else if(process.argv[2]==='--independent'){
 const proof=await proveLocalPublished();
 console.log('QA1243_SAFE_PAGES_V354_INDEPENDENT_PASS '+JSON.stringify({
  ...proof,readOnlyPublicHttp:true,operatingGoogleSheetWrite:false
 }));
}else throw Error('QA1243_SAFE_PAGES_BAD_ARGUMENT');
