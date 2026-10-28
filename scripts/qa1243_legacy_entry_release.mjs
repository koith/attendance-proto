// Exact reviewed static legacy-entry release; operating SQL/Edge/Sheets denied.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const LEGACY_BASE='ac66a56748c5b55d13f25985480c313de618dc71';
export const LEGACY_BYTES=Object.freeze({"index.html": "7be8bdd55ace6e374f68f0348cfa5d05cba83a9a8fe79e0a284670c7d22a57e2", "app_release_probe_v1.js": "420ef0dde58d14784d5d51fd80c91be0cc702f90679c63caa5239d39334e6492", "scripts/qa1243_legacy_release_manifest.mjs": "0320188a287716a9ab2c91868bfdc3ea1148450043afabbf0bac1a7dee4bb51d", "owner_activation.html": "5c951863af29d3ea8b2c236941ff2a925a7e029faa39bc46df6bcd2a315cfe4d", "owner_activation.js": "25e0811e997b022c4931c988b862a997748eb857c0d99489f272cf18f08a7801", "owner_temp_activation.html": "f528bf74f58f444822a4430feb46e5e6ed0e3bdf48633c3669ea37f071714e84", "owner_temp_activation.js": "2b87bc1bb3ef0cdc9ee6ba6ad14e6eef4f40a7c8156d4ca0caf6a605479f9e70"});
const allowed=new Set([".github/workflows/p0-pages-deploy.yml", ".github/workflows/qa1243-live-e2e.yml", ".github/workflows/qa1243-owner-ready-pages-independent.yml", ".github/workflows/safari-legacy-link-regression-v371.yml", "PROJECT_BACKLOG_20261017.md", "app_release_probe_v1.js", "index.html", "qa_legacy_entry_browser_v372.mjs", "qa_safari_existing_link_stale_session_v371.test.mjs", "qa_safari_legacy_links_webkit_v371.mjs", "scripts/qa1243_friday_preflight.mjs", "scripts/qa1243_legacy_entry_release.mjs", "scripts/qa1243_legacy_pages_assets.mjs", "scripts/qa1243_legacy_pages_readback.mjs", "scripts/qa1243_legacy_release_manifest.mjs", "tests/qa1243_legacy_entry_release.test.mjs", "tests/qa1243_release_probe.test.mjs", "tests/qa1243_store_navigation_isolation.test.mjs", "owner_activation.html", "owner_activation.js", "owner_temp_activation.html", "owner_temp_activation.js", "qa_owner_password_feedback_browser_1243.mjs", ".github/workflows/qa1243-owner-temp-retry.yml", "tests/qa1243_owner_temp_retry.test.mjs", "scripts/qa1243_auth_config_verdict.test.mjs", "qa_owner_activation_retry_browser_1243.mjs", ".github/workflows/qa1243-approved-owner-opening.yml", "tests/qa1243_approved_opening_release.test.mjs"]);
export function assertLegacyEntryRelease(files,message,before,{read=p=>readFileSync(p,'utf8')}={}){
 if(message.includes('[QA1243-LEGACY-EVIDENCE]')){
  for(const marker of ['[QA1243-LEGACY-ENTRY]','[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
   if(!message.includes(marker))throw Error('LEGACY_EVIDENCE_MARKER');
  if(message.includes('[QA1243-APP-PAGES]')||before!=='7087f7c1c9ffaa3f1e09e91ebc0f4a57d7383265')throw Error('LEGACY_EVIDENCE_PARENT');
  const qaOnly=new Set(['qa_legacy_entry_browser_v372.mjs','.github/workflows/safari-legacy-link-regression-v371.yml','scripts/qa1243_legacy_entry_release.mjs','tests/qa1243_legacy_entry_release.test.mjs','PROJECT_BACKLOG_20261017.md']);
  if(!Array.isArray(files)||!files.some(f=>f.filename==='qa_legacy_entry_browser_v372.mjs')||files.some(f=>!qaOnly.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('LEGACY_EVIDENCE_SCOPE');
  for(const [path,expected] of Object.entries(LEGACY_BYTES))
   if(createHash('sha256').update(read(path)).digest('hex')!==expected)throw Error('LEGACY_EVIDENCE_BYTES');
  return true;
 }
 for(const marker of ['[QA1243-LEGACY-ENTRY]','[QA1243-APP-PAGES]','[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('LEGACY_ENTRY_MARKER');
 if(files?.some(f=>/^owner_(?:temp_)?activation\./.test(f.filename))&&!message.includes('[QA1243-OWNER-PASSWORD-FEEDBACK]'))throw Error('LEGACY_ENTRY_MARKER');
 if(before!==LEGACY_BASE)throw Error('LEGACY_ENTRY_PARENT');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>!allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('LEGACY_ENTRY_SCOPE');
 for(const [path,expected] of Object.entries(LEGACY_BYTES)){
  if(path==='index.html'&&!files.some(f=>f.filename===path))throw Error('LEGACY_ENTRY_REQUIRED');
  if(createHash('sha256').update(read(path)).digest('hex')!==expected)throw Error('LEGACY_ENTRY_BYTES');
 }
 return true;
}
