// Reviewed HQ-only static correction. No SQL, Edge, Auth, mail or Sheets writes.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const REINVITE_BASE='c85079f5d77972dd7d39188b637640c5fc355f47';
export const REINVITE_ASSETS=Object.freeze({"index.html": "d869110c8743d86f448159f214286707ae9a5f1ab9cf1370f14685284fff6e11", "hq_owner_console.js": "968fa8da9d3835c7891adaf9e4b8c8e997087c3f13f1b4d159f63645ed718b7d", "hq_store_onboarding_ui.js": "241bb73678abb0ce839b01f38f7f107186215930fc7ae6248d223a8ad649e12d"});
const allowed=new Set([".github/workflows/p0-pages-deploy.yml", ".github/workflows/qa-browser-app-smoke.yml", ".github/workflows/qa1243-live-e2e.yml", ".github/workflows/qa1243-owner-ready-pages-independent.yml", "PROJECT_BACKLOG_20261017.md", "hq_owner_console.js", "hq_store_onboarding_ui.js", "index.html", "qa_auth_role_journey_1243.mjs", "qa_hq_manager_fixed_height_938.mjs", "qa_hq_owner_browser_acceptance.mjs", "qa_hq_owner_role_guard_914.mjs", "qa_hq_store_admin_tabs_929.mjs", "qa_hq_store_onboarding_v1.mjs", "qa_hq_store_search_owner_activation_v1.mjs", "qa_manager_invitation_roles_926.mjs", "qa_manager_milestones_v1.mjs", "qa_manager_ux_feedback_935.mjs", "qa_owner_invite_autoactivation_921.mjs", "qa_store_admin_ui_polish_932.mjs", "qa_store_delegated_manager_v1.mjs", "qa_store_provenance_gate_v1.mjs", "scripts/qa1243_approved_opening_pages_smoke.mjs", "scripts/qa1243_friday_preflight.mjs", "scripts/qa1243_friday_preflight.test.mjs", "scripts/qa1243_hq_reinvite_release.mjs", "tests/qa1243_approved_opening_release.test.mjs", "tests/qa1243_hq_reinvite_actions.test.mjs", "tests/qa1243_hq_reinvite_browser.mjs", "tests/qa1243_hq_reinvite_release.test.mjs", "tests/qa1243_store_isolation_release.test.mjs"]);
export function assertHqReinviteRelease(files,message,before,{read=p=>readFileSync(p,'utf8')}={}){
 for(const marker of ['[QA1243-OWNER-REINVITE]','[QA1243-APP-PAGES]','[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('HQ_REINVITE_MARKER');
 if(before!==REINVITE_BASE)throw Error('HQ_REINVITE_PARENT');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>!allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('HQ_REINVITE_SCOPE');
 for(const [p,expected] of Object.entries(REINVITE_ASSETS)){
  if(!files.some(f=>f.filename===p))throw Error('HQ_REINVITE_ASSET_REQUIRED');
  if(createHash('sha256').update(read(p)).digest('hex')!==expected)throw Error('HQ_REINVITE_ASSET_BYTES');
 }
 const previous=read('index.html').replaceAll('v0.370','v0.369').replaceAll('20261027v370','20261027v369');
 if(createHash('sha256').update(previous).digest('hex')!=='446e6eb3617e7b2b1ccbc99080bf81dd0dc1dadfce13c8f3b16752a40b753d32')throw Error('HQ_REINVITE_NAVIGATION_DRIFT');
 return true;
}
