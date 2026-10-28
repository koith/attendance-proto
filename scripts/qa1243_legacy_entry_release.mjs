// Exact reviewed static legacy-entry release; operating SQL/Edge/Sheets denied.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const LEGACY_BASE='ac66a56748c5b55d13f25985480c313de618dc71';
export const LEGACY_BYTES=Object.freeze({"index.html": "38c67893de637cdd5d2232f3b3b937d159670816d74e75a7125098479fad900d", "app_release_probe_v1.js": "420ef0dde58d14784d5d51fd80c91be0cc702f90679c63caa5239d39334e6492", "scripts/qa1243_legacy_release_manifest.mjs": "0320188a287716a9ab2c91868bfdc3ea1148450043afabbf0bac1a7dee4bb51d", "owner_activation.html": "71e4d675f423e637b23dee0668584b0f72d6b3dfeff54f8bc1d1a3cfe32cb145", "owner_activation.js": "25e0811e997b022c4931c988b862a997748eb857c0d99489f272cf18f08a7801", "owner_temp_activation.html": "962db81aab1879a44c380d77246ab888c1867847f75746c4bc23665f59322766", "owner_temp_activation.js": "2b87bc1bb3ef0cdc9ee6ba6ad14e6eef4f40a7c8156d4ca0caf6a605479f9e70", "operations_staff_stocktake_v1.js": "aabc3328719d6fa9da2b32216b6453a5c014437b716d354847004edad28845e7", "operations_staff_stocktake_v1.css": "5c066d9beb3969e187611368e0aa7ee6814829dc57b0ea343d26f4aadbce51e6", "supabase/email-templates/invite.html": "aea0ee1a8309fc50ecabaaffb68059d525f35bc8e420883173c7d0c7ff8632c4", "supabase/email-templates/recovery.html": "6fadeb8b6825c1037f3a25ac9ac96fcfd618b636e73cad687aae424d8062c244", "owner_onboarding_v1.css": "398fa93f6ba3e29114269df01a8cb3faf9d13f4daf978b69948bae4c4e498042", "owner_session_recovery.html": "51eb6bec447c21ce8df2b77f651539a70602d7ee5877d2f446dd7a424945dfbb"});
const allowed=new Set([".github/workflows/p0-pages-deploy.yml", ".github/workflows/qa1243-live-e2e.yml", ".github/workflows/qa1243-owner-ready-pages-independent.yml", ".github/workflows/safari-legacy-link-regression-v371.yml", "PROJECT_BACKLOG_20261017.md", "app_release_probe_v1.js", "index.html", "qa_legacy_entry_browser_v372.mjs", "qa_safari_existing_link_stale_session_v371.test.mjs", "qa_safari_legacy_links_webkit_v371.mjs", "scripts/qa1243_friday_preflight.mjs", "scripts/qa1243_legacy_entry_release.mjs", "scripts/qa1243_legacy_pages_assets.mjs", "scripts/qa1243_legacy_pages_readback.mjs", "scripts/qa1243_legacy_release_manifest.mjs", "tests/qa1243_legacy_entry_release.test.mjs", "tests/qa1243_release_probe.test.mjs", "tests/qa1243_store_navigation_isolation.test.mjs", "owner_activation.html", "owner_activation.js", "owner_temp_activation.html", "owner_temp_activation.js", "qa_owner_password_feedback_browser_1243.mjs", ".github/workflows/qa1243-owner-temp-retry.yml", "tests/qa1243_owner_temp_retry.test.mjs", "scripts/qa1243_auth_config_verdict.test.mjs", "qa_owner_activation_retry_browser_1243.mjs", ".github/workflows/qa1243-approved-owner-opening.yml", "tests/qa1243_approved_opening_release.test.mjs", "operations_staff_stocktake_v1.js", "operations_staff_stocktake_v1.css", "qa_staff_stocktake_dialog_v374.mjs", "qa_staff_stocktake_ui_v1.mjs", "qa_staff_stocktake_pin_race_v1.mjs", "qa_staff_stocktake_fast_mobile_entry_v350.mjs", "supabase/email-templates/invite.html", "supabase/email-templates/recovery.html", "scripts/qa1243_auth_mail_branding.mjs", "scripts/qa1243_auth_mail_branding.test.mjs", "scripts/qa1243_auth_four_fields.mjs", ".github/workflows/qa1243-auth-four-fields.yml", "owner_onboarding_v1.css", "owner_session_recovery.html", "tests/qa1243_owner_recovery_paste.test.mjs", "scripts/apply_supabase_invite_email.mjs", "scripts/qa1243_recovery_template.mjs", "qa_owner_invite_autoactivation_921.mjs"]);
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
 if(files?.some(f=>f.filename.startsWith('operations_staff_stocktake'))&&!message.includes('[QA1243-STAFF-STOCKTAKE-UI]'))throw Error('LEGACY_ENTRY_MARKER');
 if(files?.some(f=>f.filename.startsWith('supabase/email-templates/'))&&!message.includes('[QA1243-AUTH-MAIL-BRANDING]'))throw Error('LEGACY_ENTRY_MARKER');
 if(before!==LEGACY_BASE)throw Error('LEGACY_ENTRY_PARENT');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>!allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('LEGACY_ENTRY_SCOPE');
 for(const [path,expected] of Object.entries(LEGACY_BYTES)){
  if(path==='index.html'&&!files.some(f=>f.filename===path))throw Error('LEGACY_ENTRY_REQUIRED');
  if(createHash('sha256').update(read(path)).digest('hex')!==expected)throw Error('LEGACY_ENTRY_BYTES');
 }
 return true;
}
