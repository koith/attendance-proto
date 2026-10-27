// One reviewed owner-only release. Runtime owner approval is NOT a deployment
// approval to run payroll, Sheets, mail, account changes or store activation.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const OPENING_BASE='3ef375e716d07dc88836e65d57d5636fbc0493c8';
export const OPENING_MIGRATION='supabase/migrations/20261027070217_approved_owner_auto_opening.sql';
export const OPENING_REQUIRED=Object.freeze(['index.html','hq_owner_console.js','hq_store_onboarding_ui.js',
 'owner_activation.html','owner_activation.js','owner_temp_activation.html','owner_temp_activation.js',
 'supabase/functions/server-sync-sheet/index.ts','edge-release/supabase/functions/server-sync-sheet/index.ts',
 OPENING_MIGRATION]);
const allowed=new Set([...OPENING_REQUIRED,'qa_store_owner_approved_opening.sql','qa_store_owner_approved_opening.mjs',
 'qa_owner_activation_retry_browser_1243.mjs','tests/qa1243_owner_temp_retry.test.mjs',
 'qa_owner_invite_autoactivation_921.mjs','qa_store_admin_ui_polish_932.mjs','qa_hq_store_admin_tabs_929.mjs',
 'qa_operational_readiness_fail_closed_v1.mjs','qa_store_opening_journey_browser_v1.mjs','qa_store_opening_browser_v1.mjs',
 'qa_hq_manager_fixed_height_938.mjs','qa_manager_invitation_roles_926.mjs','qa_hq_store_onboarding_v1.mjs','qa_manager_ux_feedback_935.mjs','qa_store_delegated_manager_v1.mjs','qa_hq_store_search_owner_activation_v1.mjs','qa_hq_owner_role_guard_914.mjs','qa_store_provenance_gate_v1.mjs','qa_manager_milestones_v1.mjs','scripts/qa1243_auth_config_verdict.test.mjs',
 'tests/qa1243_owner_recovery_paste.test.mjs','tests/qa1243_approved_opening_release.test.mjs',
 'scripts/qa1243_approved_opening_release.mjs','scripts/qa1243_approved_opening_pages_smoke.mjs',
 '.github/workflows/qa1243-approved-owner-opening.yml','.github/workflows/p0-pages-deploy.yml',
 '.github/workflows/qa1243-live-e2e.yml','.github/workflows/qa1243-owner-ready-pages-independent.yml',
 'scripts/qa1243_friday_preflight.mjs','scripts/qa1243_friday_preflight.test.mjs',
 'tests/qa1243_store_isolation_release.test.mjs','tests/qa1243_owner_temp_session.test.mjs',
 'qa_store_owner_temp_first_login_1243.mjs','qa_auth_role_journey_1243.sql','qa_auth_role_journey_1243.mjs','.github/workflows/qa1243-auth-role-journey.yml',
 '.github/workflows/qa-browser-app-smoke.yml','scripts/qa_browser_static_preview.mjs',
 'PROJECT_BACKLOG_20261017.md','docs/qa1243-approved-owner-opening.md']);
