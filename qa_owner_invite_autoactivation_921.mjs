import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sql=fs.readFileSync('supabase/migrations/20261016_owner_invite_autoactivation_921.sql','utf8');
const activation=fs.readFileSync('owner_activation.js','utf8');
const page=fs.readFileSync('owner_activation.html','utf8');
const hq=fs.readFileSync('hq_owner_console.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const inviteMail=fs.readFileSync('supabase/email-templates/invite.html','utf8');
new vm.Script(activation,{filename:'owner_activation.js'});
new vm.Script(hq,{filename:'hq_owner_console.js'});

// A sent invitation creates a restricted pending intent, not an owner row.
assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.store_primary_owner_invitation_intents/);
assert.match(sql,/ALTER TABLE public\.store_primary_owner_invitation_intents ENABLE ROW LEVEL SECURITY/);
assert.match(sql,/IF coalesce\(auth\.jwt\(\)->>'role',''\) <> 'service_role'/);
assert.match(sql,/AND a\.admin_role='HQ'/);
assert.match(sql,/PERFORM pg_advisory_xact_lock/);
assert.match(sql,/PRIMARY_OWNER_ALREADY_ASSIGNED/);
assert.match(sql,/PENDING_OWNER_INVITE_EXISTS/);
assert.match(sql,/OWNER_INVITATION_EXPIRED/);
assert.match(sql,/EMAIL_CONFIRMATION_REQUIRED/);
assert.match(sql,/coalesce\(length\(u\.encrypted_password\),0\)>0/);
assert.match(sql,/v_uid:=auth\.uid\(\)/);
assert.match(sql,/INSERT INTO public\.store_primary_owners\(store_id,user_id,appointed_by\)/);
assert.match(sql,/VALUES\(v_store,v_uid,v_intent\.invited_by\)/);
assert.match(sql,/DELETE FROM public\.store_primary_owner_invitation_intents/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.store_primary_owner_accept_invitation\(\) FROM PUBLIC,anon/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.service_store_manager_attach_invited_user\(bigint,uuid,uuid\) FROM PUBLIC,anon,authenticated/);
assert.match(sql,/legacy_hq_invite_20261014/);

// Password PUT must precede server-only appointment. Never trust client store_id.
const passwordStep=activation.indexOf('"/auth/v1/user"');
const acceptStep=activation.indexOf('"/rest/v1/rpc/store_primary_owner_accept_invitation"');
const contextStep=activation.indexOf('"/rest/v1/rpc/admin_context"');
const redirectStep=activation.indexOf('location.replace("index.html?mode=store');
assert.ok(passwordStep>=0 && passwordStep<acceptStep && acceptStep<contextStep && contextStep<redirectStep);
assert.match(activation,/acceptedResponse\.ok\|\|accepted\?\.ok!==true/);
assert.match(activation,/Number\(accepted\.store_id\)!==storeId/);
assert.match(page,/owner_activation\.js\?v=20261016v295/);

// HQ must display pending vs appointed separately, with no second manual click.
assert.match(hq,/rpc\("hq_store_primary_owner_invitation_list"\)/);
assert.match(hq,/const pendingOwner=id=>/);
assert.match(hq,/대표 초대 대기 · 계정 활성화하면 자동 지정/);
assert.match(hq,/본사에서 다시 지정할 필요가 없습니다/);
assert.match(hq,/이미 대표 관리자 초대가 대기 중입니다/);
assert.match(html,/APP_VERSION="v0\.(?:295|296)"/);
assert.match(html,/id="appVersion">v0\.295</);
assert.match(html,/hq_owner_console\.js\?v=20261016v295/);
assert.match(inviteMail,/대표 권한 자동 확정 후 매장 입장/);
console.log('PASS #921: HQ owner invite, email+password guard, atomic activation, pending UX and versions');
