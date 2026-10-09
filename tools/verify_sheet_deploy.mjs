// Verify an actual Google Sheet write following a trusted main deployment.
// No long-lived secret leaves GitHub: OIDC JWT is verified by the Edge endpoint.
const endpoint='https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet';
const requestUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!requestUrl||!requestToken)throw new Error('GITHUB_OIDC_UNAVAILABLE');
const separator=requestUrl.includes('?')?'&':'?';
const auth=await fetch(requestUrl+separator+'audience='+encodeURIComponent(endpoint),{
  headers:{Authorization:'Bearer '+requestToken}
});
if(!auth.ok)throw new Error('GITHUB_OIDC_REQUEST_FAILED: '+auth.status);
const token=(await auth.json()).value;
if(!token)throw new Error('EMPTY_GITHUB_OIDC_TOKEN');
let body=null,result=null;
for(let attempt=1;attempt<=5;attempt++){
  result=await fetch(endpoint,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify({mode:'deployment'})
  });
  body=await result.json().catch(()=>({error:'NON_JSON_RESPONSE'}));
  if(result.status===409 && attempt<5){
    await new Promise(resolve=>setTimeout(resolve,attempt*3000));
    continue;
  }
  break;
}
if(!result.ok||body.ok!==true||body.written!==true||!body.spreadsheet_id||body.column_resize_applied!==true){
  throw new Error('SHEET_DEPLOY_WRITE_UNVERIFIED: '+JSON.stringify({status:result.status,body}));
}
console.log('PASS deployed Google Sheet write verified',JSON.stringify({ym:body.ym,spreadsheet_id:body.spreadsheet_id,column_resize_applied:body.column_resize_applied}));
