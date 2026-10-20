-- Issue #1243, QA-04/05 and safe cleanup: disposable PostgreSQL 16 only.
-- This script executes the shipped invitation migrations, not a copied implementation.
-- Actual SMTP, GoTrue user creation, Sheets API and real device are NOT exercised.
-- Any "auth invitation", "password" or "READY" mutation below is synthetic data.
\set ON_ERROR_STOP on
\i qa_invitation_preflight_1243.sql

-- Emulate the protected production invariants in the disposable fixture.
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('00000000-0000-4000-8000-000000000013','hq2@synthetic.invalid',now(),'synthetic-hash'),
 ('00000000-0000-4000-8000-000000000014','hq3@synthetic.invalid',now(),'synthetic-hash');
INSERT INTO public.admin_users(user_id,email,admin_role,store_id) VALUES
 ('00000000-0000-4000-8000-000000000013','hq2@synthetic.invalid','HQ',NULL),
 ('00000000-0000-4000-8000-000000000014','hq3@synthetic.invalid','HQ',NULL);
ALTER TABLE public.stores ADD COLUMN qa_cleanup_marker text;
CREATE TABLE public.qa1243_employees(
 id bigint PRIMARY KEY,store_id bigint NOT NULL REFERENCES public.stores(id),
 name text NOT NULL
);
CREATE TABLE public.qa1243_attendance(
 id bigint PRIMARY KEY,employee_id bigint NOT NULL REFERENCES public.qa1243_employees(id),
 minutes integer NOT NULL
);
CREATE TABLE public.qa1243_payroll(
 employee_id bigint PRIMARY KEY REFERENCES public.qa1243_employees(id),
 amount integer NOT NULL
);
CREATE TABLE public.qa1243_sheet_projection(
 store_id bigint NOT NULL REFERENCES public.stores(id),employee_id bigint NOT NULL,
 amount integer NOT NULL,PRIMARY KEY(store_id,employee_id)
);
CREATE TABLE public.qa1243_recipe_overrides(
 store_id bigint NOT NULL REFERENCES public.stores(id),menu_key text NOT NULL,
 instructions text NOT NULL,PRIMARY KEY(store_id,menu_key)
);
INSERT INTO public.qa1243_employees(id,store_id,name)
 SELECT 100+i,1,'Protected synthetic INHA staff '||i FROM generate_series(1,10)i;
INSERT INTO public.qa1243_recipe_overrides VALUES (1,'AMERICANO','protected-original');
INSERT INTO public.stores(id,name,onboarding_status,is_active,qa_cleanup_marker) VALUES
 (705,'QA1243 DISPOSABLE ALPHA','STAGED',false,'QA1243-ISOLATED'),
 (706,'QA1243 DISPOSABLE BETA','STAGED',false,'QA1243-ISOLATED');

-- New Auth identity / invitation uses the actual dispatched-account preflight.
SELECT set_config('fixture.role','service_role',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
DO $qa$ DECLARE r jsonb; BEGIN
 r:=public.service_store_invitation_dispatch_preflight(
  705,'qa10@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER');
 IF r->>'delivery'<>'INVITE' OR r->>'existing_auth_user'<>'false'
 THEN RAISE EXCEPTION 'NEW_AUTH_INVITE_DISPATCH_WRONG %',r; END IF;
END $qa$;
-- Simulates GoTrue's new invitation response, NOT an actual Auth API network call.
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)
 VALUES('00000000-0000-4000-8000-000000000010','qa10@synthetic.invalid',NULL,NULL);
SELECT public.service_store_manager_attach_invited_user(
 705,'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001');
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000010',false);
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','EMAIL_CONFIRMATION_REQUIRED');
-- Simulates email receipt, confirmed Auth session and password set.
UPDATE auth.users SET email_confirmed_at=now(),encrypted_password='synthetic-hash'
 WHERE id='00000000-0000-4000-8000-000000000010';
DO $qa$ DECLARE r jsonb;BEGIN
 r:=public.store_invitation_activation_preflight();
 IF r->>'intended_role'<>'OWNER' OR r->>'store_id'<>'705'
 THEN RAISE EXCEPTION 'OWNER_PREFLIGHT_FAILED %',r;END IF;
 r:=public.store_primary_owner_accept_invitation();
 IF r->>'owner_assigned'<>'true'
 OR NOT EXISTS(SELECT 1 FROM public.store_primary_owners
  WHERE store_id=705 AND user_id='00000000-0000-4000-8000-000000000010')
 THEN RAISE EXCEPTION 'OWNER_ACTIVATION_FAILED %',r;END IF;
 IF (SELECT onboarding_status FROM public.stores WHERE id=705)<>'STAGED'
 THEN RAISE EXCEPTION 'OWNER_ACTIVATION_ESCALATED_STORE_READINESS';END IF;
