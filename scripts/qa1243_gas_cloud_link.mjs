// Google scripts.run is optional diagnostics, not bypass for a 403 webapp.
// The script Cloud project cannot be verified by Apps Script projects.get.
export function assessQaScriptCloudLink(oauthClientId,ownerAttestedQaStandardProjectNumber){
 const match=/^(\d{6,16})-[\w-]+\.apps\.googleusercontent\.com$/.exec(String(oauthClientId||''));
 if(!match)return {eligible:false,reason:'OAUTH_CLIENT_PROJECT_NUMBER_UNAVAILABLE'};
 const expected=String(ownerAttestedQaStandardProjectNumber||'').trim();
 if(!/^\d{6,16}$/.test(expected))return {eligible:false,reason:'QA_STANDARD_CLOUD_PROJECT_NOT_OWNER_ATTESTED'};
 if(match[1]!==expected)return {eligible:false,reason:'QA_OAUTH_CLIENT_GCP_PROJECT_MISMATCH'};
 return {eligible:true,reason:'OWNER_ATTESTED_NUMBER_MATCH_REQUIRES_ACTUAL_EXECUTION'};
}
