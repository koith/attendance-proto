import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {repairExistingMailGas,SCRIPT_ID,DEPLOYMENT_ID,PREVIOUS_SOURCE_SHA,sourceFingerprint} from '../scripts/qa1243_repair_mail_gas.mjs';
import {QA_GAS_URL} from '../supabase/functions/qa1243-google-mail-bridge/connectivity.mjs';

const current=[{name:'Code',type:'SERVER_JS',source:readFileSync('gas/qa1243-auth-mail/Code.gs','utf8')},
 {name:'appsscript',type:'JSON',source:readFileSync('gas/qa1243-auth-mail/appsscript.json','utf8')}];
function previousFiles() { return JSON.parse(readFileSync('qa/fixtures/qa1243_mail_gas_v1.json','utf8')); }

function fixture({upToDate=false,drift=false,badOwner=false,badDeployment=false}={}) {
 const previous=previousFiles();assert.equal(sourceFingerprint(previous),PREVIOUS_SOURCE_SHA);
 let head=structuredClone(upToDate?current:previous),version=upToDate?2:1;
 const versions=new Map([[1,previous],[2,structuredClone(current)]]),writes=[];
 if(drift)head[0].source+='\n// unexpected operator edit';
 const detail=()=>({deploymentId:badDeployment?'other':DEPLOYMENT_ID,deploymentConfig:{scriptId:SCRIPT_ID,versionNumber:version},
  entryPoints:[{entryPointType:'WEB_APP',webApp:{url:QA_GAS_URL,entryPointConfig:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}}}]});
 async function call(url,options={}) {
  const method=options.method||'GET',path=new URL(url).pathname;
  if(method!=='GET')writes.push({path,method,body:JSON.parse(options.body)});
  if(url.includes('/drive/v3/files/'))return {id:SCRIPT_ID,name:'QA1243 isolated Auth MailApp 2026-10-24',mimeType:'application/vnd.google-apps.script',owners:[{emailAddress:badOwner?'other@example.org':'webuielf@gmail.com'}]};
  if(path.endsWith('/content')){
   if(method==='PUT')head=JSON.parse(options.body).files;
   return {files:new URL(url).searchParams.has('versionNumber')?versions.get(Number(new URL(url).searchParams.get('versionNumber'))):head};
  }
  if(path.endsWith('/versions')){versions.set(2,structuredClone(head));return {versionNumber:2};}
  if(path.endsWith('/deployments'))return {deployments:[detail()]};
  if(path.endsWith('/deployments/'+DEPLOYMENT_ID)){
   if(method==='PUT')version=JSON.parse(options.body).deploymentConfig.versionNumber;
   return detail();
  }
  return {scriptId:SCRIPT_ID,title:'QA1243 isolated Auth MailApp 2026-10-24'};
 }
 return {call,writes};
}

test('update only known existing QA source and deployment with exact readback; no key/project creation',async()=>{
 const f=fixture();const result=await repairExistingMailGas({...f,authHeader:{},headers:{}});
 assert.equal(result.version,2);assert.equal(result.updated,true);assert.equal(result.scriptPropertiesModified,false);
 assert.equal(result.realMailSent,false);assert.equal(result.authHookEnabled,false);
 assert.deepEqual(f.writes.map(w=>[w.path.split('/').slice(-1)[0],w.method]),[['content','PUT'],['versions','POST'],[DEPLOYMENT_ID,'PUT']]);
 assert.equal(f.writes[0].body.files[1].source,current[1].source);
 assert.equal(f.writes[2].body.deploymentConfig.scriptId,SCRIPT_ID);
});
test('already deployed identical source is read-only and idempotent',async()=>{
 const f=fixture({upToDate:true});const result=await repairExistingMailGas({...f,authHeader:{},headers:{}});
 assert.equal(result.updated,false);assert.equal(f.writes.length,0);
});
for(const [name,options,error] of [
 ['operator source drift',{drift:true},/UNAPPROVED_SOURCE_DRIFT/],
 ['another owner',{badOwner:true},/OWNER_OR_PROJECT_DRIFT/],
 ['another deployment',{badDeployment:true},/DEPLOYMENT_DRIFT/]
])test(name+' stops before any writes',async()=>{
 const f=fixture(options);await assert.rejects(repairExistingMailGas({...f,authHeader:{},headers:{}}),error);
 assert.equal(f.writes.length,0);
});

test('source PUT failure is not retried and cannot update the live deployment',async()=>{
 const f=fixture();let failedWrites=0;
 const call=async(url,options={})=>{
  if(options.method==='PUT'){failedWrites++;throw Error('QA1243_MAIL_GAS_API_HTTP_403');}
  return f.call(url,options);
 };
 await assert.rejects(repairExistingMailGas({call,authHeader:{},headers:{}}),/API_HTTP_403/);
 assert.equal(failedWrites,1);assert.equal(f.writes.length,0);
});
test('incorrect source readback blocks version creation and deployment update',async()=>{
 const f=fixture();let mutated=false;
 const call=async(url,options={})=>{
  if(options.method==='PUT')mutated=true;
  const result=await f.call(url,options);
  if(mutated&&options.method!=='PUT'&&url.endsWith('/content'))
   return {files:previousFiles()};
  return result;
 };
 await assert.rejects(repairExistingMailGas({call,authHeader:{},headers:{}}),/SOURCE_READBACK_FAILED/);
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].method,'PUT');
});