END $qa$;
-- This READY switch is synthetic. Actual HQ provenance/READY RPC executes
-- independently in qa_hq_store_onboarding_postgres_integration.sql.
UPDATE public.stores SET onboarding_status='READY',is_active=true WHERE id=705;

-- Explicit verified existing-account connection for delegated assistant.
-- Existing-account reconnect is intentionally distinct from sending an Auth invite.
ALTER TABLE public.store_delegated_permissions
 ADD COLUMN granted_by uuid REFERENCES auth.users(id);
\i supabase/migrations/20261020093000_hq_verified_existing_account_reconnect.sql
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)
 VALUES('00000000-0000-4000-8000-000000000011','qa11@synthetic.invalid',now(),'synthetic-hash');
SELECT set_config('fixture.role','service_role',false);
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(
 705,'qa11@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_ASSISTANT')$$,
 'USE_EXISTING_VERIFIED_ACCOUNT');
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
DO $qa$ DECLARE r jsonb;BEGIN
 r:=public.hq_store_existing_verified_account_connect('QA11@Synthetic.Invalid',705,'ASSISTANT');
 IF r->>'ok'<>'true' OR r->>'intended_role'<>'ASSISTANT'
 OR NOT EXISTS (SELECT 1 FROM public.store_delegated_permissions
    WHERE store_id=705 AND user_id='00000000-0000-4000-8000-000000000011'
      AND NOT staff_edit AND NOT attendance_approve AND NOT payroll_view)
 THEN RAISE EXCEPTION 'EXISTING_ACCOUNT_ASSISTANT_FAILED %',r;END IF;
END $qa$;
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000011',false);
DO $qa$ BEGIN
 IF (public.store_invitation_activation_preflight()->>'intended_role')<>'ASSISTANT'
 THEN RAISE EXCEPTION 'ASSISTANT_CANNOT_AUTHENTICATE';END IF;
END $qa$;
-- A permission change cannot accidentally write to another branch.
UPDATE public.store_delegated_permissions SET staff_edit=true
 WHERE store_id=705 AND user_id='00000000-0000-4000-8000-000000000011';
DO $qa$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.store_delegated_permissions
   WHERE store_id=705 AND staff_edit AND NOT attendance_approve AND NOT payroll_view)
 OR EXISTS(SELECT 1 FROM public.store_delegated_permissions
   WHERE store_id<>705 AND user_id='00000000-0000-4000-8000-000000000011')
 THEN RAISE EXCEPTION 'DELEGATED_SCOPE_LEAK';END IF;
END $qa$;
-- Revoke a manager then attempt to reuse the old, unexpired synthetic token.
DELETE FROM public.store_delegated_permissions
 WHERE store_id=705 AND user_id='00000000-0000-4000-8000-000000000011';
DELETE FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000011';
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','INVITATION_CANCELLED_OR_NOT_FOUND');

-- Second branch: cancellation/re-invitation, expiry, password recovery path.
SELECT set_config('fixture.role','service_role',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)
 VALUES('00000000-0000-4000-8000-000000000012','qa12@synthetic.invalid',NULL,NULL);
SELECT public.service_store_manager_attach_invited_user(
 706,'00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001');
DELETE FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000012';
DO $qa$ BEGIN
 IF EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=706)
 THEN RAISE EXCEPTION 'CANCEL_DID_NOT_REVOKE_INTENT';END IF;
END $qa$;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='00000000-0000-4000-8000-000000000012';
DO $qa$ DECLARE r jsonb;BEGIN
 r:=public.service_store_invitation_dispatch_preflight(
 706,'qa12@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER');
 IF r->>'delivery'<>'RECOVERY' THEN RAISE EXCEPTION 'REINVITE_RECOVERY_NOT_SELECTED %',r; END IF;
END $qa$;
SELECT public.service_store_manager_attach_invited_user(
 706,'00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001');
