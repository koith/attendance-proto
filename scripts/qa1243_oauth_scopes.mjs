// OAuth scopes for the local QA-only bootstrap and trusted GitHub Actions.
// DO NOT broaden to Drive write, full Sheets write or script.external_request.
// The standalone Apps Script runtime has separate Sheets write scopes.
export const QA1243_RUNNER_SCOPES=Object.freeze([
 'https://www.googleapis.com/auth/userinfo.email',
 'https://www.googleapis.com/auth/script.projects',
 'https://www.googleapis.com/auth/script.deployments',
 'https://www.googleapis.com/auth/drive.metadata.readonly',
 'https://www.googleapis.com/auth/spreadsheets.readonly'
]);

export function assertQa1243RunnerScopes(actual){
 const list=typeof actual==='string'?actual.split(/\s+/).filter(Boolean):Array.from(actual||[]);
 const set=new Set(list);
 if(set.size!==QA1243_RUNNER_SCOPES.length ||
    QA1243_RUNNER_SCOPES.some(scope=>!set.has(scope)))
   throw new Error('QA1243_OAUTH_SCOPE_MISSING_OR_OVERPRIVILEGED');
 return true;
}
