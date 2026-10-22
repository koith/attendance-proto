// #1243 LIVE service-to-service test. Runs ONLY from trusted main's QA workflow.
// Real Google Apps Script API deployment + real production Edge OIDC +
// standalone Apps Script Web App + real Google Sheets API. No production DB DML,
// no existing Apps Script deployment or its shared secret is read/changed.
import {readFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {QA1243_RUNNER_SCOPES,assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';
import {QA1243_MIN_TOKEN_LIFETIME_SECONDS} from './qa1243_mobile_token_contract.mjs';
import assert from 'node:assert/strict';
import {buildQa1243GAS,buildQa1243Manifest,QA1243_SCRIPT_SCOPES,
 selectQa1243OwnedExistingScript,QA1243_EXISTING_SCRIPT_TITLE} from './qa1243_build_isolated_gas.mjs';

const projectRef='waluhdgqhwjjwmflhrle';
const audience=`https://${projectRef}.supabase.co/functions/v1/server-sync-sheet`;
const projectName='QA1243 isolated Edge GAS '+new Date().toISOString().slice(0,16);
const marker='QA1243_'+randomBytes(6).toString('hex').toUpperCase();
const storeA='QA1243_SBX_'+randomBytes(6).toString('hex').toUpperCase();
const storeB='QA1243_SBX_'+randomBytes(6).toString('hex').toUpperCase();
const secret=randomBytes(64).toString('hex');
// Mobile Safari issues a short-lived Google Access Token. Existing Windows
// Desktop OAuth refresh-token route remains intact and is preferred if complete.
// Never send a Google access token in an URL/query or log it.
const mobileAccess=String(process.env.QA1243_GOOGLE_OAUTH_ACCESS_TOKEN||'').trim();
const desktopReady=['QA1243_GOOGLE_OAUTH_CLIENT_ID','QA1243_GOOGLE_OAUTH_CLIENT_SECRET',
 'QA1243_GOOGLE_OAUTH_REFRESH_TOKEN'].every(key=>Boolean(process.env[key]));
const required=desktopReady?['QA1243_GOOGLE_OAUTH_CLIENT_ID','QA1243_GOOGLE_OAUTH_CLIENT_SECRET',
 'QA1243_GOOGLE_OAUTH_REFRESH_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL',
 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']:mobileAccess?
 ['ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN']:
 ['QA1243_GOOGLE_OAUTH_REFRESH_TOKEN_OR_MOBILE_ACCESS_TOKEN'];
for(const key of required)if(!process.env[key])
 throw Error('REQUIRED_QA_CREDENTIAL_MISSING: '+key);
async function jsonRequest(url,options={},assertOk=true){
 const res=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(60000)});
 const raw=await res.text();let value;try{value=JSON.parse(raw)}catch{value={unexpectedNonJson:true}};
 if(assertOk&&!res.ok){
  // Google API error messages can echo authorization data or script source.
  // Report only bounded HTTP path and a strict enumerated status code;
  // neither raw error.message nor provider-generated free text is logged.
  const endpoint=new URL(url);
  const providerStatus=String(value?.error?.status||'UNKNOWN');
  const safeStatus=/^[A-Z][A-Z0-9_]{0,63}$/.test(providerStatus)
   ? providerStatus : 'REDACTED_UNTRUSTED_STATUS';
  throw Error('REMOTE_HTTP_'+res.status+' for '+endpoint.hostname+' '+
    endpoint.pathname.split('/').slice(0,3).join('/')+' [type='+safeStatus+']');

 }
 return {status:res.status,ok:res.ok,value};
}
let oauth;
if(desktopReady){
 const token=await jsonRequest('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:process.env.QA1243_GOOGLE_OAUTH_CLIENT_ID,
  client_secret:process.env.QA1243_GOOGLE_OAUTH_CLIENT_SECRET,
  refresh_token:process.env.QA1243_GOOGLE_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'})
 });
 oauth=token.value.access_token;
 console.log('QA1243_GOOGLE_AUTH_ROUTE_DESKTOP_REFRESH');
}else{
 oauth=mobileAccess;
 console.log('QA1243_GOOGLE_AUTH_ROUTE_MOBILE_EPHEMERAL');
}
assert.ok(oauth,'Google OAuth access token required');
const headers={Authorization:'Bearer '+oauth,'content-type':'application/json'};

