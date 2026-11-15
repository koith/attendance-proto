// Trusted Google OAuth access-token verification for disabled monthly GAS source provision.
// Uses Google's documented tokeninfo access-token response: email/email_verified/scope/aud.
// No tokens, emails or secret values are printed by callers.
// Verification cannot be bypassed on HTTP failure or missing fields.
import {assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';

export function verifyMonthlyGasIdentity(info,{expectedOwner,clientId}={}){
  const err=code=>{throw new Error('MONTHLY_OWNER_GAS_'+code)};
  if(!info||typeof info!=='object')err('TOKENINFO_MISSING');
  const owner=String(expectedOwner||'').trim().toLowerCase();
  if(!owner||!clientId||typeof clientId!=='string')err('EXPECTED_IDENTITY_MISSING');
  const email=String(info.email||'').trim().toLowerCase();
  const verified=info.email_verified===true||info.email_verified==='true'||info.verified_email===true||info.verified_email==='true';
  if(!verified||email!==owner)err('OAUTH_IDENTITY_MISMATCH');
  const audience=String(info.aud||'');
  // Access tokens must be associated with the exact configured OAuth client.
  if(audience!==clientId)err('OAUTH_CLIENT_MISMATCH');
  if(!/^[A-Za-z0-9_-]{8,}$/.test(String(info.sub||'')))err('OAUTH_SUBJECT_INVALID');
  if(info.expires_in!==undefined&&
    (!Number.isFinite(Number(info.expires_in))||Number(info.expires_in)<120))
    err('OAUTH_TOKEN_EXPIRED_OR_NEAR_EXPIRY');
  try{assertQa1243RunnerScopes(info.scope);}
  catch{err('OAUTH_SCOPES_INCOMPATIBLE')}
  return {ownerVerified:true,scopesVerified:true,clientVerified:true};
}


// Only complete credential families from the trusted Actions environment are tried.
// Never pair a client-secret from one Google account with a refresh-token of another.
// A failed or wrong-identity family is discarded before accessing Drive or Apps Script.
export async function selectTrustedMonthlyGasCredential({families,probe,expectedOwner}){
  if(!Array.isArray(families)||typeof probe!=='function'||typeof expectedOwner!=='string')
    throw Error('MONTHLY_OWNER_GAS_TRUSTED_FAMILY_INPUT_INVALID');
  const failures=new Set();
  let complete=0;
  for(const family of families){
    if(!family||!['qa','legacy'].includes(family.name))continue;
    if(![family.clientId,family.clientSecret,family.refreshToken].every(x=>typeof x==='string'&&x.length>0))
      continue;
    complete++;
    try{
      const response=await probe(family);
      if(!response||typeof response.accessToken!=='string'||!response.accessToken)
        throw Error('MONTHLY_OWNER_GAS_OAUTH_TOKEN_MISSING');
      verifyMonthlyGasIdentity(response.info,{expectedOwner,clientId:family.clientId});
      return {accessToken:response.accessToken,family:family.name};
    }catch(e){
      const code=String(e?.message||'');
      if(code.startsWith('MONTHLY_OWNER_GAS_OAUTH_OWNER_MISMATCH') ||
         code.startsWith('MONTHLY_OWNER_GAS_OAUTH_IDENTITY_MISMATCH'))
        failures.add('OWNER');
      else if(code.startsWith('MONTHLY_OWNER_GAS_OAUTH_SCOPES_INCOMPATIBLE'))
        failures.add('SCOPE');
      else if(code.startsWith('MONTHLY_OWNER_GAS_OAUTH_CLIENT_MISMATCH'))
        failures.add('CLIENT');
      else if(code.startsWith('MONTHLY_OWNER_GAS_OAUTH_EMAIL_UNVERIFIED'))
        failures.add('UNVERIFIED_EMAIL');
      else failures.add('PROBE');
    }
  }
  if(!complete)throw Error('MONTHLY_OWNER_GAS_OAUTH_NOT_CONFIGURED');
  throw Error('MONTHLY_OWNER_GAS_NO_TRUSTED_OAUTH_FAMILY_'+[...failures].sort().join('_'));
}
