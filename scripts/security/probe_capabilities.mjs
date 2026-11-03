// Read-only capability probe. Never print OAuth access tokens, API keys, or server response bodies.
const supa=process.env.SUPABASE_AUTH_READ_TOKEN||'';
const google=['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN'];
async function safeGet(label,url,authorization){
 try{
  const r=await fetch(url,{headers:{Authorization:'Bearer '+authorization},redirect:'error',signal:AbortSignal.timeout(12000)});
  console.log(label+'_HTTP='+r.status);
  if(r.status===200 && label==='SUPABASE_API_KEYS'){
    const body=await r.json();
    const entries=Array.isArray(body)?body:(Array.isArray(body?.keys)?body.keys:[]);
    const hasService=entries.some(e=>['service_role','secret'].includes(String(e?.name||e?.type||'').toLowerCase()));
    console.log('SUPABASE_API_KEYS_SERVICE_DESCRIPTOR='+hasService);
  }
 }catch(e){console.log(label+'_NETWORK_OR_RESPONSE_FAILED')}
}
if(supa){
 const p='https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle';
 await safeGet('SUPABASE_HOSTED_AUTH_CONFIG',p+'/config/auth',supa);
 await safeGet('SUPABASE_API_KEYS',p+'/api-keys?reveal=false',supa);
 await safeGet('SUPABASE_V2_CONFIG','https://api.supabase.com/v2/projects/waluhdgqhwjjwmflhrle/config',supa);
}else console.log('SUPABASE_AUTH_READ_TOKEN_UNAVAILABLE');
if(google.every(k=>Boolean(process.env[k]))){
 try{
  const result=await fetch('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},redirect:'error',signal:AbortSignal.timeout(12000),
   body:new URLSearchParams({client_id:process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token:process.env.GOOGLE_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'})
  });
  console.log('GOOGLE_OAUTH_REFRESH_HTTP='+result.status);
  if(result.ok){
   const v=await result.json();
   const info=typeof v.scope==='string'?v.scope:'';
   const scopes=new Set(info.split(/\s+/).filter(Boolean));
   const canWrite=['https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/drive'].some(k=>scopes.has(k));
   console.log('GOOGLE_DRIVE_FILE_WRITE_SCOPE='+canWrite);
   const readOnly=scopes.has('https://www.googleapis.com/auth/drive.metadata.readonly');
   console.log('GOOGLE_DRIVE_METADATA_READ_SCOPE='+readOnly);
   if(v.access_token){
    const rr=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{
     headers:{Authorization:'Bearer '+v.access_token},redirect:'error',signal:AbortSignal.timeout(12000)
    });
    if(rr.ok){
      const info=await rr.json();
      console.log('GOOGLE_BACKUP_OWNER_VERIFIED='+(info.email_verified===true&&String(info.email||'').toLowerCase()==='webuielf@gmail.com'));
    }else console.log('GOOGLE_BACKUP_OWNER_CHECK_HTTP='+rr.status);
   }
  }
 }catch{console.log('GOOGLE_OAUTH_CAPABILITY_PROBE_FAILED')}
}else console.log('GOOGLE_OAUTH_CREDENTIALS_UNAVAILABLE');