UPDATE public.store_primary_owner_invitation_intents
 SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE store_id=706;
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000012',false);
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','OWNER_INVITATION_EXPIRED');
-- Simulate recovery confirmation/password reset. Expired invite still rejects.
UPDATE auth.users SET encrypted_password='synthetic-recovered-hash'
 WHERE id='00000000-0000-4000-8000-000000000012';
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','OWNER_INVITATION_EXPIRED');
SELECT set_config('fixture.role','service_role',false);
SELECT public.service_store_manager_attach_invited_user(
 706,'00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001');
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000012',false);
DO $qa$ BEGIN
 IF (public.store_invitation_activation_preflight()->>'intended_role')<>'OWNER'
 THEN RAISE EXCEPTION 'REISSUED_EXPIRED_INVITATION_NOT_REACTIVATED';END IF;
END $qa$;

-- A tiny synthetic cross-branch projection tests that store IDs remain disjoint.
-- Real payroll, attendance, recipe and Sheet engines have separate actual-source
-- tests in the same workflow, not this synthetic auxiliary projection.
INSERT INTO public.qa1243_employees VALUES (70501,705,'Alpha employee'),(70601,706,'Beta employee');
INSERT INTO public.qa1243_attendance VALUES (70501,70501,360),(70601,70601,240);
INSERT INTO public.qa1243_payroll VALUES (70501,45000),(70601,30000);
INSERT INTO public.qa1243_sheet_projection VALUES (705,70501,45000),(706,70601,30000);
INSERT INTO public.qa1243_recipe_overrides VALUES
 (705,'AMERICANO','alpha-only-override'),(706,'AMERICANO','beta-only-override');
DO $qa$ BEGIN
 IF (SELECT count(*) FROM public.qa1243_employees WHERE store_id=1)<>10
 OR (SELECT count(*) FROM public.admin_users WHERE admin_role='HQ')<>3
 OR (SELECT amount FROM public.qa1243_sheet_projection WHERE store_id=705)<>45000
 OR (SELECT amount FROM public.qa1243_sheet_projection WHERE store_id=706)<>30000
 OR (SELECT instructions FROM public.qa1243_recipe_overrides WHERE store_id=1) <> 'protected-original'
 OR (SELECT instructions FROM public.qa1243_recipe_overrides WHERE store_id=706) <> 'beta-only-override'
 THEN RAISE EXCEPTION 'SYNTHETIC_BRANCH_DATA_LEAK';END IF;
END $qa$;

-- Fail-closed cleanup: require a unique QA marker, STAGED, no live references,
-- and a verified archive. No generalized delete or CASCADE on a real store.
CREATE OR REPLACE FUNCTION public.qa1243_disposable_cleanup(p_store_id bigint)
RETURNS void LANGUAGE plpgsql AS $cleanup$
DECLARE v_store public.stores%ROWTYPE;
BEGIN
 SELECT * INTO v_store FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF NOT FOUND OR p_store_id<=1 OR v_store.qa_cleanup_marker IS DISTINCT FROM 'QA1243-ISOLATED'
 OR v_store.name NOT LIKE 'QA1243 DISPOSABLE %'
 THEN RAISE EXCEPTION 'QA_CLEANUP_NOT_DISPOSABLE';END IF;
 IF v_store.onboarding_status<>'STAGED' OR v_store.is_active
 THEN RAISE EXCEPTION 'QA_CLEANUP_ACTIVE_STORE';END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE store_id=p_store_id)
 OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=p_store_id)
 OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=p_store_id)
 OR EXISTS(SELECT 1 FROM public.qa1243_employees WHERE store_id=p_store_id)
 OR EXISTS(SELECT 1 FROM public.qa1243_sheet_projection WHERE store_id=p_store_id)
 OR EXISTS(SELECT 1 FROM public.qa1243_recipe_overrides WHERE store_id=p_store_id)
 THEN RAISE EXCEPTION 'QA_CLEANUP_REFERENCED';END IF;
 DELETE FROM public.stores WHERE id=p_store_id AND qa_cleanup_marker='QA1243-ISOLATED';
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_CLEANUP_TARGET_CHANGED';END IF;
END $cleanup$;
SELECT public.qa_preflight_reject(
 'SELECT public.qa1243_disposable_cleanup(1)','QA_CLEANUP_NOT_DISPOSABLE');
SELECT public.qa_preflight_reject(
 'SELECT public.qa1243_disposable_cleanup(703)','QA_CLEANUP_NOT_DISPOSABLE');
SELECT public.qa_preflight_reject(
 'SELECT public.qa1243_disposable_cleanup(705)','QA_CLEANUP_ACTIVE_STORE');
SELECT public.qa_preflight_reject(
 'SELECT public.qa1243_disposable_cleanup(706)','QA_CLEANUP_REFERENCED');

