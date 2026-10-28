// Exact reviewed static legacy-entry release; operating SQL/Edge/Sheets denied.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const LEGACY_BASE='bd0e575a242b6e4d676707b9fd56916f92b2e491';
export const LEGACY_BYTES=Object.freeze({"index.html": "b26d024447408bbdafd5a032a33197abcf307262671c4355345a6de1b715bcc1", "app_release_probe_v1.js": "420ef0dde58d14784d5d51fd80c91be0cc702f90679c63caa5239d39334e6492", "scripts/qa1243_legacy_release_manifest.mjs": "0320188a287716a9ab2c91868bfdc3ea1148450043afabbf0bac1a7dee4bb51d"});
const allowed=new Set([".github/workflows/p0-pages-deploy.yml", ".github/workflows/qa1243-live-e2e.yml", ".github/workflows/qa1243-owner-ready-pages-independent.yml", ".github/workflows/safari-legacy-link-regression-v371.yml", "PROJECT_BACKLOG_20261017.md", "app_release_probe_v1.js", "index.html", "qa_legacy_entry_browser_v372.mjs", "qa_safari_existing_link_stale_session_v371.test.mjs", "qa_safari_legacy_links_webkit_v371.mjs", "scripts/qa1243_friday_preflight.mjs", "scripts/qa1243_legacy_entry_release.mjs", "scripts/qa1243_legacy_pages_assets.mjs", "scripts/qa1243_legacy_pages_readback.mjs", "scripts/qa1243_legacy_release_manifest.mjs", "tests/qa1243_legacy_entry_release.test.mjs", "tests/qa1243_release_probe.test.mjs", "tests/qa1243_store_navigation_isolation.test.mjs"]);
export function assertLegacyEntryRelease(files,message,before,{read=p=>readFileSync(p,'utf8')}={}){
 for(const marker of ['[QA1243-LEGACY-ENTRY]','[QA1243-APP-PAGES]','[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('LEGACY_ENTRY_MARKER');
 if(before!==LEGACY_BASE)throw Error('LEGACY_ENTRY_PARENT');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>!allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('LEGACY_ENTRY_SCOPE');
 for(const [path,expected] of Object.entries(LEGACY_BYTES)){
  if(!files.some(f=>f.filename===path))throw Error('LEGACY_ENTRY_REQUIRED');
  if(createHash('sha256').update(read(path)).digest('hex')!==expected)throw Error('LEGACY_ENTRY_BYTES');
 }
 return true;
}
