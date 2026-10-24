// Real no-mail traffic only. Print safe metadata; never a token or redirect query.
import assert from 'node:assert/strict';
import {postGas,QA_AUDIENCE} from '../supabase/functions/qa1243-google-mail-bridge/connectivity.mjs';

if(process.env.QA1243_VERIFY_SIGNED_CONNECTIVITY==='true') {
  const issuerUrl=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const issuerToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!issuerUrl||!issuerToken)throw Error('QA1243_GAS_OIDC_UNAVAILABLE');
  const url=new URL(issuerUrl);url.searchParams.set('audience',QA_AUDIENCE);
  const tokenResponse=await fetch(url,{headers:{Authorization:`Bearer ${issuerToken}`},redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(tokenResponse.status,200,'QA1243_GAS_OIDC_FAILED');
  const {value}=await tokenResponse.json();
  if(typeof value!=='string')throw Error('QA1243_GAS_OIDC_INVALID');
  const response=await fetch(QA_AUDIENCE+'/connectivity',{
    method:'POST',headers:{Authorization:`Bearer ${value}`,'Content-Type':'application/json'},
    body:'{}',redirect:'error',signal:AbortSignal.timeout(150000)});
  const result=await response.json();
  for(const check of result.checks||[])console.log(JSON.stringify(check));
  assert.equal(response.status,200,'QA1243_GAS_SIGNED_CONNECTIVITY_HTTP_'+response.status);
  assert.equal(result.ok,true);assert.equal(result.mailSent,false);
  assert.deepEqual(result.checks.map(x=>[x.id,x.pass]),[
    ['POST_BAD_JSON',true],['BAD_SIGNATURE',true],['SIGNED_NO_MAIL',true],['DUPLICATE_BLOCKED',true]
  ]);
  console.log('QA1243_GAS_REAL_POST_HMAC_REPLAY_NO_MAIL_PASS');
} else {
  const result=await postGas('{');
  const {receipt,...safe}=result;console.log(JSON.stringify(safe));
  assert.equal(result.httpStatus,200,'QA1243_GAS_POST_HTTP_'+result.httpStatus+'_'+result.classification);
  assert.deepEqual(receipt,{ok:false,code:'BAD_JSON'});
  console.log('QA1243_GAS_POST_BAD_JSON_VERIFIED_HTTP_200');
}
