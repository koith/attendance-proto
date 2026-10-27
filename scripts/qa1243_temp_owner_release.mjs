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
export const OWNER_NOTICE_BEFORE='<div class="empty"><b>지점 운영 준비 중</b><p>해당 지점은 운영 승인이 완료되지 않았거나 상태를 확인할 수 없습니다. 본사에 문의하세요.</p></div>';
export const OWNER_NOTICE_AFTER='<div class="empty"><b>지점 운영 준비 중</b><p>관리자 계정 등록과 지점 운영 승인은 별도 단계입니다.</p><p>비밀번호 설정과 관리자 등록을 완료했다면 다시 설정하거나 초대 메일을 요청할 필요가 없습니다.</p><p>본사에서 지점 개통 승인과 운영 상태를 확인한 뒤 운영 메뉴를 이용할 수 있습니다.</p></div>';
export function assertTempOwnerRelease(files,message) {
 for(const marker of ['[QA1243-TEMP-OWNER-PAGES]','[QA1243-APP-PAGES]',
  '[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('TEMP_OWNER_RELEASE_MARKER_REQUIRED');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>
  !allowed.has(f.filename)||['renamed','removed'].includes(f.status)))throw Error('TEMP_OWNER_RELEASE_SCOPE');
 if(message.includes('[QA1243-OWNER-NOTICE]')){
  const noticeScope=new Set(['index.html','scripts/qa1243_temp_owner_release.mjs',
   'tests/qa1243_temp_owner_release.test.mjs','scripts/qa1243_temp_owner_pages_smoke.mjs',
   'PROJECT_BACKLOG_20261017.md']);
  if(files.some(f=>!noticeScope.has(f.filename)))throw Error('OWNER_NOTICE_RELEASE_SCOPE');
  const patch=String(files.find(f=>f.filename==='index.html')?.patch||'').split('\n')
   .filter(l=>/^[-+]/.test(l)&&!/^---|^\+\+\+/.test(l));
  const before=patch.filter(l=>l[0]==='-').map(l=>l.slice(1));
  const after=patch.filter(l=>l[0]==='+').map(l=>l.slice(1));
  if(before.length!==3||after.length!==3||
   !before.includes("      view.innerHTML='"+OWNER_NOTICE_BEFORE+"';")||
   !before.some(l=>l.includes('const APP_VERSION="v0.366";'))||
   !before.some(l=>l.includes('id="appVersion"'))||
   !before.every((l,i)=>after[i]!==l&&after[i]===l.replaceAll('v0.366','v0.367')
    .replace(OWNER_NOTICE_BEFORE,OWNER_NOTICE_AFTER)))throw Error('OWNER_NOTICE_RELEASE_HTML_DIFF');
  return true;
 }
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
