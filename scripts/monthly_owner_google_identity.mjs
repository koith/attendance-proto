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
  const verified=info.email_verified===true||info.email_verified==='true'||info.verified_email===true;
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
