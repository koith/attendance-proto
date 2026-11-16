// Trusted identity verification for the disabled monthly Apps Script source only.
// No token, principal address or tokeninfo response is logged by this code.
import {assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';
const err=code=>{throw Error('MONTHLY_OWNER_GAS_'+code)};

export function inspectMonthlyGasTokenInfo(info,{clientId,driveAbout}={}){
 if(!info||typeof info!=='object')err('TOKENINFO_MISSING');
 if(typeof clientId!=='string'||!clientId)err('CLIENT_ID_REQUIRED');
 // tokeninfo on access-token grants may omit email. A separate signed
 // Drive about.get self-identity response from the SAME bearer is acceptable
 // only with me=true and a concrete permissionId; never trust a caller label.
 const tokenEmail=String(info.email||'').trim().toLowerCase();
 const driveUser=driveAbout?.user;
 const driveEmail=String(driveUser?.emailAddress||'').trim().toLowerCase();
 const verifiedDrive=driveUser?.me===true&&/^[A-Za-z0-9_-]{5,}$/.test(String(driveUser.permissionId||''));
 if(tokenEmail&&driveEmail&&tokenEmail!==driveEmail)err('OAUTH_DRIVE_IDENTITY_MISMATCH');
 const email=tokenEmail||(verifiedDrive?driveEmail:'');
 // Google tokeninfo on an access-token grant can omit email_verified.
 // A field explicitly saying FALSE is never overridden. When absent, accept
 // only independent Google Drive about.get proof for the very same bearer.
 if(info.email_verified===false||info.email_verified==='false'||
    info.verified_email===false||info.verified_email==='false')err('OAUTH_EMAIL_UNVERIFIED');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))err('OAUTH_EMAIL_MISSING');
 if(driveAbout!==null&&driveAbout!==undefined&&
    (!verifiedDrive||driveEmail!==email))
    err('OAUTH_DRIVE_IDENTITY_MISMATCH');
 const tokenVerified=info.email_verified===true||info.email_verified==='true'||
   info.verified_email===true||info.verified_email==='true';
 const independentProof=tokenVerified||verifiedDrive;
 if(String(info.aud||'')!==clientId)err('OAUTH_CLIENT_MISMATCH');
 const sub=String(info.sub||'');
 if(!/^[A-Za-z0-9_-]{8,}$/.test(sub))err('OAUTH_SUBJECT_INVALID');
 if(info.expires_in!==undefined&&
  (!Number.isFinite(Number(info.expires_in))||Number(info.expires_in)<120))
  err('OAUTH_TOKEN_EXPIRED_OR_NEAR_EXPIRY');
 try{assertQa1243RunnerScopes(info.scope);}
 catch{err('OAUTH_SCOPES_INCOMPATIBLE')}
 return {email,sub,independentProof};
}
export function verifyMonthlyGasIdentity(info,{expectedOwner,clientId,driveAbout}={}){
 const email=String(expectedOwner||'').trim().toLowerCase();
 if(!email)err('EXPECTED_IDENTITY_MISSING');
 const actual=inspectMonthlyGasTokenInfo(info,{clientId,driveAbout});
 if(actual.email!==email)err('OAUTH_OWNER_MISMATCH');
 if(!actual.independentProof)err('OAUTH_SINGLE_GRANT_NOT_VERIFIED');
 return {ownerVerified:true,scopesVerified:true,clientVerified:true};
}

// First: accept a token directly bound to the previously approved owner.
// Otherwise accept a *different* verified owner ONLY when both separately
// configured OAuth families independently attest the same Google subject,
// with distinct refresh grants. This provisions a DISABLED script only,
// never sends mail, installs a trigger or reads business worksheets.
export async function selectTrustedMonthlyGasCredential({families,probe,expectedOwner}){
 if(!Array.isArray(families)||typeof probe!=='function'||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(expectedOwner||'')))
    err('TRUSTED_FAMILY_INPUT_INVALID');
 const original=expectedOwner.toLowerCase();
 const valid=[],failures=new Set();
 let complete=0;
 for(const f of families){
  if(!f||!['qa','legacy'].includes(f.name))continue;
  if(![f.clientId,f.clientSecret,f.refreshToken].every(x=>typeof x==='string'&&x.length>0))
    continue;
  complete++;
  try{
    const result=await probe(f);
    if(!result||typeof result.accessToken!=='string'||!result.accessToken)
      err('OAUTH_TOKEN_MISSING');
    const identity=inspectMonthlyGasTokenInfo(result.info,{clientId:f.clientId,driveAbout:result.driveAbout});
    const candidate={accessToken:result.accessToken,family:f.name,
      ownerEmail:identity.email,subject:identity.sub,refreshToken:f.refreshToken};
    if(identity.email===original&&identity.independentProof)
      return {accessToken:candidate.accessToken,family:candidate.family,
        ownerEmail:identity.email,ownerPolicy:'original'};
    valid.push(candidate);
  }catch(e){
    const message=String(e?.message||'');
    if(message.includes('OAUTH_EMAIL_UNVERIFIED'))failures.add('UNVERIFIED');
    else if(message.includes('OAUTH_DRIVE_IDENTITY_MISMATCH'))failures.add('DRIVE_IDENTITY');
    else if(message.includes('OAUTH_SUBJECT_INVALID'))failures.add('SUBJECT');
    else if(message.includes('OAUTH_EMAIL_MISSING'))failures.add('EMAIL');
    else if(message.includes('OAUTH_SCOPES_INCOMPATIBLE'))failures.add('SCOPE');
    else if(message.includes('OAUTH_CLIENT_MISMATCH'))failures.add('CLIENT');
    else failures.add('PROBE');
  }
 }
 if(!complete)err('OAUTH_NOT_CONFIGURED');
 if(valid.length===2 && valid[0].family!==valid[1].family &&
    valid[0].ownerEmail===valid[1].ownerEmail && valid[0].subject===valid[1].subject &&
    valid[0].refreshToken!==valid[1].refreshToken)
  return {accessToken:valid[0].accessToken,family:valid[0].family,
    ownerEmail:valid[0].ownerEmail,ownerPolicy:'two_grant_consensus'};
 if(valid.length && valid.length===complete)err('OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS');
 err('NO_TRUSTED_OAUTH_FAMILY_'+[...failures].sort().join('_'));
}
