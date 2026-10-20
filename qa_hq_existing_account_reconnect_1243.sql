-- Issue #1243: real additive reconnect RPC in isolated PostgreSQL only.
-- No production connection; all users, stores and IDs below are synthetic.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,email text UNIQUE NOT NULL,email_confirmed_at timestamptz,
 encrypted_password text,deleted_at timestamptz,is_anonymous boolean DEFAULT false,
 banned_until timestamptz
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('fixture.uid',true),'')::uuid $$;
CREATE TABLE public.stores(
 id bigint PRIMARY KEY,name text,onboarding_status text,is_active boolean
);
CREATE TABLE public.admin_users(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),email text,note text,
 admin_role text,store_id bigint REFERENCES public.stores(id)
);
CREATE TABLE public.store_primary_owners(
 store_id bigint PRIMARY KEY REFERENCES public.stores(id),
 user_id uuid NOT NULL REFERENCES public.admin_users(user_id),
 appointed_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.store_primary_owner_invitation_intents(
 store_id bigint PRIMARY KEY REFERENCES public.stores(id),
 user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
 invited_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.store_delegated_permissions(
 store_id bigint REFERENCES public.stores(id),
 user_id uuid REFERENCES public.admin_users(user_id),
 staff_edit boolean NOT NULL DEFAULT true,
 attendance_approve boolean NOT NULL DEFAULT true,
 payroll_view boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES auth.users(id),
 PRIMARY KEY(store_id,user_id)
);
CREATE OR REPLACE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE
 SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON u.id=a.user_id
 WHERE a.user_id=auth.uid() AND a.admin_role='HQ'
   AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND NOT u.is_anonymous
   AND (u.banned_until IS NULL OR u.banned_until<now())) $$;

INSERT INTO public.stores VALUES
 (1,'Synthetic INHA','READY',true),
 (701,'New staged store','STAGED',false),
 (702,'Other ready store','READY',true),
 (703,'Independent ready store','READY',true),
 (704,'Suspended store','SUSPENDED',false);
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)
SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 CASE i WHEN 1 THEN 'hq@synthetic.invalid' ELSE 'qa'||i||'@synthetic.invalid' END,
 CASE WHEN i=4 THEN NULL ELSE now() END,
 CASE WHEN i=6 THEN NULL ELSE 'synthetic-password-hash' END
FROM generate_series(1,9)i;
INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id) VALUES
 ('00000000-0000-4000-8000-000000000001','hq@synthetic.invalid','HQ original','HQ',NULL),
 ('00000000-0000-4000-8000-000000000005','qa5@synthetic.invalid','Other store','STORE_MANAGER',702),
 ('00000000-0000-4000-8000-000000000007','qa7@synthetic.invalid','Owner 703','STORE_MANAGER',703);
INSERT INTO public.store_primary_owners(store_id,user_id,appointed_by) VALUES
 (703,'00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001');

\i supabase/migrations/20261020093000_hq_verified_existing_account_reconnect.sql

CREATE OR REPLACE FUNCTION public.qa_expect_rejection(p_label text,p_sql text,p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'UNEXPECTED_SUCCESS';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM p_code
  THEN RAISE EXCEPTION '%: expected %, got %',p_label,p_code,observed; END IF;
 END;
END $$;
DO $test$ BEGIN
 IF has_function_privilege('anon','public.hq_store_existing_verified_account_connect(text,bigint,text)','EXECUTE')
 THEN RAISE EXCEPTION 'ANON_HAS_PRIVILEGE'; END IF;
END $test$;
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000002',false);
SELECT public.qa_expect_rejection('not HQ',
 $$SELECT public.hq_store_existing_verified_account_connect('qa2@synthetic.invalid',701,'OWNER')$$,'HQ_ONLY');
SELECT set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false);
SELECT public.qa_expect_rejection('HQ role protected',
 $$SELECT public.hq_store_existing_verified_account_connect('hq@synthetic.invalid',701,'OWNER')$$,'CANNOT_DOWNGRADE_HQ');
SELECT public.qa_expect_rejection('cross branch',
 $$SELECT public.hq_store_existing_verified_account_connect('qa5@synthetic.invalid',701,'OWNER')$$,'ACCOUNT_ALREADY_ASSIGNED');
