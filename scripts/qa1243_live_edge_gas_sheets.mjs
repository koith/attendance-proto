// #1243 LIVE service-to-service test. Runs ONLY from trusted main's QA workflow.
// Real Google Apps Script API deployment + real production Edge OIDC +
// standalone Apps Script Web App + real Google Sheets API. No production DB DML,
// no existing Apps Script deployment or its shared secret is read/changed.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';

const projectRef='waluhdgqhwjjwmflhrle';
const audience=`https://${projectRef}.supabase.co/functions/v1/server-sync-sheet`;
const projectName='QA1243 isolated Edge GAS '+new Date().toISOString().slice(0,16);
const marker='QA1243_'+randomBytes(6).toString('hex').toUpperCase();
const storeA='QA1243_SBX_'+randomBytes(6).toString('hex').toUpperCase();
const storeB='QA1243_SBX_'+randomBytes(6).toString('hex').toUpperCase();
const secret=randomBytes(64).toString('hex');
const required=['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN',
 'ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
for(const key of required)if(!process.env[key])throw Error('REQUIRED_QA_CREDENTIAL_MISSING: '+key);
async function jsonRequest(url,options={},assertOk=true){
 const res=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(60000)});
 const raw=await res.text();let value;try{value=JSON.parse(raw)}catch{value={unexpectedNonJson:true}};
 if(assertOk&&!res.ok){
  // Never publish bearer tokens, script source, or complete remote error bodies.
  const rawMessage=String(value?.error?.message||'').slice(0,350);
  const detail=[process.env.GOOGLE_OAUTH_CLIENT_SECRET,process.env.GOOGLE_OAUTH_REFRESH_TOKEN,secret]
    .filter(Boolean).some(token=>rawMessage.includes(token))?'REDACTED_SECRET':
    rawMessage.replace(/eyJ[A-Za-z0-9_.-]{20,}/g,'[REDACTED]');
  const endpoint=new URL(url);
  throw Error('REMOTE_HTTP_'+res.status+' for '+endpoint.hostname+' '+endpoint.pathname.split('/').slice(0,3).join('/')+
    ' [type='+String(value?.error?.status||'UNKNOWN')+'] '+detail);

 }
 return {status:res.status,ok:res.ok,value};
}
const token=await jsonRequest('https://oauth2.googleapis.com/token',{
 method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:process.env.GOOGLE_OAUTH_CLIENT_ID,
 client_secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,
 refresh_token:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'})
});
const oauth=token.value.access_token;assert.ok(oauth,'Google OAuth access token required');
const headers={Authorization:'Bearer '+oauth,'content-type':'application/json'};
const api='https://script.googleapis.com/v1/projects';
// Reuse only a *verified existing QA-owned* standalone project after its
// initial creation. Owner consent is per-project: making a new GAS project on
// every CI run discards an approval and makes permanent 403s unfixable.
// This ID was created by the isolated QA run #39421278882, not an operational
// Apps Script. The owner can grant scope once in this independent project.
const knownQaProject=process.env.QA1243_GAS_SCRIPT_ID||
  '1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw';
let scriptId;
if(knownQaProject){
 const existing=(await jsonRequest(api+'/'+encodeURIComponent(knownQaProject),{headers})).value;
 assert.match(existing.title||'',/^QA1243 isolated Edge GAS 2026-10-20T/,'Never overwrite non-QA GAS projects');
 assert.equal(existing.scriptId,knownQaProject,'QA project identity must be unchanged');
 scriptId=existing.scriptId;
 console.log('QA1243_GAS_PROJECT_REUSED '+JSON.stringify({scriptId,scope:'preexisting standalone QA-only project'}));
}else{
 const created=(await jsonRequest(api,{method:'POST',headers,body:JSON.stringify({title:projectName})})).value;
 scriptId=created.scriptId;
 console.log('QA1243_GAS_PROJECT_CREATED '+JSON.stringify({scriptId,scope:'new standalone project only'}));
}
assert.match(scriptId,/^[A-Za-z0-9_-]{15,}$/);
let gs=readFileSync('apps_script.gs','utf8');
assert.ok(gs.includes("var SHARED_SECRET = 'REPLACE_WITH_LONG_RANDOM_SECRET';"));
gs=gs.replace("var SHARED_SECRET = 'REPLACE_WITH_LONG_RANDOM_SECRET';",
 "var SHARED_SECRET = '"+secret+"';");
// Intentionally read-only. An owner can select this function and Run once in
// the isolated project's editor to grant Apps Script service scopes. The QA
// function is NOT present in the operating script and creates no workbook.
gs+='\nfunction qa1243AuthorizeServices(){'+
  'SpreadsheetApp.getActiveSpreadsheet();'+
  'DriveApp.getRootFolder().getName();'+
  'PropertiesService.getScriptProperties().getKeys();'+
  'LockService.getScriptLock();'+
  'return "QA1243_AUTH_SCOPE_CHECK_ONLY";}\n';
const manifest=readFileSync('appsscript.json','utf8');
await jsonRequest(api+'/'+scriptId+'/content',{method:'PUT',headers,body:JSON.stringify({files:[
 {name:'Code',type:'SERVER_JS',source:gs},{name:'appsscript',type:'JSON',source:manifest}
]})});
const version=(await jsonRequest(api+'/'+scriptId+'/versions',{
 method:'POST',headers,body:JSON.stringify({description:'QA1243 isolated '+marker})
})).value.versionNumber;
const deployment=(await jsonRequest(api+'/'+scriptId+'/deployments',{
 method:'POST',headers,body:JSON.stringify({
 scriptId,versionNumber:version,manifestFileName:'appsscript',description:'QA1243 standalone isolated test only'
 })
})).value;
const detail=(await jsonRequest(api+'/'+scriptId+'/deployments/'+deployment.deploymentId,{headers})).value;
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
   // Three consistent HTML 403 responses on the new deployment are not
   // a transient Sheet/Edge failure. Authorization/publication policy must
   // be resolved without touching operating assets or making any data writes.
   consecutive403=(probe.status===403&&payload===null)?consecutive403+1:0;
   if(consecutive403>=3){
    console.log('QA1243_GAS_HTTP_403_PERMISSION_BLOCK '+JSON.stringify(last));
    throw new Error('QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403');
   }
  }catch(error){
   if(['QA1243_GAS_OWNER_CONSENT_REQUIRED','QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403'].includes(error?.message))throw error;
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
 error:String(first.value?.error||'non-json').slice(0,180)}));
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
