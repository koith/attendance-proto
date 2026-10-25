// Existing refresh grants only. Never use the known-expired access token,
// expand scopes, create credentials, or log provider payloads/credential values.
import {writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {QA1243_RUNNER_SCOPES} from './qa1243_oauth_scopes.mjs';
import {repairExistingMailGas,SCRIPT_ID,DEPLOYMENT_ID} from './qa1243_repair_mail_gas.mjs';
import {QA_GAS_URL} from '../supabase/functions/qa1243-google-mail-bridge/connectivity.mjs';

const OWNER='webuielf@gmail.com';
const SCRIPT_API='https://script.googleapis.com/v1/projects/'+SCRIPT_ID;
const DRIVE_API='https://www.googleapis.com/drive/v3/files/'+SCRIPT_ID+'?fields=id,name,mimeType,trashed,owners(emailAddress)';
const candidates=[['QA','QA1243_GOOGLE_OAUTH_'],['EXISTING','GOOGLE_OAUTH_']];
const knownErrors=new Set(['invalid_grant','invalid_client','unauthorized_client','access_denied']);
// Mail deployment does not access Sheets. Accept the existing five-scope QA
// grant, but do not require its unrelated spreadsheets.readonly permission.
export const MAIL_DEPLOY_SCOPES=Object.freeze(QA1243_RUNNER_SCOPES.filter(s=>!s.endsWith('/spreadsheets.readonly')));

function safeFailure(data) {
  const error=data?.error;
  const details=Array.isArray(error?.details)?error.details:[];
  const reasons=details.map(d=>d?.reason).concat(Array.isArray(error?.errors)?error.errors.map(e=>e.reason):[])
    .filter(v=>typeof v==='string'&&/^[A-Za-z_]{1,80}$/.test(v));
  return {error:knownErrors.has(error)?error:undefined,
    errorStatus:typeof error?.status==='string'&&/^[A-Z_]{1,80}$/.test(error.status)?error.status:undefined,reasons};
}

export async function resolveUnattendedCredential(env,{fetcher=fetch}={}) {
  const report={schema:1,knownExpiredAccessTokenSkipped:true,managementCredentialReady:false,
    credentialPresence:{},serviceAccountBindings:{},candidates:[],operatingDataWrites:0,mailSent:false};
  for(const key of ['QA1243_GCP_SERVICE_ACCOUNT_JSON','GCP_SA_KEY','GCP_WORKLOAD_IDENTITY_PROVIDER','GCP_SERVICE_ACCOUNT'])
    report.serviceAccountBindings[key]=Boolean(env[key]);
  let selectedCall=null;
  async function request(url,options,evidence,phase) {
    let response,data={};
    try {
      response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
      try{data=await response.json();}catch{}
    }catch {
      evidence.push({phase,method:options.method||'GET',endpoint:url,status:0,errorStatus:'NETWORK_FAILURE'});
      return {ok:false,status:0,data:{}};
    }
    evidence.push({phase,method:options.method||'GET',endpoint:url,status:response.status,
      ...(!response.ok?safeFailure(data):{})});
    return {ok:response.ok,status:response.status,data};
  }
  for(const [name,prefix] of candidates) {
    const keys=['CLIENT_ID','CLIENT_SECRET','REFRESH_TOKEN'].map(k=>prefix+k);
    for(const key of keys)report.credentialPresence[key]=Boolean(env[key]);
    const item={name,refreshAvailable:keys.every(k=>Boolean(env[k])),missingBindings:keys.filter(k=>!env[k]),
      grantedScopes:[],missingScopes:[],identityVerified:false,writeEligible:false,evidence:[]};
    report.candidates.push(item);
    if(!item.refreshAvailable){item.reason='REFRESH_BINDING_INCOMPLETE';continue;}
    const refreshed=await request('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
        client_id:env[keys[0]],client_secret:env[keys[1]],refresh_token:env[keys[2]],grant_type:'refresh_token'
      })},item.evidence,'REFRESH');
    if(!refreshed.ok||typeof refreshed.data.access_token!=='string'){
      item.reason='REFRESH_FAILED';continue;
    }
    const access=refreshed.data.access_token;
    const authHeader={Authorization:'Bearer '+access};
    let info=refreshed.data;
    if(typeof info.scope!=='string') {
      const tokenInfo=await request('https://www.googleapis.com/oauth2/v2/tokeninfo',{
        method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({access_token:access})},item.evidence,'TOKENINFO');
      if(!tokenInfo.ok){item.reason='TOKENINFO_FAILED';continue;}
      info=tokenInfo.data;
    }
    const actual=new Set(String(info.scope||'').split(/\s+/).filter(Boolean));
    item.grantedScopes=[...actual].filter(s=>/^https:\/\/www\.googleapis\.com\/auth\/[A-Za-z._]+$/.test(s)||['openid','email','profile'].includes(s));
    item.missingScopes=MAIL_DEPLOY_SCOPES.filter(s=>!actual.has(s));
    const accepted=new Set([...QA1243_RUNNER_SCOPES,'openid','email','profile']);
    const exactScopes=item.missingScopes.length===0&&[...actual].every(s=>accepted.has(s));
    if(actual.has('https://www.googleapis.com/auth/userinfo.email')) {
      const identity=await request('https://www.googleapis.com/oauth2/v3/userinfo',{headers:authHeader},item.evidence,'IDENTITY');
      item.identityVerified=identity.ok&&identity.data.email?.toLowerCase()===OWNER&&identity.data.email_verified===true;
    }else item.identitySkipped='MISSING_USERINFO_SCOPE';
    // These two fixed metadata reads establish the actual API response even
    // when OAuth scope names alone would otherwise lead to a guessed diagnosis.
    const project=await request(SCRIPT_API,{headers:authHeader},item.evidence,'QA_PROJECT_GET');
    const deployment=await request(SCRIPT_API+'/deployments/'+DEPLOYMENT_ID,{headers:authHeader},item.evidence,'QA_DEPLOYMENT_GET');
    let owned=false;
    if(actual.has('https://www.googleapis.com/auth/drive.metadata.readonly')) {
      const drive=await request(DRIVE_API,{headers:authHeader},item.evidence,'QA_OWNER_GET');
      owned=drive.ok&&drive.data.id===SCRIPT_ID&&drive.data.trashed!==true&&drive.data.owners?.length===1&&
        drive.data.owners[0].emailAddress?.toLowerCase()===OWNER;
    }
    const web=deployment.data.entryPoints?.find(e=>e.entryPointType==='WEB_APP')?.webApp;
    const target=project.ok&&project.data.scriptId===SCRIPT_ID&&project.data.title==='QA1243 isolated Auth MailApp 2026-10-24'&&
      deployment.ok&&deployment.data.deploymentId===DEPLOYMENT_ID&&web?.url===QA_GAS_URL&&
      web.entryPointConfig?.access==='ANYONE_ANONYMOUS'&&web.entryPointConfig?.executeAs==='USER_DEPLOYING';
    item.writeEligible=exactScopes&&item.identityVerified&&owned&&target;
    item.reason=item.writeEligible?'VERIFIED_QA_OWNER_AND_TARGET':!exactScopes?'REQUIRED_SCOPE_MISSING_OR_EXTRA':
      !item.identityVerified?'QA_CALLER_IDENTITY_NOT_VERIFIED':!owned?'QA_OWNER_NOT_VERIFIED':'QA_TARGET_NOT_VERIFIED';
    if(item.writeEligible) {
      report.managementCredentialReady=true;report.selectedCandidate=name;
      selectedCall=async(url,options={})=>{
        const method=options.method||'GET';
        const allowed=method==='GET'&&(url===DRIVE_API||url===SCRIPT_API||url===SCRIPT_API+'/deployments'||
          url===SCRIPT_API+'/deployments/'+DEPLOYMENT_ID||url===SCRIPT_API+'/content'||
          new RegExp('^'+SCRIPT_API.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/content\\?versionNumber=[0-9]+$').test(url))||
          method==='PUT'&&[SCRIPT_API+'/content',SCRIPT_API+'/deployments/'+DEPLOYMENT_ID].includes(url)||
          method==='POST'&&url===SCRIPT_API+'/versions';
        if(!allowed)throw Error('QA1243_MAIL_GAS_API_TARGET_REJECTED');
        const result=await request(url,{...options,headers:{...options.headers,...authHeader}},item.evidence,'VERIFIED_QA_API');
        if(!result.ok)throw Error('QA1243_MAIL_GAS_API_HTTP_'+result.status);
        return result.data;
      };
      break;
    }
  }
  return {report,call:selectedCall};
}

export async function runUnattendedAuth(env,{fetcher=fetch,deploy=false}={}) {
  const {report,call}=await resolveUnattendedCredential(env,{fetcher});
  if(deploy) {
    if(!call){report.deployment={status:'AUTHORIZATION_REQUIRED',attempted:false};return report;}
    try{report.deployment={status:'DEPLOYED',attempted:true,...await repairExistingMailGas({call,authHeader:{},headers:{'content-type':'application/json'}})};}
    catch{report.deployment={status:'FAILED_REQUIRES_READBACK',attempted:true};}
  }
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const deploy=process.env.QA1243_CREDENTIAL_ACTION==='deploy';
  const report=await runUnattendedAuth(process.env,{deploy});
  mkdirSync('qa-results',{recursive:true});
  writeFileSync('qa-results/qa1243-unattended-auth.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(deploy&&report.deployment?.status!=='DEPLOYED')process.exitCode=2;
}
