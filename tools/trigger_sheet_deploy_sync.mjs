/* GitHub OIDC authenticates the completed deployment, with no stored service key. */
const endpoint="https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet";
if(!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
  throw new Error("GITHUB_OIDC_UNAVAILABLE");
const url=process.env.ACTIONS_ID_TOKEN_REQUEST_URL+(process.env.ACTIONS_ID_TOKEN_REQUEST_URL.includes("?")?"&":"?")+"audience="+encodeURIComponent(endpoint);
const oidc=await fetch(url,{headers:{Authorization:"Bearer "+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
if(!oidc.ok)throw new Error("GITHUB_OIDC_ISSUE_FAILED:"+oidc.status);
const token=(await oidc.json()).value;
if(!token)throw new Error("GITHUB_OIDC_TOKEN_EMPTY");
for(let attempt=1;attempt<=7;attempt++){
  const res=await fetch(endpoint,{
    method:"POST",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({mode:"deployment"})
  });
  const body=await res.json().catch(()=>({error:"NON_JSON_SYNC_RESPONSE"}));
  if(res.status===409&&body.error==="SHEET_SYNC_BUSY"&&attempt<7){
    await new Promise(resolve=>setTimeout(resolve,10000));continue;
  }
  if(!res.ok||body.ok!==true||body.written!==true||body.column_resize_applied!==true)
    throw new Error("SHEET_DEPLOY_SYNC_UNVERIFIED:"+JSON.stringify({status:res.status,error:body.error,ok:body.ok,written:body.written}));
  console.log("PASS deployed report synced and sized:",body.ym,body.spreadsheet_id);
  break;
}
