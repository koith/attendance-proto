// Reviewed emergency client fix only. No DB/Edge/Auth/Google/Sheets change.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const ISOLATION_BASE='0362f20506ab27bcd2c7268765b0fa690e82da80';
export const ISOLATION_ASSETS={'index.html': '5ddbc196272ce5ea292997e787c316836034345f2d873fc37685a4a34a3f7a2d', 'actual_attendance.html': '9ec7c434b42444586a03079a28a846fb70f6b5374bd7c2421f3a3bf3cb122b5d', 'actual_attendance.js': '3d4fb7df7e83a101887a5c8f4e3371ab65e399b3f5d8f9b99c610fc2550e0f97'};
const allowed=new Set(['index.html', 'actual_attendance.html', 'actual_attendance.js', 'tests/qa1243_store_navigation_isolation.test.mjs', 'qa_store_navigation_isolation_browser_1243.mjs', 'qa_actual_attendance_v1.mjs', 'qa_employee_identity_ux_v1.mjs', 'scripts/qa1243_store_isolation_release.mjs', 'tests/qa1243_store_isolation_release.test.mjs', 'scripts/qa1243_store_isolation_pages_smoke.mjs', '.github/workflows/qa-browser-app-smoke.yml', '.github/workflows/p0-pages-deploy.yml', '.github/workflows/qa1243-live-e2e.yml', '.github/workflows/qa1243-owner-ready-pages-independent.yml', 'scripts/qa1243_friday_preflight.mjs', 'scripts/qa1243_friday_preflight.test.mjs', 'PROJECT_BACKLOG_20261017.md']);
export function assertStoreIsolationRelease(files,message,before,{read=p=>readFileSync(p,'utf8')}={}){
 for(const marker of ['[QA1243-STORE-ISOLATION]','[QA1243-APP-PAGES]',
  '[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('STORE_ISOLATION_MARKER');
 if(before!==ISOLATION_BASE)throw Error('STORE_ISOLATION_PARENT');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>
  !allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('STORE_ISOLATION_SCOPE');
 for(const [path,hash] of Object.entries(ISOLATION_ASSETS)){
  if(!files.some(f=>f.filename===path))throw Error('STORE_ISOLATION_ASSET_REQUIRED');
  if(createHash('sha256').update(read(path)).digest('hex')!==hash)throw Error('STORE_ISOLATION_UNREVIEWED_ASSET');
 }
 return true;
}
