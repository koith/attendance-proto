// Shared FAIL-CLOSED mobile OAuth authority checks. Never accept a caller's
// claimed Google identity or scope without Google's own tokeninfo/userinfo.
import {QA1243_RUNNER_SCOPES,assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';

export const QA1243_MOBILE_OWNER='webuielf@gmail.com';
export const QA1243_GITHUB_OWNER='koith';
export const QA1243_MOBILE_SECRET_NAME='QA1243_GOOGLE_OAUTH_ACCESS_TOKEN';
export const QA1243_MIN_TOKEN_LIFETIME_SECONDS=1800;
export function assertMobileTokenInfo(info,clientId){
 if(!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId||''))
  throw Error('QA1243_INVALID_WEB_CLIENT_ID');
 if(!info||typeof info!=='object')throw Error('QA1243_TOKENINFO_MISSING');
 const audience=info.audience||info.issued_to||info.aud;
 if(audience!==clientId)throw Error('QA1243_TOKEN_AUDIENCE_MISMATCH');
 if(!Number.isFinite(Number(info.expires_in)) ||
    Number(info.expires_in)<QA1243_MIN_TOKEN_LIFETIME_SECONDS)
  throw Error('QA1243_MOBILE_TOKEN_EXPIRY_TOO_SHORT');
 assertQa1243RunnerScopes(String(info.scope||''));
 return true;
}
export function assertMobileGoogleUserInfo(profile){
 if(String(profile?.email||'').toLowerCase()!==QA1243_MOBILE_OWNER ||
    profile?.email_verified!==true)
  throw Error('QA1243_MOBILE_GOOGLE_ACCOUNT_MISMATCH');
 return true;
}
export function assertGitHubOwner(profile,repo){
 if(profile?.login!==QA1243_GITHUB_OWNER ||
    repo?.full_name!=='koith/attendance-proto' ||
    repo?.permissions?.admin!==true)
  throw Error('QA1243_GITHUB_REPO_OWNER_MISMATCH');
 return true;
}
export function assertTrustedFailedPush(run,mainSha){
 if(run?.event!=='push'||run?.head_branch!=='main' ||
    run?.status!=='completed'||run?.conclusion!=='failure' ||
    !Number.isSafeInteger(run?.id) ||
    !/^[0-9a-f]{40}$/.test(run?.head_sha||'')||
    !/^[0-9a-f]{40}$/.test(mainSha||''))
  throw Error('QA1243_TRUSTED_PUSH_RUN_REQUIRED');
 return true;
}
export const QA1243_MOBILE_SCOPES=QA1243_RUNNER_SCOPES;
