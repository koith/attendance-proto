// This release is static client code only. Never hide DB/Edge/Sheets changes
// behind a no-write marker or skip the normal P0/browser regression gates.
const allowed=new Set([
 'index.html','owner_temp_activation.html','owner_temp_activation.js',
 'tests/qa1243_owner_temp_session.test.mjs','tests/qa1243_owner_temp_retry.test.mjs',
 'tests/qa1243_temp_owner_release.test.mjs','scripts/qa1243_temp_owner_release.mjs',
 'scripts/qa1243_temp_owner_pages_smoke.mjs','.github/workflows/qa1243-owner-temp-retry.yml',
 '.github/workflows/p0-pages-deploy.yml','.github/workflows/qa1243-live-e2e.yml',
 '.github/workflows/qa1243-owner-ready-pages-independent.yml',
 'PROJECT_BACKLOG_20261017.md','docs/qa1243-owner-opening-readiness.md'
]);
export function assertTempOwnerRelease(files,message) {
 for(const marker of ['[QA1243-TEMP-OWNER-PAGES]','[QA1243-APP-PAGES]',
  '[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('TEMP_OWNER_RELEASE_MARKER_REQUIRED');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>
  !allowed.has(f.filename)||['renamed','removed'].includes(f.status)))throw Error('TEMP_OWNER_RELEASE_SCOPE');
 for(const path of ['index.html','owner_temp_activation.html','owner_temp_activation.js'])
  if(!files.some(f=>f.filename===path))throw Error('TEMP_OWNER_RELEASE_FILE_REQUIRED');
 const lines=path=>String(files.find(f=>f.filename===path)?.patch||'').split('\n')
  .filter(l=>/^[-+]/.test(l)&&!/^---|^\+\+\+/.test(l));
 const index=lines('index.html'),before=index.filter(l=>l[0]==='-').map(l=>l.slice(1)),after=index.filter(l=>l[0]==='+').map(l=>l.slice(1));
 if(before.length!==2||after.length!==2||!before.every((line,i)=>after[i]===line.replaceAll('v0.363','v0.364'))||
  !before.some(l=>l.includes('const APP_VERSION="v0.363";'))||!before.some(l=>l.includes('id="appVersion"')))
  throw Error('TEMP_OWNER_RELEASE_VERSION_DIFF');
 const html=lines('owner_temp_activation.html');
 if(html.length!==2||html[0]!=='-<script src="owner_temp_activation.js?v=20261026retry2" defer></script>'||
  html[1]!=='+<script src="owner_temp_activation.js?v=20261026resume1" defer></script>')
  throw Error('TEMP_OWNER_RELEASE_HTML_DIFF');
 return true;
}
