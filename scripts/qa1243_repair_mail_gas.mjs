// Authorized existing QA project only. Never read/write Script Properties,
// create a project/deployment, send mail, or touch an operating Sheet.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {QA_GAS_URL} from '../supabase/functions/qa1243-google-mail-bridge/connectivity.mjs';

export const SCRIPT_ID='1fOm-aIyhbqv5SkCkLoJNdFIlBxdGUUhHy8wO7Ft_SF-KF5iQWTvGChNT';
export const DEPLOYMENT_ID='AKfycbwV1kpYbMKcYtWs909gyryhY3_Pal4afO-6hDKwxqGrUf2wWtjV1gjs48_mWaOykzyF';
export const PREVIOUS_SOURCE_SHA='79ff2a94ddc61cb1c21b48961a4e739df2a768989d305138ed3430f57dcf1fc7';
const TITLE='QA1243 isolated Auth MailApp 2026-10-24';
const OWNER='webuielf@gmail.com';
export function sourceFingerprint(files) {
  if(!Array.isArray(files)||files.length!==2)throw Error('QA1243_MAIL_GAS_FILE_SET_DRIFT');
  const code=files.find(f=>f.name==='Code'&&f.type==='SERVER_JS');
  const manifest=files.find(f=>f.name==='appsscript'&&f.type==='JSON');
  if(!code||!manifest)throw Error('QA1243_MAIL_GAS_FILE_SET_DRIFT');
  return createHash('sha256').update(code.source+'\n'+manifest.source).digest('hex');
}
function verifyDeployment(detail) {
  const web=detail.entryPoints?.find(e=>e.entryPointType==='WEB_APP')?.webApp;
  if(detail.deploymentId!==DEPLOYMENT_ID || detail.deploymentConfig?.scriptId!==SCRIPT_ID ||
     !Number.isSafeInteger(detail.deploymentConfig?.versionNumber)||detail.deploymentConfig.versionNumber<1 ||
     web?.url!==QA_GAS_URL||web.entryPointConfig?.access!=='ANYONE_ANONYMOUS'||
     web.entryPointConfig?.executeAs!=='USER_DEPLOYING')throw Error('QA1243_MAIL_GAS_DEPLOYMENT_DRIFT');
}

export async function repairExistingMailGas({call,authHeader,headers,
  scriptSource=readFileSync(new URL('../gas/qa1243-auth-mail/Code.gs',import.meta.url),'utf8'),
  manifestSource=readFileSync(new URL('../gas/qa1243-auth-mail/appsscript.json',import.meta.url),'utf8')}) {
  const manifest=JSON.parse(manifestSource);
  assert.deepEqual(manifest.oauthScopes,['https://www.googleapis.com/auth/script.send_mail']);
  assert.equal(manifest.webapp.access,'ANYONE_ANONYMOUS');assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');
  assert.match(scriptSource,/MailApp\.sendEmail/);assert.match(scriptSource,/operation:'connectivity'/);
  const files=[{name:'Code',type:'SERVER_JS',source:scriptSource},{name:'appsscript',type:'JSON',source:manifestSource}];
  const target=sourceFingerprint(files);
  const api='https://script.googleapis.com/v1/projects/'+SCRIPT_ID;
  const owned=await call('https://www.googleapis.com/drive/v3/files/'+SCRIPT_ID+'?fields=id,name,mimeType,trashed,owners(emailAddress)',{headers:authHeader});
  if(owned.id!==SCRIPT_ID||owned.name!==TITLE||owned.mimeType!=='application/vnd.google-apps.script'||owned.trashed===true||
     owned.owners?.length!==1||owned.owners[0].emailAddress?.toLowerCase()!==OWNER)
    throw Error('QA1243_MAIL_GAS_OWNER_OR_PROJECT_DRIFT');
  const project=await call(api,{headers:authHeader});
  if(project.scriptId!==SCRIPT_ID||project.title!==TITLE)throw Error('QA1243_MAIL_GAS_PROJECT_DRIFT');
  const list=await call(api+'/deployments',{headers:authHeader});
  const deployed=(list.deployments||[]).filter(d=>Number(d.deploymentConfig?.versionNumber)>0);
  if(deployed.length!==1||deployed[0].deploymentId!==DEPLOYMENT_ID)throw Error('QA1243_MAIL_GAS_DEPLOYMENT_DRIFT');
  const before=await call(api+'/deployments/'+DEPLOYMENT_ID,{headers:authHeader});verifyDeployment(before);
  const head=await call(api+'/content',{headers:authHeader});
  const oldVersion=await call(api+'/content?versionNumber='+before.deploymentConfig.versionNumber,{headers:authHeader});
  const headSha=sourceFingerprint(head.files),deployedSha=sourceFingerprint(oldVersion.files);
  if(![PREVIOUS_SOURCE_SHA,target].includes(headSha)||![PREVIOUS_SOURCE_SHA,target].includes(deployedSha))
    throw Error('QA1243_MAIL_GAS_UNAPPROVED_SOURCE_DRIFT');
  let updated=false;
  if(headSha!==target) {
    await call(api+'/content',{method:'PUT',headers,body:JSON.stringify({files})});
    const readback=await call(api+'/content',{headers:authHeader});
    assert.equal(sourceFingerprint(readback.files),target,'QA1243_MAIL_GAS_SOURCE_READBACK_FAILED');
    updated=true;
  }
  let version=before.deploymentConfig.versionNumber;
  if(deployedSha!==target) {
    const created=await call(api+'/versions',{method:'POST',headers,body:JSON.stringify({description:'QA1243 signed no-mail connectivity; Auth Hook OFF'})});
    version=created.versionNumber;assert.ok(Number.isSafeInteger(version)&&version>before.deploymentConfig.versionNumber);
    const versioned=await call(api+'/content?versionNumber='+version,{headers:authHeader});
    assert.equal(sourceFingerprint(versioned.files),target,'QA1243_MAIL_GAS_VERSION_READBACK_FAILED');
    await call(api+'/deployments/'+DEPLOYMENT_ID,{method:'PUT',headers,body:JSON.stringify({deploymentConfig:{
      scriptId:SCRIPT_ID,versionNumber:version,manifestFileName:'appsscript',description:'QA1243 signed no-mail connectivity; existing key preserved; Auth Hook OFF'
    }})});
    updated=true;
  }
  const after=await call(api+'/deployments/'+DEPLOYMENT_ID,{headers:authHeader});verifyDeployment(after);
  assert.equal(after.deploymentConfig.versionNumber,version,'QA1243_MAIL_GAS_DEPLOYMENT_READBACK_FAILED');
  const readback=await call(api+'/content?versionNumber='+version,{headers:authHeader});
  assert.equal(sourceFingerprint(readback.files),target,'QA1243_MAIL_GAS_VERSION_READBACK_FAILED');
  return {scriptId:SCRIPT_ID,deploymentId:DEPLOYMENT_ID,version,sha256:target,updated,
    scriptPropertiesModified:false,realMailSent:false,authHookEnabled:false};
}
