-- #1243: real migration execution against disposable synthetic PostgreSQL 16.
\set ON_ERROR_STOP on
\i qa_store_opening_owner_activation_postgres.sql
CREATE TABLE public.store_delegated_permissions(
 store_id bigint REFERENCES public.stores(id),
 user_id uuid REFERENCES public.admin_users(user_id) ON DELETE CASCADE,
 staff_edit boolean NOT NULL DEFAULT false,
 attendance_approve boolean NOT NULL DEFAULT false,
 payroll_view boolean NOT NULL DEFAULT false,
 PRIMARY KEY(store_id,user_id)
);
CREATE OR REPLACE FUNCTION public.store_primary_owner_can_delegate(
 p_store_id bigint,p_actor_id uuid) RETURNS boolean
 LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.store_primary_owners o
 JOIN public.stores s ON s.id=o.store_id
 WHERE o.store_id=p_store_id AND o.user_id=p_actor_id AND s.is_active
 AND s.onboarding_status='READY') $$;
UPDATE public.stores SET onboarding_status='READY',is_active=true WHERE id IN(701,702);
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('00000000-0000-4000-8000-000000000006','pending@synthetic.invalid',NULL,NULL),
 ('00000000-0000-4000-8000-000000000007','verified@synthetic.invalid',now(),'synthetic-hash'),
 ('00000000-0000-4000-8000-000000000008','recovery@synthetic.invalid',now(),NULL),
 ('00000000-0000-4000-8000-000000000009','assistant2@synthetic.invalid',now(),NULL);
\i supabase/migrations/20261020121000_invitation_dispatch_activation_preflight_1243.sql

CREATE FUNCTION public.qa_preflight_reject(p_stmt text,p_code text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE got text;
BEGIN
 BEGIN
  EXECUTE p_stmt;
  RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS got=MESSAGE_TEXT;
  IF got<>p_code THEN RAISE EXCEPTION 'Expected %, got %',p_code,got; END IF;
 END;
END $fn$;
DO $qa$ BEGIN
 IF has_function_privilege('anon','public.store_invitation_activation_preflight()','EXECUTE')
 OR has_function_privilege('anon','public.service_store_invitation_dispatch_preflight(bigint,text,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.service_store_invitation_dispatch_preflight(bigint,text,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'INVITE_PREFLIGHT_PRIVILEGE_EXPOSED'; END IF;
END $qa$;

SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'pending@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER')$$,'SERVICE_ONLY');
SELECT set_config('fixture.role','service_role',false);
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'pending@synthetic.invalid','00000000-0000-4000-8000-000000000002','HQ_OWNER')$$,'HQ_ONLY');
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'hq@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER')$$,'CANNOT_DOWNGRADE_HQ');
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'assistant@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER')$$,'ACCOUNT_ALREADY_ASSIGNED');
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'verified@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER')$$,'USE_EXISTING_VERIFIED_ACCOUNT');
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'pending@synthetic.invalid','00000000-0000-4000-8000-000000000001','STORE_ASSISTANT')$$,'OWNER_ONLY');
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(703,'pending@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_ASSISTANT')$$,'STORE_NOT_READY');
SELECT public.qa_preflight_reject(
 $$SELECT public.service_store_invitation_dispatch_preflight(701,'pending@synthetic.invalid','00000000-0000-4000-8000-000000000001','HQ_OWNER')$$,'PRIMARY_OWNER_ALREADY_ASSIGNED');
DO $qa$ DECLARE r jsonb; BEGIN
 r:=public.service_store_invitation_dispatch_preflight(703,'pending@synthetic.invalid',
  '00000000-0000-4000-8000-000000000001','HQ_OWNER');
 IF r->>'delivery'<>'INVITE' OR r->>'existing_auth_user'<>'true'
 THEN RAISE EXCEPTION 'UNCONFIRMED_AUTH_ACCOUNT_NOT_REINVITABLE: %',r; END IF;
 r:=public.service_store_invitation_dispatch_preflight(703,'recovery@synthetic.invalid',
  '00000000-0000-4000-8000-000000000001','HQ_OWNER');
 IF r->>'delivery'<>'RECOVERY'
    OR r->>'user_id'<>'00000000-0000-4000-8000-000000000008'
 THEN RAISE EXCEPTION 'CONFIRMED_PASSWORDLESS_NOT_RECOVERABLE: %',r; END IF;
END $qa$;

-- Pending invitation remains scoped; user must verify email to proceed.
SELECT public.service_store_manager_attach_invited_user(
 703,'00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001');
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000006',false);
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','EMAIL_CONFIRMATION_REQUIRED');
UPDATE auth.users SET email_confirmed_at=now()
 WHERE id='00000000-0000-4000-8000-000000000006';
DO $qa$ DECLARE r jsonb;BEGIN
 r:=public.store_invitation_activation_preflight();
 IF r->>'intended_role'<>'OWNER' OR r->>'store_id'<>'703'
 THEN RAISE EXCEPTION 'PENDING_OWNER_PRECHECK_FAILED: %',r; END IF;
END $qa$;
UPDATE public.store_primary_owner_invitation_intents SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE store_id=703;
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','OWNER_INVITATION_EXPIRED');
UPDATE public.store_primary_owner_invitation_intents SET created_at=now(),expires_at=now()+interval '1 day' WHERE store_id=703;
-- This is cancellation of a disposable synthetic invitation only.
DELETE FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000006';
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','INVITATION_CANCELLED_OR_NOT_FOUND');
SELECT set_config('fixture.role','service_role',false);
DO $qa$ DECLARE r jsonb; BEGIN
 r:=public.service_store_invitation_dispatch_preflight(703,'pending@synthetic.invalid',
  '00000000-0000-4000-8000-000000000001','HQ_OWNER');
 IF r->>'delivery'<>'RECOVERY' THEN RAISE EXCEPTION 'CANCEL_REINVITE_PRECHECK_FAILED: %',r; END IF;
END $qa$;
SELECT public.service_store_manager_attach_invited_user(
 703,'00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001');
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000006',false);
DO $qa$ BEGIN
 IF (public.store_invitation_activation_preflight()->>'intended_role')<>'OWNER'
 THEN RAISE EXCEPTION 'REINVITED_OWNER_NOT_VALID'; END IF;
END $qa$;
-- Revoked assistant may not use even a still-valid Auth token.
INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
 VALUES('00000000-0000-4000-8000-000000000009','assistant2@synthetic.invalid',
 'Invited by HQ as assistant','STORE_MANAGER',701);
INSERT INTO public.store_delegated_permissions(store_id,user_id) VALUES
 (701,'00000000-0000-4000-8000-000000000009');
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000009',false);
DO $qa$ DECLARE r jsonb;BEGIN
 r:=public.store_invitation_activation_preflight();
 IF r->>'intended_role'<>'ASSISTANT' OR r->>'store_id'<>'701'
 THEN RAISE EXCEPTION 'ASSISTANT_ROLE_MISMATCH: %',r; END IF;
END $qa$;
DELETE FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000009';
SELECT public.qa_preflight_reject(
 'SELECT public.store_invitation_activation_preflight()','INVITATION_CANCELLED_OR_NOT_FOUND');
DO $qa$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE admin_role='HQ' AND user_id=
 '00000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'HQ_ACCOUNT_CORRUPTION'; END IF;
END $qa$;
\echo PASS #1243 dispatch preflight, cancel/reinvite, recovery, expired/verified assistants without production writes