-- Archive the exact QA-owned rows and verify before any cleanup mutation.
CREATE TEMP TABLE qa1243_archive_stores AS
 SELECT * FROM public.stores WHERE id IN(705,706) AND qa_cleanup_marker='QA1243-ISOLATED';
CREATE TEMP TABLE qa1243_archive_employees AS
 SELECT * FROM public.qa1243_employees WHERE store_id IN(705,706);
CREATE TEMP TABLE qa1243_archive_attendance AS
 SELECT a.* FROM public.qa1243_attendance a JOIN qa1243_archive_employees e ON e.id=a.employee_id;
CREATE TEMP TABLE qa1243_archive_payroll AS
 SELECT p.* FROM public.qa1243_payroll p JOIN qa1243_archive_employees e ON e.id=p.employee_id;
CREATE TEMP TABLE qa1243_archive_sheet AS
 SELECT * FROM public.qa1243_sheet_projection WHERE store_id IN(705,706);
CREATE TEMP TABLE qa1243_archive_recipe AS
 SELECT * FROM public.qa1243_recipe_overrides WHERE store_id IN(705,706);
DO $qa$ BEGIN
 IF (SELECT count(*) FROM qa1243_archive_stores)<>2
 OR (SELECT count(*) FROM qa1243_archive_employees)<>2
 OR (SELECT count(*) FROM qa1243_archive_attendance)<>2
 OR (SELECT count(*) FROM qa1243_archive_payroll)<>2
 OR (SELECT count(*) FROM qa1243_archive_sheet)<>2
 OR (SELECT count(*) FROM qa1243_archive_recipe)<>2
 THEN RAISE EXCEPTION 'QA_CLEANUP_ARCHIVE_INCOMPLETE';END IF;
END $qa$;
UPDATE public.stores SET onboarding_status='STAGED',is_active=false WHERE id=705;
SELECT public.qa_preflight_reject(
 'SELECT public.qa1243_disposable_cleanup(705)','QA_CLEANUP_REFERENCED');

-- Explicitly prune only archived synthetic store IDs, in FK order.
DELETE FROM public.qa1243_payroll WHERE employee_id IN
 (SELECT id FROM qa1243_archive_employees);
DELETE FROM public.qa1243_attendance WHERE employee_id IN
 (SELECT id FROM qa1243_archive_employees);
DELETE FROM public.qa1243_sheet_projection WHERE store_id IN(705,706);
DELETE FROM public.qa1243_recipe_overrides WHERE store_id IN(705,706);
DELETE FROM public.qa1243_employees WHERE store_id IN(705,706);
DELETE FROM public.store_delegated_permissions WHERE store_id IN(705,706);
DELETE FROM public.store_primary_owners WHERE store_id IN(705,706);
DELETE FROM public.admin_users WHERE store_id IN(705,706);
SELECT public.qa1243_disposable_cleanup(705);
SELECT public.qa1243_disposable_cleanup(706);
DELETE FROM auth.users WHERE id IN(
 '00000000-0000-4000-8000-000000000010',
 '00000000-0000-4000-8000-000000000011',
 '00000000-0000-4000-8000-000000000012');
DO $qa$ BEGIN
 IF EXISTS(SELECT 1 FROM public.stores WHERE id IN(705,706))
 OR EXISTS(SELECT 1 FROM public.qa1243_employees WHERE store_id IN(705,706))
 OR EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id IN(705,706))
 OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(
   '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000011',
   '00000000-0000-4000-8000-000000000012'))
 OR (SELECT count(*) FROM public.admin_users WHERE admin_role='HQ')<>3
 OR (SELECT count(*) FROM public.qa1243_employees WHERE store_id=1)<>10
 OR (SELECT onboarding_status FROM public.stores WHERE id=1)<>'READY'
 OR NOT (SELECT is_active FROM public.stores WHERE id=1)
 OR (SELECT instructions FROM public.qa1243_recipe_overrides WHERE store_id=1)<>'protected-original'
 THEN RAISE EXCEPTION 'QA_CLEANUP_DAMAGED_PROTECTED_OR_LEFT_RESIDUE';END IF;
END $qa$;
\echo PASS #1243 isolated lifecycle: new Auth invite + real SQL owner acceptance + existing verified assistant connect, revoke, cancel/reissue, expiry/recovery synthetic proof, store/employee/sheet/recipe scoping, archived QA-only cleanup, HQ3+INHA10 preserved.
