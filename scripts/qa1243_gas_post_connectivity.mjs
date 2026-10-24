// QA1243: isolated, non-sending live GAS connectivity probe.
// Run only against the known QA-only deployment. Never send valid signed mail.
const endpoint='https://script.google.com/macros/s/AKfycbwV1kpYbMKcYtWs909gyryhY3_Pal4afO-6hDKwxqGrUf2wWtjV1gjs48_mWaOykzyF/exec';
const controller=new AbortController();
const timer=setTimeout(()=>controller.abort(),18000);
try {
 const response=await fetch(endpoint,{
  method:'POST',
  headers:{'Content-Type':'text/plain;charset=utf-8'},
  body:'{',
  redirect:'follow',
  signal:controller.signal
 });
 const raw=await response.text();
 // Never print response body, tokens, secrets or recipient details.
 let result;
 try {result=JSON.parse(raw);}catch {throw Error('QA1243_GAS_POST_NON_JSON_HTTP_'+response.status);}
 if(!response.ok||result?.ok!==false||result?.code!=='BAD_JSON')
  throw Error('QA1243_GAS_POST_UNEXPECTED_HTTP_'+response.status+'_CODE_'+String(result?.code||'UNKNOWN').replace(/[^A-Z_]/g,''));
 console.log('QA1243_GAS_POST_BAD_JSON_VERIFIED_HTTP_'+response.status);
} finally {clearTimeout(timer);}