const EXPECTED_QA_OWNER='webuielf@gmail.com';
const who=(await jsonRequest('https://www.googleapis.com/oauth2/v3/userinfo',{
 headers:{Authorization:'Bearer '+oauth}
})).value;
if(String(who.email||'').trim().toLowerCase()!==EXPECTED_QA_OWNER ||
   who.email_verified!==true)
  throw Error('QA1243_GOOGLE_OWNER_MISMATCH_STOP_BEFORE_SCRIPT_API');
console.log('QA1243_OAUTH_OWNER_VERIFIED '+JSON.stringify({email:EXPECTED_QA_OWNER}));

// Official Google OAuth tokeninfo supports POST; never pass bearer tokens in
// URL parameters (browser history, proxies and request metadata can expose them).
const granted=(await jsonRequest('https://www.googleapis.com/oauth2/v2/tokeninfo',{
 method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({access_token:oauth})
})).value;
if(!desktopReady &&
   (!Number.isFinite(Number(granted.expires_in)) ||
    Number(granted.expires_in)<QA1243_MIN_TOKEN_LIFETIME_SECONDS))
 throw Error('QA1243_MOBILE_TOKEN_EXPIRY_TOO_SHORT');
const actualScopes=new Set(String(granted.scope||'').split(/\s+/).filter(Boolean));
assertQa1243RunnerScopes(actualScopes);
assert.equal(QA1243_RUNNER_SCOPES.length,5);
console.log('QA1243_RUNNER_OAUTH_SCOPE_VERIFIED '+JSON.stringify({
 scopeNames:[...actualScopes].sort(),noDriveWrite:true,noSheetsWrite:true,noExternalRequest:true
}));
// Independently recheck user-reported access denial using this actual QA token.
// This is read-only metadata probing. A newly shared operating file blocks QA.
for(const [kind,id] of [
 ['operatingWorkbook','1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024'],
 ['legacyOwnerQaScript','1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw']
]){
 const res=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+
  '?fields=id',{headers:{Authorization:'Bearer '+oauth},redirect:'error',signal:AbortSignal.timeout(30000)});
 const inaccessible=res.status===403||res.status===404;
 console.log('QA1243_OPERATING_FILE_DENY_PROBE '+JSON.stringify({kind,http:res.status,inaccessible}));
 if(!inaccessible)throw Error('QA1243_OPERATING_ASSET_ACCESS_NOT_DENIED');
}

async function verifyQaScriptOwner(id){
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+
  '?fields=id%2Cname%2CmimeType%2Cowners(emailAddress)%2Ctrashed';
 const doc=(await jsonRequest(url,{headers:{Authorization:'Bearer '+oauth}})).value;
 if(doc.id!==id || doc.mimeType!=='application/vnd.google-apps.script' ||
    doc.trashed===true ||
    !doc.owners?.some(o=>String(o.emailAddress||'').toLowerCase()===EXPECTED_QA_OWNER))
    throw Error('QA1243_SCRIPT_OWNER_NOT_QA_ACCOUNT');
 console.log('QA1243_REMOTE_SCRIPT_OWNER_VERIFIED '+JSON.stringify({scriptId:id,owner:EXPECTED_QA_OWNER}));
}
function assertRemoteSource(remote,code,manifest){
 const byName=Object.fromEntries((remote.files||[]).map(f=>[f.name,f.source]));
 if(Object.keys(byName).sort().join(',')!=='Code,appsscript' ||
    byName.Code!==code || byName.appsscript!==manifest)
    throw Error('QA1243_REMOTE_SOURCE_OR_SCOPE_MISMATCH');
 return createHash('sha256').update(code+'\n'+manifest).digest('hex');
}

