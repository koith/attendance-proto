-- #1000: Real owner invitation migration acceptance in disposable PostgreSQL ONLY.
-- Synthetic auth users and branch IDs. No Supabase network or production write.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,email text UNIQUE,email_confirmed_at timestamptz,
 encrypted_password text,invited_at timestamptz,deleted_at timestamptz,
 is_anonymous boolean DEFAULT false,banned_until timestamptz
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('fixture.uid',true),'')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('role',current_setting('fixture.role',true)) $$;
CREATE TABLE public.stores(
 id bigint PRIMARY KEY,code text,name text,
 onboarding_status text NOT NULL DEFAULT 'STAGED',is_active boolean DEFAULT false
);
CREATE TABLE public.admin_users(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 email text,note text,admin_role text,store_id bigint REFERENCES public.stores(id)
);
CREATE TABLE public.store_primary_owners(
 store_id bigint PRIMARY KEY REFERENCES public.stores(id),
 user_id uuid NOT NULL REFERENCES public.admin_users(user_id),
 appointed_at timestamptz DEFAULT now(),appointed_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.store_admin_memberships(store_id bigint,user_id uuid);
CREATE OR REPLACE FUNCTION public.is_hq_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users
 WHERE user_id=auth.uid() AND admin_role='HQ') $$;
INSERT INTO public.stores(id,code,name) VALUES
 (701,'QA701','QA store 701'),(702,'QA702','QA store 702'),(703,'QA703','QA store 703');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password,invited_at)
VALUES
 ('00000000-0000-4000-8000-000000000001','hq@synthetic.invalid',now(),'synthetic-hash',now()),
 ('00000000-0000-4000-8000-000000000002','owner@synthetic.invalid',NULL,NULL,now()),
 ('00000000-0000-4000-8000-000000000003','assistant@synthetic.invalid',now(),'synthetic-hash',now()),
 ('00000000-0000-4000-8000-000000000004','owner2@synthetic.invalid',now(),'synthetic-hash',now()),
 ('00000000-0000-4000-8000-000000000005','revoked@synthetic.invalid',NULL,NULL,now());
INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
VALUES('00000000-0000-4000-8000-000000000001','hq@synthetic.invalid','HQ','HQ',NULL),
 ('00000000-0000-4000-8000-000000000003','assistant@synthetic.invalid','Delegated store administrator','STORE_MANAGER',701);
\i supabase/migrations/20261016_owner_invite_autoactivation_921.sql

-- Install real checked-in invitation RPC and verify service-only attachment.
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
DO $test$
DECLARE msg text;
BEGIN
 BEGIN
  PERFORM public.service_store_manager_attach_invited_user(
    701,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'UNEXPECTED_SERVICE_ROLE_BYPASS';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'SERVICE_ONLY' THEN RAISE EXCEPTION 'Expected SERVICE_ONLY, got %',msg; END IF;
 END;
END $test$;
SELECT set_config('fixture.role','service_role',false);
SELECT public.service_store_manager_attach_invited_user(
 701,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');

-- Email not yet confirmed; no owner is appointed.
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000002',false);
DO $test$
DECLARE msg text;
BEGIN
 BEGIN
  PERFORM public.store_primary_owner_accept_invitation();
  RAISE EXCEPTION 'UNCONFIRMED_OWNER_WAS_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'EMAIL_CONFIRMATION_REQUIRED' THEN
   RAISE EXCEPTION 'Expected email confirmation gate, got %',msg;
  END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.store_primary_owners) THEN
  RAISE EXCEPTION 'UNCONFIRMED_OWNER_APPOINTED';
 END IF;
END $test$;
UPDATE auth.users SET email_confirmed_at=now(),encrypted_password='synthetic-hash'
 WHERE email='owner@synthetic.invalid';
DO $test$
DECLARE r jsonb;
BEGIN
 r:=public.store_primary_owner_accept_invitation();
 IF r->>'ok'<>'true' OR r->>'owner_assigned'<>'true'
 OR (r->>'store_id')::bigint<>701 THEN RAISE EXCEPTION 'OWNER_ACCEPT_FAILURE %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_primary_owners
  WHERE store_id=701 AND user_id='00000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'WRONG_OWNER_APPOINTED'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=701)
 THEN RAISE EXCEPTION 'ACCEPTED_INVITE_NOT_CONSUMED'; END IF;
 r:=public.store_primary_owner_accept_invitation();
 IF r->>'already_owner'<>'true' THEN RAISE EXCEPTION 'REPEAT_ACCEPT_NOT_IDEMPOTENT'; END IF;
END $test$;

-- Assistant activation: same endpoint returns owner_assigned=false.
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000003',false);
DO $test$
DECLARE r jsonb;
BEGIN
 r:=public.store_primary_owner_accept_invitation();
 IF r->>'ok'<>'true' OR r->>'owner_assigned'<>'false'
 THEN RAISE EXCEPTION 'ASSISTANT_INCORRECTLY_PROMOTED %',r; END IF;
 IF (SELECT user_id FROM public.store_primary_owners WHERE store_id=701)
 <>'00000000-0000-4000-8000-000000000002'::uuid THEN
 RAISE EXCEPTION 'ASSISTANT_REPLACED_OWNER'; END IF;
END $test$;

-- Second store activation does not alter first store.
SELECT set_config('fixture.role','service_role',false);
SELECT public.service_store_manager_attach_invited_user(
 702,'00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001');
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000004',false);
DO $test$
BEGIN
 PERFORM public.store_primary_owner_accept_invitation();
 IF (SELECT count(*) FROM public.store_primary_owners WHERE store_id IN(701,702))<>2
 THEN RAISE EXCEPTION 'CROSS_STORE_OWNER_LOSS'; END IF;
END $test$;

-- Revoked invite may never become a manager/owner, even if email confirms.
SELECT set_config('fixture.role','service_role',false);
SELECT public.service_store_manager_attach_invited_user(
 703,'00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001');
DELETE FROM public.admin_users WHERE user_id='00000000-0000-4000-8000-000000000005';
UPDATE auth.users SET email_confirmed_at=now(),encrypted_password='synthetic-hash'
 WHERE email='revoked@synthetic.invalid';
SELECT set_config('fixture.role','authenticated',false);
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000005',false);
DO $test$
DECLARE msg text;
BEGIN
 BEGIN
  PERFORM public.store_primary_owner_accept_invitation();
  RAISE EXCEPTION 'REVOKED_INVITE_WAS_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'STORE_MANAGER_REQUIRED' THEN RAISE EXCEPTION 'Expected revoked manager gate, got %',msg; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.store_primary_owner_invitation_intents WHERE store_id=703)
 OR EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=703)
 THEN RAISE EXCEPTION 'REVOKED_INVITE_OR_OWNER_LEFT_ACTIVE'; END IF;
END $test$;
DO $test$
BEGIN
 IF has_function_privilege('anon','public.store_primary_owner_accept_invitation()','EXECUTE')
 OR has_function_privilege('authenticated','public.service_store_manager_attach_invited_user(bigint,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'AUTHZ_PERMISSION_LEAK'; END IF;
END $test$;
\echo PASS: actual owner invitation migration, password+email, assistant not promoted, cross-store, revoke and service role
