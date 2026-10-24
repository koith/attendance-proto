import {signedConnectivityEnvelope} from './core.mjs';

export const QA_GAS_URL='https://script.google.com/macros/s/AKfycbwV1kpYbMKcYtWs909gyryhY3_Pal4afO-6hDKwxqGrUf2wWtjV1gjs48_mWaOykzyF/exec';
export const QA_AUDIENCE='https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/qa1243-google-mail-bridge';

// Call only after cryptographic JWT verification against GitHub's issuer/JWKS.
export function assertConnectivityIdentity(claims) {
  const main=claims.ref==='refs/heads/main' && ['push','workflow_dispatch'].includes(claims.event_name);
  const approvedPR=claims.ref==='refs/pull/1361/merge' && claims.event_name==='pull_request';
  if(claims.iss!=='https://token.actions.githubusercontent.com' || claims.aud!==QA_AUDIENCE ||
     claims.repository!=='koith/attendance-proto' || (!main&&!approvedPR) ||
     claims.workflow_ref!==`koith/attendance-proto/.github/workflows/qa1243-google-mail-bridge.yml@${claims.ref}` ||
     !/^\d+$/.test(String(claims.run_id||''))) throw Error('CONNECTIVITY_IDENTITY_REJECTED');
  return String(claims.run_id);
}

export async function handleConnectivity(request,{authenticate,configuration,fetcher=fetch}) {
  if(!/^Bearer \S+$/i.test(request.headers.get('authorization')||''))
    return Response.json({error:'CONNECTIVITY_IDENTITY_REQUIRED'},{status:401});
  let runId;
  try{runId=assertConnectivityIdentity(await authenticate(request));}
  catch{return Response.json({error:'CONNECTIVITY_IDENTITY_REJECTED'},{status:403});}
  const body=await request.text();
  if(body!==''&&body!=='{}')return Response.json({error:'CONNECTIVITY_BODY_REJECTED'},{status:400});
  try {
    const result=await verifyConnectivity({...configuration(),runId,fetcher});
    return Response.json(result,{status:result.ok?200:502});
  }catch{return Response.json({error:'CONNECTIVITY_TRANSPORT_UNAVAILABLE'},{status:503});}
}

// Follow ContentService as GET; never forward a signed POST or credentials.
export async function postGas(body, {fetcher=fetch,endpoint=QA_GAS_URL}={}) {
  if(endpoint!==QA_GAS_URL)throw Error('CONNECTIVITY_TARGET_REJECTED');
  const trace=[];
  let response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body,redirect:'manual',signal:AbortSignal.timeout(18000)});
  if([301,302,303,307,308].includes(response.status)) {
    const location=response.headers.get('location');let target;
    try{target=new URL(location||'');}catch{throw Error('GAS_REDIRECT_INVALID');}
    if(![302,303].includes(response.status) || target.protocol!=='https:' ||
       target.hostname!=='script.googleusercontent.com' || target.pathname!=='/macros/echo' ||
       target.username || target.password)throw Error('GAS_REDIRECT_REJECTED');
    trace.push({status:response.status,from:'script.google.com',to:target.hostname,method:'GET'});
    response=await fetcher(target.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(18000)});
  }
  const raw=await response.text();
  const contentType=(response.headers.get('content-type')||'').split(';')[0];
  const result={httpStatus:response.status,contentType,redirects:trace,receipt:null};
  if(raw.length>16384)return {...result,classification:'GAS_RESPONSE_TOO_LARGE'};
  try{result.receipt=JSON.parse(raw);}catch{
    return {...result,classification:response.status===403 && /<title>Access Denied<\/title>/i.test(raw) &&
      /You need access/i.test(raw)?'GOOGLE_ACCESS_DENIED_BEFORE_RUNTIME':'GAS_NON_JSON'};
  }
  return {...result,classification:response.ok?'GAS_JSON':'GAS_HTTP_ERROR'};
}

export async function verifyConnectivity({secret,endpoint,runId,fetcher=fetch,nonce=crypto.randomUUID()}) {
  if(endpoint!==QA_GAS_URL)throw Error('CONNECTIVITY_TARGET_REJECTED');
  const checks=[];
  const envelope=await signedConnectivityEnvelope(`qa1243_probe_${runId}_${nonce}`,secret);
  const cases=[
    ['POST_BAD_JSON','{',r=>r?.ok===false&&r.code==='BAD_JSON'],
    ['BAD_SIGNATURE',JSON.stringify({...envelope,signature:'invalid'}),r=>r?.ok===false&&r.code==='UNAUTHORIZED'],
    ['SIGNED_NO_MAIL',JSON.stringify(envelope),r=>r?.ok===true&&r.operation==='connectivity'&&r.mailSent===false&&r.duplicate===false],
    ['DUPLICATE_BLOCKED',JSON.stringify(envelope),r=>r?.ok===true&&r.operation==='connectivity'&&r.mailSent===false&&r.duplicate===true]
  ];
  for(const [id,body,accept] of cases) {
    const response=await postGas(body,{fetcher,endpoint});
    const pass=response.httpStatus===200&&response.classification==='GAS_JSON'&&accept(response.receipt);
    checks.push({id,pass,httpStatus:response.httpStatus,contentType:response.contentType,
      classification:response.classification,redirects:response.redirects});
    if(!pass)return {ok:false,mailSent:false,checks};
  }
  return {ok:true,mailSent:false,checks};
}