SELECT public.qa_expect_rejection('unconfirmed',
 $$SELECT public.hq_store_existing_verified_account_connect('qa4@synthetic.invalid',701,'OWNER')$$,'VERIFIED_PASSWORD_ACCOUNT_REQUIRED');
SELECT public.qa_expect_rejection('email-only user',
 $$SELECT public.hq_store_existing_verified_account_connect('qa6@synthetic.invalid',701,'OWNER')$$,'VERIFIED_PASSWORD_ACCOUNT_REQUIRED');
SELECT public.qa_expect_rejection('no owner for assistant',
 $$SELECT public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',702,'ASSISTANT')$$,'ACTIVE_PRIMARY_OWNER_REQUIRED');
SELECT public.qa_expect_rejection('no assistant in staged branch',
 $$SELECT public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',701,'ASSISTANT')$$,'STORE_NOT_READY');
SELECT public.qa_expect_rejection('invalid role',
 $$SELECT public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',701,'HQ')$$,'INVALID_MANAGER_ROLE');
SELECT public.qa_expect_rejection('suspended branch',
 $$SELECT public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',704,'OWNER')$$,'STORE_NOT_ELIGIBLE');
DO $test$ DECLARE r jsonb; BEGIN
 r:=public.hq_store_existing_verified_account_connect('QA2@Synthetic.Invalid',701,'OWNER');
 IF r->>'ok'<>'true' OR r->>'intended_role'<>'OWNER'
 OR NOT EXISTS(SELECT 1 FROM public.store_primary_owners WHERE store_id=701
     AND user_id='00000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'OWNER_CONNECT_FAILED %',r; END IF;
 r:=public.hq_store_existing_verified_account_connect('qa2@synthetic.invalid',701,'OWNER');
 IF r->>'already_assigned'<>'true' THEN RAISE EXCEPTION 'RECONNECT_NOT_IDEMPOTENT'; END IF;
 IF (SELECT onboarding_status FROM public.stores WHERE id=701)<>'STAGED' OR
    (SELECT is_active FROM public.stores WHERE id=701) THEN
  RAISE EXCEPTION 'STAGED_WAS_ACTIVATED'; END IF;
END $test$;
SELECT public.qa_expect_rejection('other owner cannot replace',
 $$SELECT public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',701,'OWNER')$$,'PRIMARY_OWNER_ALREADY_ASSIGNED');
DO $test$ DECLARE r jsonb; BEGIN
 r:=public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',703,'ASSISTANT');
 IF r->>'ok'<>'true' OR NOT EXISTS (
  SELECT 1 FROM public.store_delegated_permissions
  WHERE store_id=703 AND user_id='00000000-0000-4000-8000-000000000003'
    AND NOT staff_edit AND NOT attendance_approve AND NOT payroll_view
 ) THEN RAISE EXCEPTION 'ASSISTANT_PERMS_NOT_DENIED %',r; END IF;
 r:=public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',703,'ASSISTANT');
 IF r->>'already_assigned'<>'true' THEN RAISE EXCEPTION 'ASSISTANT_NOT_IDEMPOTENT'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_primary_owners WHERE user_id=
  '00000000-0000-4000-8000-000000000003') THEN
  RAISE EXCEPTION 'ASSISTANT_WAS_PROMOTED'; END IF;
END $test$;
SELECT public.qa_expect_rejection('assistant cross branch',
 $$SELECT public.hq_store_existing_verified_account_connect('qa3@synthetic.invalid',701,'OWNER')$$,'ACCOUNT_ALREADY_ASSIGNED');
DO $test$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE admin_role='HQ' AND user_id=
   '00000000-0000-4000-8000-000000000001') OR
    (SELECT count(*) FROM public.admin_users WHERE admin_role='HQ')<>1 OR
    (SELECT onboarding_status FROM public.stores WHERE id=1)<>'READY' OR
    NOT (SELECT is_active FROM public.stores WHERE id=1)
 THEN RAISE EXCEPTION 'ORIGINAL_HQ_OR_INHA_MUTATED'; END IF;
END $test$;
\echo PASS #1243: HQ-only verified-owner & assistant connection, fail-closed grants, INHA/HQ preservation