const api='https://script.googleapis.com/v1/projects';
// Prior QA script is owned by the operating owner and is NOT reusable.
const knownQaProject=String(process.env.QA1243_GAS_SCRIPT_ID||'').trim();
if(knownQaProject==='1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw')
 throw Error('QA1243_LEGACY_OPERATING_OWNER_SCRIPT_FORBIDDEN');
// An independent QA owner already created a project. Never create another
// project if the optional Actions variable has not been entered. Discover it
// through the verified QA OAuth identity using metadata-only Drive pagination.
async function discoverExistingQaProject(){
 const results=[];let pageToken='';
 for(let page=0;page<10;page++){
  const q="name = '"+QA1243_EXISTING_SCRIPT_TITLE.replace(/'/g,"\\'")+
   "' and mimeType = 'application/vnd.google-apps.script' and trashed = false";
  const params=new URLSearchParams({q,spaces:'drive',pageSize:'100',
   fields:'nextPageToken,files(id,name,mimeType,trashed,owners(emailAddress))'});
  if(pageToken)params.set('pageToken',pageToken);
  const response=(await jsonRequest('https://www.googleapis.com/drive/v3/files?'+params,{
   headers:{Authorization:'Bearer '+oauth}})).value;
  if(!Array.isArray(response.files))throw Error('QA1243_SCRIPT_DISCOVERY_INVALID_RESPONSE');
  results.push(...response.files);
  if(!response.nextPageToken){
   const id=selectQa1243OwnedExistingScript(results);
   console.log('QA1243_GAS_SCRIPT_AUTODISCOVERED '+JSON.stringify({
    scriptId:id,owner:EXPECTED_QA_OWNER,uniqueMatch:true,noGitHubVariableRequired:true
   }));
   return id;
  }
  pageToken=response.nextPageToken;
 }
 throw Error('QA1243_SCRIPT_DISCOVERY_PAGINATION_LIMIT');
}
const scriptId=knownQaProject||await discoverExistingQaProject();
const existing=(await jsonRequest(api+'/'+encodeURIComponent(scriptId),{headers})).value;
assert.equal(existing.title,QA1243_EXISTING_SCRIPT_TITLE,'Never overwrite a differently named project');
assert.equal(existing.scriptId,scriptId,'QA project identity must be unchanged');
await verifyQaScriptOwner(scriptId);
console.log('QA1243_GAS_PROJECT_REUSED '+JSON.stringify({
 scriptId,scope:'preexisting standalone QA-only project',createdNewProject:false
}));
assert.match(scriptId,/^[A-Za-z0-9_-]{15,}$/);
const gs=buildQa1243GAS(readFileSync('apps_script.gs','utf8'),secret);
// Explicit Sheets+storage scopes; no DriveApp, UrlFetchApp or execution API.
const manifest=buildQa1243Manifest(readFileSync('appsscript.json','utf8'));
assert.deepEqual(JSON.parse(manifest).oauthScopes,QA1243_SCRIPT_SCOPES);
await jsonRequest(api+'/'+scriptId+'/content',{method:'PUT',headers,body:JSON.stringify({files:[
 {name:'Code',type:'SERVER_JS',source:gs},{name:'appsscript',type:'JSON',source:manifest}
]})});
// Independent readback of the actual Google-hosted source BEFORE publication.
const current=(await jsonRequest(api+'/'+scriptId+'/content',{headers})).value;
const digest=assertRemoteSource(current,gs,manifest);
const version=(await jsonRequest(api+'/'+scriptId+'/versions',{
 method:'POST',headers,body:JSON.stringify({description:'QA1243 isolated '+marker})
})).value.versionNumber;
const immutable=(await jsonRequest(api+'/'+scriptId+'/content?versionNumber='+version,{headers})).value;
assert.equal(assertRemoteSource(immutable,gs,manifest),digest);
const deployment=(await jsonRequest(api+'/'+scriptId+'/deployments',{
 method:'POST',headers,body:JSON.stringify({
 scriptId,versionNumber:version,manifestFileName:'appsscript',description:'QA1243 standalone isolated test only'
 })
})).value;
const detail=(await jsonRequest(api+'/'+scriptId+'/deployments/'+deployment.deploymentId,{headers})).value;
assert.equal(detail.deploymentConfig?.versionNumber,version,'QA webapp version mismatch');
console.log('QA1243_REMOTE_SOURCE_ATTESTED '+JSON.stringify({
 scriptId,versionNumber:version,codeAndManifestSha256:digest,
 allowedRuntimeScopes:QA1243_SCRIPT_SCOPES,operatingScriptChanged:false
}));
const ep=detail.entryPoints?.find(e=>e.entryPointType==='WEB_APP')?.webApp;
assert.ok(ep?.url?.startsWith('https://script.google.com/macros/s/')&&ep.url.endsWith('/exec'));
assert.equal(ep.entryPointConfig?.access,'ANYONE_ANONYMOUS');
assert.equal(ep.entryPointConfig?.executeAs,'USER_DEPLOYING');
const qaUrl=ep.url;
console.log('QA1243_GAS_DEPLOYED '+JSON.stringify({scriptId,deploymentId:deployment.deploymentId,access:ep.entryPointConfig.access,executeAs:ep.entryPointConfig.executeAs}));
// A deployment resource is not proof its /exec URL can actually execute:
// newly provisioned standalone projects may still require their owner's
// interactive authorization or web-app publication propagation. Probe with
// deliberately WRONG secret before sending a single payroll row. A healthy
// app returns JSON {ok:false,error:"UNAUTHORIZED"} without creating a Sheet.
// Safe non-mutating discriminator: GET can prove publication is reachable
// even when Google rejects POST. Never send payroll or the QA secret here.
async function probeReadonlyPublication(url){
 try{
  const request=new URL(url);request.searchParams.set('qa1243_probe','publication_only');
  const res=await fetch(request.toString(),{method:'GET',redirect:'follow',
   signal:AbortSignal.timeout(25000)});
  const body=await res.text();let value=null;try{value=JSON.parse(body)}catch{}
  const evidence={http:res.status,contentType:(res.headers.get('content-type')||'').split(';')[0],
   finalHost:new URL(res.url).hostname,
   getOnlyReached:res.ok&&value?.probe==='QA1243_PUBLICATION_GET_ONLY'};
  console.log('QA1243_GAS_READONLY_GET_DIAGNOSTIC '+JSON.stringify(evidence));
  return evidence;
 }catch(_error){
  console.log('QA1243_GAS_READONLY_GET_DIAGNOSTIC '+JSON.stringify({networkError:true}));
  return {networkError:true,getOnlyReached:false};
 }
}
async function waitForExecutableQaWebapp(url){
 const attempts=12;let last=null;let consecutive403=0;
 for(let n=1;n<=attempts;n++){
  try{
   const probe=await fetch(url,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({secret:'QA1243_NOT_A_VALID_SECRET_PROBE'}),
    redirect:'follow',signal:AbortSignal.timeout(25000)
   });
   const body=await probe.text();let payload=null;
   try{payload=JSON.parse(body)}catch{}
   const at=new URL(probe.url);
   const authRequired=at.hostname==='accounts.google.com'
     || /Authorization is required|authorization required|sign in to continue|script has not been authorized/i.test(body);
   last={attempt:n,http:probe.status,contentType:(probe.headers.get('content-type')||'').split(';')[0],
    returnedJson:payload!==null,finalHost:at.hostname,authRequired};
   if(probe.ok&&payload?.ok===false&&payload?.error==='UNAUTHORIZED'){
    console.log('QA1243_GAS_WRITER_EXECUTABLE '+JSON.stringify({...last,wrongSecretRejected:true}));
    return;
   }
   // Auth HTML is usually permanent until the script owner explicitly
   // approves its new scopes. Never misreport as an Edge or Sheets success.
   if(authRequired){
    console.log('QA1243_GAS_OWNER_AUTHORIZATION_REQUIRED '+JSON.stringify(last));
    throw new Error('QA1243_GAS_OWNER_CONSENT_REQUIRED');
   }
   // Repeated historical HTML 403 on the verified pre-existing QA project
   // is a policy/consent block: avoid three identical calls every invocation. Authorization/publication policy must
   // be resolved without touching operating assets or making any data writes.
   consecutive403=(probe.status===403&&payload===null)?consecutive403+1:0;
   if(consecutive403>=(knownQaProject?1:3)){
    console.log('QA1243_GAS_HTTP_403_PERMISSION_BLOCK '+JSON.stringify(last));
    const publication=await probeReadonlyPublication(url);
    if(publication.getOnlyReached)
      throw new Error('QA1243_GAS_POST_ROUTE_OR_METHOD_403');
    // No owner API fallback; consent only via the separated QA account.
    throw new Error('QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403');
   }
  }catch(error){
   if(['QA1243_GAS_OWNER_CONSENT_REQUIRED','QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403','QA1243_GAS_POST_ROUTE_OR_METHOD_403'].includes(error?.message))throw error;
   last={attempt:n,networkError:true};
  }
  if(n<attempts)await new Promise(resolve=>setTimeout(resolve,12000));
 }
 console.log('QA1243_GAS_WRITER_NOT_EXECUTABLE '+JSON.stringify(last));
 throw new Error('QA1243_GAS_EXEC_PERMISSION_OR_PROPAGATION_UNVERIFIED');
}
await waitForExecutableQaWebapp(qaUrl);
const oidcUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
oidcUrl.searchParams.set('audience',audience);
const oidc=await jsonRequest(oidcUrl.toString(),{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
const jwt=oidc.value.value;assert.ok(jwt?.split('.').length===3,'GitHub OIDC JWT required');
function report(won=45000,hours='6:00'){
 return {attendance:{header:['날짜','직원명','출근','퇴근','실근무','급여산정시간','상태','정정사유'],
 rows:[['2026-10-20',marker,'09:00','15:00',hours,hours,'정상','QA-only revision']]},
 sessions:{header:['직원명','출근','퇴근'],rows:[[marker,'09:00','15:00']]},
 payroll:{header:['직원명','시급','기본급','예상 세전급여','총근무'],
 rows:[[marker,'7500원',won+'원',won+'원',hours]]}};
}
const endpoint=audience;
async function edge(storeKey,revision,opts={}){
 return jsonRequest(endpoint,{method:'POST',headers:{Authorization:'Bearer '+jwt,'content-type':'application/json'},
 body:JSON.stringify({mode:'qa1243_sandbox_e2e',ym:'2026-10',qa_webapp_url:qaUrl,
 qa_secret:secret,qa_store_key:storeKey,report:report(revision,revision===48750?'6:30':'6:00'),...opts})},false);
}
const first=await edge(storeA,45000);
if(!first.ok||first.value?.ok!==true){
 console.log('QA1243_EDGE_FIRST_FAILURE '+JSON.stringify({status:first.status,
 error:(/^[A-Z][A-Z0-9_]{0,63}$/.test(String(first.value?.error||''))?
  String(first.value.error):'REDACTED_UNTRUSTED_STATUS')}));
 throw Error('EDGE_GAS_E2E_NOT_CONFIRMED');
}
const aId=first.value.spreadsheet_id;assert.match(aId,/^[A-Za-z0-9_-]{15,}$/);
assert.notEqual(aId,'1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024','Never point at operating Inha workbook');
assert.equal(first.value.qa_store_key,storeA);
console.log('QA1243_EDGE_GAS_FIRST_PASS '+JSON.stringify({storeKey:storeA,spreadsheetId:aId,url:'https://docs.google.com/spreadsheets/d/'+aId+'/edit',status:first.status}));
const sheetHead={'Authorization':'Bearer '+oauth};
async function read(id){
 const range=encodeURIComponent("'10월'!A1:AZ200");
 const result=await jsonRequest('https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/'+range+
  '?valueRenderOption=FORMATTED_VALUE',{headers:sheetHead});
 return result.value.values||[];
}
function occurrence(rows,word){return rows.flat().filter(v=>String(v).includes(word)).length}
// Independent Sheets API metadata proves the generated workbook is a QA
// file, not a previously existing operational report with the same title.
async function verifyQaWorkbookTitle(id,storeKey){
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+id+
  '?fields=spreadsheetId%2Cproperties(title)';
 const r=await jsonRequest(url,{headers:sheetHead});
 assert.equal(r.value.spreadsheetId,id);
 assert.equal(r.value.properties?.title,'QA1243 '+storeKey+' 2026 근태',
  'Only visibly marked test workbooks are acceptable');
}
async function verifyQaWorkbookOwner(id){
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+
  '?fields=id%2CmimeType%2Cowners(emailAddress)%2Ctrashed';
 const doc=(await jsonRequest(url,{headers:{Authorization:'Bearer '+oauth}})).value;
 if(doc.id!==id || doc.mimeType!=='application/vnd.google-apps.spreadsheet' ||
    doc.trashed===true ||
    !doc.owners?.some(o=>String(o.emailAddress||'').toLowerCase()===EXPECTED_QA_OWNER))
   throw Error('QA1243_CREATED_WORKBOOK_OWNER_MISMATCH');
 console.log('QA1243_WORKBOOK_OWNER_VERIFIED '+JSON.stringify({id,owner:EXPECTED_QA_OWNER}));
}
await verifyQaWorkbookTitle(aId,storeA);
await verifyQaWorkbookOwner(aId);
const before=await read(aId);assert.ok(occurrence(before,marker)>=1,'Google Sheets readback has synthetic marker');
assert.ok(JSON.stringify(before).includes('45,000')||JSON.stringify(before).includes('45000'),'45,000 won on real spreadsheet');
const repeated=await edge(storeA,45000);assert.equal(repeated.value.ok,true);
assert.equal(repeated.value.spreadsheet_id,aId,'Same QA store maps to one annual workbook');
const afterDuplicate=await read(aId);
assert.equal(occurrence(afterDuplicate,marker),occurrence(before,marker),'Same event repeated without duplicate rows');
const corrected=await edge(storeA,48750);assert.equal(corrected.value.ok,true);
assert.equal(corrected.value.spreadsheet_id,aId);
const afterCorrection=await read(aId);assert.ok(JSON.stringify(afterCorrection).includes('48,750')||
 JSON.stringify(afterCorrection).includes('48750'),'Correction 48,750 won must reach actual spreadsheet');
assert.equal(occurrence(afterCorrection,marker),occurrence(before,marker),'Correction does not duplicate rows');
const b=await edge(storeB,60000);assert.equal(b.value.ok,true);
const bId=b.value.spreadsheet_id;assert.notEqual(bId,aId,'Different synthetic stores MUST use different annual workbooks');
assert.notEqual(bId,'1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024');
await verifyQaWorkbookTitle(bId,storeB);
await verifyQaWorkbookOwner(bId);
const bRows=await read(bId);
assert.ok(JSON.stringify(bRows).includes('60,000')||JSON.stringify(bRows).includes('60000'));
const aFinal=await read(aId);assert.deepEqual(aFinal,afterCorrection,'B store write must not mutate A rows');
const denied=await edge(storeA,12345,{qa_store_key:'INHA'});
assert.equal(denied.status,403,'Operating store label must be rejected at Edge');
assert.equal(denied.value.error,'QA_SANDBOX_ISOLATION_REJECTED');
const unknown=await edge(storeA,12345,{qa_webapp_url:'https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRSTUV/exec'});
assert.equal(unknown.status,502,'Bad isolated QA URL must not fall back to production');
const final=await read(aId);assert.deepEqual(final,aFinal,'Rejected probe must not alter first QA workbook');
console.log('QA1243_E2E_REAL_COMPLETE '+JSON.stringify({mode:'real OIDC trusted GitHub Actions → production server-sync-sheet Edge → separate real Apps Script webapp → real Google Sheets',
 scriptId,qaA:aId,qaB:bId,firstWrite:true,readback:true,duplicateNoGrowth:true,correction:true,
 storeIsolation:true,invalidStoreRejected:true,productionInhaSheetUntouchedByProbe:true,
 realProductionStoreOrAuthUsed:false,liveCustomerAccountEmailTested:false}));