const sha=s=>createHash('sha256').update(s).digest('hex');
const oldDescription='점주 이메일 인증이 확인되면 새 비밀번호를 설정할 수 있습니다. 대표 권한 등록 후에도 지점 운영 개통은 본사 승인이 필요합니다.';
const newDescription='이메일 인증과 개인 비밀번호 설정 후 대표 관리자로 등록됩니다. 본사가 개통까지 승인한 초대는 바로 해당 지점 관리 화면으로 이동합니다.';
export function ownerModeOutside(source){
 const anchor='    if(mode==="issue_store_owner_temporary_password"){';
 const start=source.indexOf(anchor),end=source.indexOf('\n    if(mode===',start+anchor.length);
 if(start<0||end<=start||source.lastIndexOf(anchor)!==start)throw Error('OWNER_OPENING_EDGE_BOUNDARY');
 return source.slice(0,start)+source.slice(end);
}
export function assertApprovedOpeningRelease(files,message,before,{read=p=>readFileSync(p,'utf8')}={}){
 for(const marker of ['[QA1243-OWNER-OPENING]','[QA1243-APP-PAGES]',
  '[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])
  if(!message.includes(marker))throw Error('OWNER_OPENING_RELEASE_MARKER');
 if(before!==OPENING_BASE)throw Error('OWNER_OPENING_RELEASE_PARENT');
 if(!Array.isArray(files)||!files.length||files.length>=100||files.some(f=>
  !allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('OWNER_OPENING_RELEASE_SCOPE');
 if(!OPENING_REQUIRED.every(path=>files.some(f=>f.filename===path)))throw Error('OWNER_OPENING_RELEASE_MISSING_FILE');
 const index=read('index.html');
 if(!index.includes('const APP_VERSION="v0.369";')||
  sha(index.replaceAll('v0.369','v0.368')
   .replaceAll('hq_owner_console.js?v=20261027v369','hq_owner_console.js?v=20261020v352')
   .replaceAll('hq_store_onboarding_ui.js?v=20261027v369','hq_store_onboarding_ui.js?v=20261026v362'))
  !=='5ddbc196272ce5ea292997e787c316836034345f2d873fc37685a4a34a3f7a2d')throw Error('OWNER_OPENING_INDEX_DIFF');
 const activation=read('owner_activation.html');
 if(!activation.includes('owner_activation.js?v=20261027opening1')||
  sha(activation.replace('20261027opening1','20261027oneclick1'))!==
  '79e46e9c7af91b585ce22cd7de8b609a6de1aa3d2a7ed91e8d6dc7bac73676f0')throw Error('OWNER_OPENING_CALLBACK_HTML_DIFF');
 const temporary=read('owner_temp_activation.html');
 if(!temporary.includes('owner_temp_activation.js?v=20261027opening1')||
  sha(temporary.replace('20261027opening1','20261026resume1').replace(newDescription,oldDescription))!==
  'fb843e498c67b9d49e8a3b50102908e18421e167939b5f92b156a47ac4a2e573')throw Error('OWNER_OPENING_TEMP_HTML_DIFF');
 const edge=read('supabase/functions/server-sync-sheet/index.ts');
 if(edge!==read('edge-release/supabase/functions/server-sync-sheet/index.ts')||
  sha(ownerModeOutside(edge))!=='0e0050d55a5f886592ba4384e28bda199076573029c36cc6412688a03f5feeb5')
  throw Error('OWNER_OPENING_EDGE_NON_OWNER_CHANGE');
 const sql=read(OPENING_MIGRATION).replace(/(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?\1/g,()=>"'function body'")
  .replace(/--[^\n]*|\/\*[\s\S]*?\*\//g,'');
 if(/\b(?:UPDATE|INSERT|DELETE|TRUNCATE|DROP|COPY|DO|CALL|SELECT|PERFORM)\b/i.test(sql))
  throw Error('OWNER_OPENING_MIGRATION_OPERATING_WRITE');
 const alters=[...sql.matchAll(/ALTER\s+TABLE\b/gi)];
 const approved=[...sql.matchAll(/ALTER\s+TABLE\s+public\.(?:store_owner_temp_first_logins|store_primary_owner_invitation_intents)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+auto_open_after_accept\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false\s*;/gi)];
 if(alters.length!==2||approved.length!==2)throw Error('OWNER_OPENING_MIGRATION_COLUMN_SCOPE');
 const functions=new Set(['private.owner_opening_rules','public.service_store_owner_opening_preflight',
  'public.service_store_owner_temp_issue_for_opening','public.service_native_owner_invitation_issue_for_opening',
  'private.finish_approved_owner_opening','private.verified_completed_owner',
  'public.service_store_owner_invitation_resend_preflight','public.store_owner_temp_preflight',
  'public.native_owner_invitation_preflight','public.store_owner_temp_complete',
  'public.native_owner_invitation_complete','public.hq_store_owner_pending_list',
  'public.hq_store_owner_invitation_cancel']);
 for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)){
  if(/^(?:BEGIN|COMMIT)$/i.test(statement)||/^CREATE SCHEMA IF NOT EXISTS private$/i.test(statement)||
   /^NOTIFY pgrst, 'reload schema'$/i.test(statement)||/^ALTER TABLE public\./i.test(statement))continue;
  const fn=statement.match(/^CREATE OR REPLACE FUNCTION\s+([a-z_]+\.[a-z_]+)\s*\(/i)||
   statement.match(/^(?:REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION)\s+([a-z_]+\.[a-z_]+)\s*\(/i);
  if(!fn||!functions.has(fn[1]))throw Error('OWNER_OPENING_MIGRATION_FUNCTION_SCOPE');
 }
 return true;
}
