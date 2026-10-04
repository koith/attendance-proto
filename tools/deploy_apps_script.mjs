import fs from 'node:fs';
import { mergeSharedSecret } from './apps_script_secret.mjs';

const need=(k)=>{const v=process.env[k];if(!v)throw new Error('missing '+k);return v};
const clientId=need('CLIENT_ID'),clientSecret=need('CLIENT_SECRET'),refreshToken=need('REFRESH_TOKEN');
const scriptId=need('SCRIPT_ID'),deploymentId=need('DEPLOYMENT_ID');
const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
if(!tokenRes.ok){
  const raw=await tokenRes.text();
  let detail=raw;
  try{
    const parsed=JSON.parse(raw);
    detail=JSON.stringify({error:parsed?.error,error_description:parsed?.error_description});
  }catch{}
  throw new Error('oauth refresh failed '+tokenRes.status+' '+detail);
}
const {access_token}=await tokenRes.json(); const auth={Authorization:'Bearer '+access_token,'Content-Type':'application/json'};
const localSource=fs.readFileSync('apps_script.gs','utf8');
const manifest=fs.existsSync('appsscript.json')?fs.readFileSync('appsscript.json','utf8'):JSON.stringify({timeZone:'Asia/Seoul',exceptionLogging:'STACKDRIVER',runtimeVersion:'V8'});

// Read the existing project source before uploading. The repository intentionally keeps
// SHARED_SECRET as a placeholder; preserve the live value and refuse unsafe mismatches.
let res=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{headers:auth});
if(!res.ok)throw new Error('read existing content failed '+res.status+' '+await res.text());
const existing=await res.json();
const existingCode=existing.files?.find(f=>f.type==='SERVER_JS'&&f.name==='Code')
  ||existing.files?.find(f=>f.type==='SERVER_JS');
if(!existingCode?.source)throw new Error('existing Apps Script Code source not found; refusing deployment');
const source=mergeSharedSecret(localSource,existingCode.source);

res=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/content',{method:'PUT',headers:auth,body:JSON.stringify({files:[{name:'Code',type:'SERVER_JS',source},{name:'appsscript',type:'JSON',source:manifest}]})});
if(!res.ok)throw new Error('updateContent failed '+res.status+' '+await res.text());
res=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/versions',{method:'POST',headers:auth,body:JSON.stringify({description:'GitHub '+process.env.GITHUB_SHA})});
if(!res.ok)throw new Error('createVersion failed '+res.status+' '+await res.text());
const version=await res.json();
res=await fetch('https://script.googleapis.com/v1/projects/'+scriptId+'/deployments/'+deploymentId,{method:'PUT',headers:auth,body:JSON.stringify({deploymentConfig:{scriptId,versionNumber:version.versionNumber,manifestFileName:'appsscript',description:'GitHub automated deployment'}})});
if(!res.ok)throw new Error('updateDeployment failed '+res.status+' '+await res.text());
console.log('Apps Script deployment updated to version',version.versionNumber);
