-- Disposable PostgreSQL ONLY. No production host, SMTP, Auth API or Sheets.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,email_confirmed_at timestamptz,
 encrypted_password text,invited_at timestamptz,deleted_at timestamptz,
 is_anonymous boolean DEFAULT false,banned_until timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('fixture.uid',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('role',current_setting('fixture.role',true)) $$;
CREATE TABLE public.stores(id bigint PRIMARY KEY,code text,name text,source_store_key text,
 onboarding_status text NOT NULL DEFAULT 'STAGED',is_active boolean NOT NULL DEFAULT false);
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY REFERENCES auth.users,
 email text,note text,admin_role text,store_id bigint REFERENCES public.stores);
CREATE TABLE public.store_primary_owners(store_id bigint PRIMARY KEY REFERENCES public.stores,
 user_id uuid UNIQUE NOT NULL REFERENCES auth.users,appointed_by uuid REFERENCES auth.users,
 appointed_at timestamptz DEFAULT now());
CREATE TABLE public.store_admin_memberships(store_id bigint,user_id uuid);
CREATE TABLE public.employees(id bigint PRIMARY KEY,store_id bigint,name text,memo text);
CREATE TABLE public.store_provenance_reviews(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id bigint,decision text);
CREATE FUNCTION public.is_hq_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=auth.uid() AND admin_role='HQ') $$;
CREATE FUNCTION public.fixture_uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
 SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION public.fixture_identity(r text,n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('fixture.uid',public.fixture_uid(n)::text,false);
 PERFORM set_config('fixture.role',r,false);
END $$;
CREATE FUNCTION public.fixture_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION_FAILED: %',label; END IF; END $$;
CREATE FUNCTION public.fixture_expect(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failure text;
BEGIN
 BEGIN EXECUTE statement; RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS failure=MESSAGE_TEXT;
  IF failure NOT LIKE expected||'%' THEN RAISE EXCEPTION 'Expected %, got %',expected,failure; END IF;
 END;
END $$;
CREATE FUNCTION public.fixture_personal(n integer) RETURNS void LANGUAGE sql AS $$
 UPDATE auth.users SET email_confirmed_at=now(),
 encrypted_password=extensions.crypt('Personal password 123!',extensions.gen_salt('bf',4))
 WHERE id=public.fixture_uid(n) $$;
INSERT INTO public.stores(id,code,name,source_store_key)
 SELECT n,'QA'||n,'QA store '||n,'isolated-qa' FROM generate_series(701,730) n;
INSERT INTO public.store_provenance_reviews(store_id,decision)
 SELECT id,'VERIFIED' FROM public.stores;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password,invited_at)
 SELECT public.fixture_uid(n),CASE WHEN n=1 THEN 'hq@qa.invalid' ELSE 'owner'||n||'@qa.invalid' END,
 now(),extensions.crypt('Initial password 123!',extensions.gen_salt('bf',4)),now()
 FROM generate_series(701,730) n UNION ALL
 SELECT public.fixture_uid(1),'hq@qa.invalid',now(),
 extensions.crypt('HQ password 123!',extensions.gen_salt('bf',4)),now();
INSERT INTO public.admin_users(user_id,email,admin_role)
 VALUES(public.fixture_uid(1),'hq@qa.invalid','HQ');
\i supabase/migrations/20261016_owner_invite_autoactivation_921.sql
\i supabase/migrations/20261026094500_qa1243_owner_temp_first_login.sql
\i supabase/migrations/20261026115000_qa1243_native_owner_invite_after_password.sql
\i :opening_migration

-- Unapproved legacy temp acceptance stays STAGED; approving isn't inferred.
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue(701,public.fixture_uid(701),public.fixture_uid(1));
SELECT public.fixture_assert((SELECT NOT auto_open_after_accept FROM public.store_owner_temp_first_logins WHERE store_id=701),'legacy approval false');
SELECT public.fixture_personal(701),public.fixture_identity('authenticated',701);
SELECT public.fixture_assert((public.store_owner_temp_complete('Personal password 123!')->>'store_opened')::boolean=false,'legacy temp not opened');
SELECT public.fixture_assert((SELECT onboarding_status='STAGED' AND NOT is_active FROM public.stores WHERE id=701),'legacy state preserved');
SELECT 'PASS legacy temp claim never becomes implicit opening approval';

-- A new, explicitly approved temp invitation atomically appoints and opens.
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue_for_opening(702,public.fixture_uid(702),public.fixture_uid(1),true);
SELECT public.fixture_identity('authenticated',702);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Initial password 123!')$q$,'PERSONAL_PASSWORD_NOT_VERIFIED');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.admin_users WHERE store_id=702),'password proof before role');
SELECT public.fixture_personal(702);
SELECT public.fixture_assert((public.store_owner_temp_preflight()->>'auto_open_after_accept')::boolean,'temp preflight shows approval');
SELECT public.fixture_assert((public.store_owner_temp_complete('Personal password 123!')->>'store_opened')::boolean,'approved temp opened');
SELECT public.fixture_assert((SELECT onboarding_status='READY' AND is_active FROM public.stores WHERE id=702),'temp READY');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.store_owner_temp_first_logins WHERE store_id=702),'temp intent consumed');
SELECT public.fixture_assert((public.store_owner_temp_complete('Personal password 123!')->>'already_completed')::boolean,'lost response retry idempotent');
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('wrong password 123!')$q$,'NO_VERIFIED_COMPLETED_OWNER');
SELECT 'PASS approved temp password/owner/READY atomicity and response-loss retry';

-- Native invites likewise require mailbox confirmation and matching password.
UPDATE auth.users SET email_confirmed_at=NULL,encrypted_password=NULL WHERE id=public.fixture_uid(703);
SELECT public.fixture_identity('service_role',1);
SELECT public.service_native_owner_invitation_issue_for_opening(703,public.fixture_uid(703),public.fixture_uid(1),'owner703@qa.invalid',true);
SELECT public.fixture_identity('authenticated',703);
SELECT public.fixture_expect($q$SELECT public.native_owner_invitation_preflight()$q$,'AUTH_CONFIRMATION_REQUIRED');
SELECT public.fixture_personal(703);
SELECT public.fixture_assert((public.native_owner_invitation_preflight()->>'auto_open_after_accept')::boolean,'native preflight approval');
SELECT public.fixture_expect($q$SELECT public.native_owner_invitation_complete('wrong password 123!')$q$,'PERSONAL_PASSWORD_NOT_VERIFIED');
SELECT public.fixture_assert((public.native_owner_invitation_complete('Personal password 123!')->>'store_opened')::boolean,'approved native opened');
SELECT public.fixture_assert((public.native_owner_invitation_complete('Personal password 123!')->>'already_completed')::boolean,'native completion retry');
SELECT 'PASS native confirmation/password proof and atomic READY';

SELECT public.fixture_identity('service_role',1);
SELECT public.service_native_owner_invitation_issue(704,public.fixture_uid(704),public.fixture_uid(1),'owner704@qa.invalid');
SELECT public.fixture_personal(704),public.fixture_identity('authenticated',704);
SELECT public.fixture_assert((public.native_owner_invitation_complete('Personal password 123!')->>'store_opened')::boolean=false,'legacy native stays staged');

-- Invalid source/sample data rejects the new claim, without a half approval.
INSERT INTO public.store_provenance_reviews(store_id,decision) VALUES(705,'REJECTED');
SELECT public.fixture_identity('service_role',1);
SELECT public.fixture_expect($q$SELECT public.service_store_owner_temp_issue_for_opening(705,public.fixture_uid(705),public.fixture_uid(1),true)$q$,'PROVENANCE_VERIFICATION_REQUIRED');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.store_owner_temp_first_logins WHERE store_id=705),'bad proof rolls back claim');
INSERT INTO public.employees VALUES(1,706,'직원','데모 샘플');
SELECT public.fixture_expect($q$SELECT public.service_native_owner_invitation_issue_for_opening(706,public.fixture_uid(706),public.fixture_uid(1),'owner706@qa.invalid',true)$q$,'DEMO_EMPLOYEES_REQUIRE_REVIEW');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.store_primary_owner_invitation_intents WHERE store_id=706),'sample rejection rolls back claim');

-- Recheck source and HQ validity at acceptance; failure rolls all role writes back.
SELECT public.service_store_owner_temp_issue_for_opening(707,public.fixture_uid(707),public.fixture_uid(1),true);
INSERT INTO public.store_provenance_reviews(store_id,decision) VALUES(707,'REJECTED');
SELECT public.fixture_personal(707),public.fixture_identity('authenticated',707);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Personal password 123!')$q$,'PROVENANCE_VERIFICATION_REQUIRED');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.admin_users WHERE store_id=707),'role rollback on changed provenance');
SELECT public.fixture_assert((SELECT count(*)=1 FROM public.store_owner_temp_first_logins WHERE store_id=707),'failed acceptance preserves claim');
INSERT INTO public.store_provenance_reviews(store_id,decision) VALUES(707,'VERIFIED');
SELECT public.fixture_assert((public.store_owner_temp_complete('Personal password 123!')->>'store_opened')::boolean,'fixed proof resumes without password reset');
SELECT public.fixture_identity('service_role',1);
SELECT public.service_native_owner_invitation_issue_for_opening(708,public.fixture_uid(708),public.fixture_uid(1),'owner708@qa.invalid',true);
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=public.fixture_uid(1);
SELECT public.fixture_personal(708),public.fixture_identity('authenticated',708);
SELECT public.fixture_expect($q$SELECT public.native_owner_invitation_complete('Personal password 123!')$q$,'HQ_OPENING_APPROVAL_REQUIRED');
SELECT public.fixture_assert((SELECT count(*)=0 FROM public.admin_users WHERE store_id=708),'revoked HQ rollback');
UPDATE auth.users SET banned_until=NULL WHERE id=public.fixture_uid(1);
SELECT public.fixture_assert((public.native_owner_invitation_complete('Personal password 123!')->>'store_opened')::boolean,'restored HQ approval resumes existing password');
SELECT 'PASS changed provenance or revoked HQ cannot open or partially appoint';

-- Suspended, expired, canceled and cross-user invitations remain closed.
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue_for_opening(709,public.fixture_uid(709),public.fixture_uid(1),true);
UPDATE public.stores SET onboarding_status='SUSPENDED' WHERE id=709;
SELECT public.fixture_personal(709),public.fixture_identity('authenticated',709);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Personal password 123!')$q$,'STAGED_STORE_REQUIRED');
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue_for_opening(710,public.fixture_uid(710),public.fixture_uid(1),true);
UPDATE public.store_owner_temp_first_logins SET issued_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE store_id=710;
SELECT public.fixture_personal(710),public.fixture_identity('authenticated',710);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Personal password 123!')$q$,'TEMP_OWNER_CREDENTIAL_EXPIRED');
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue_for_opening(711,public.fixture_uid(711),public.fixture_uid(1),true);
SELECT public.fixture_identity('authenticated',1);
SELECT public.hq_store_owner_invitation_cancel(711,public.fixture_uid(711));
SELECT public.fixture_personal(711),public.fixture_identity('authenticated',711);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Personal password 123!')$q$,'NO_VERIFIED_COMPLETED_OWNER');
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue_for_opening(712,public.fixture_uid(712),public.fixture_uid(1),true);
SELECT public.fixture_personal(713),public.fixture_identity('authenticated',713);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Personal password 123!')$q$,'NO_VERIFIED_COMPLETED_OWNER');
SELECT public.fixture_assert((SELECT onboarding_status='STAGED' AND NOT is_active FROM public.stores WHERE id=712),'cross-user never opens target');

-- Reinvitation without a fresh approval cannot inherit a canceled approval.
SELECT public.fixture_identity('service_role',1);
SELECT public.service_native_owner_invitation_issue_for_opening(714,public.fixture_uid(714),public.fixture_uid(1),'owner714@qa.invalid',true);
DELETE FROM public.store_primary_owner_invitation_intents WHERE store_id=714;
SELECT public.service_native_owner_invitation_issue_for_opening(714,public.fixture_uid(714),public.fixture_uid(1),'owner714@qa.invalid',false);
SELECT public.fixture_personal(714),public.fixture_identity('authenticated',714);
SELECT public.fixture_assert((public.native_owner_invitation_complete('Personal password 123!')->>'store_opened')::boolean=false,'reinvite approval not inherited');

-- Resend is read-only: approval and expiry remain exactly the same.
SELECT public.fixture_identity('service_role',1);
SELECT public.service_store_owner_temp_issue_for_opening(715,public.fixture_uid(715),public.fixture_uid(1),true);
CREATE TEMP TABLE resend_before AS SELECT to_jsonb(c) data FROM public.store_owner_temp_first_logins c WHERE store_id=715;
SELECT public.fixture_assert((public.service_store_owner_invitation_resend_preflight(715,'owner715@qa.invalid',public.fixture_uid(1))->>'auto_open_after_accept')::boolean,'resend retains approval');
SELECT public.fixture_assert((SELECT data=(SELECT to_jsonb(c) FROM public.store_owner_temp_first_logins c WHERE store_id=715) FROM resend_before),'resend no claim changes');
SELECT public.fixture_expect($q$SELECT public.service_store_owner_invitation_resend_preflight(715,'wrong@qa.invalid',public.fixture_uid(1))$q$,'NO_VALID_OWNER_INVITATION');
SELECT public.fixture_expect($q$SELECT public.service_store_owner_invitation_resend_preflight(710,'owner710@qa.invalid',public.fixture_uid(1))$q$,'NO_VALID_OWNER_INVITATION');
SELECT public.fixture_expect($q$SELECT public.service_store_owner_temp_issue_for_opening(715,public.fixture_uid(715),public.fixture_uid(1),true)$q$,'OWNER_OR_INVITATION_ALREADY_EXISTS');
SELECT public.fixture_expect($q$SELECT public.service_store_owner_temp_issue_for_opening(716,public.fixture_uid(715),public.fixture_uid(1),true)$q$,'ACCOUNT_ALREADY_ASSIGNED');
SELECT 'PASS cancel/expire/suspend/cross-user/resend/reinvite boundaries';

-- A normal recipient/assistant cannot forge the HQ-approved overload.
SELECT public.fixture_identity('authenticated',716);
SELECT public.fixture_expect($q$SELECT public.service_store_owner_temp_issue_for_opening(716,public.fixture_uid(716),public.fixture_uid(1),true)$q$,'SERVICE_ONLY');
SELECT public.fixture_identity('service_role',1);
SELECT public.fixture_expect($q$SELECT public.service_store_owner_opening_preflight(716,public.fixture_uid(701))$q$,'HQ_OPENING_APPROVAL_REQUIRED');
SELECT public.fixture_identity('authenticated',1);
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.hq_store_owner_pending_list() p WHERE p->>'store_id'='715' AND p->>'user_id'=public.fixture_uid(715)::text),'HQ pending list includes temporary owner');
SELECT public.fixture_assert(EXISTS(SELECT 1 FROM public.hq_store_owner_pending_list() p WHERE p->>'store_id'='710' AND p->>'account_state'='EXPIRED'),'HQ can cancel expired claims');
SELECT public.fixture_expect($q$SELECT public.hq_store_owner_invitation_cancel(703,public.fixture_uid(703))$q$,'OWNER_ALREADY_ASSIGNED');
SELECT public.fixture_identity('authenticated',715);
SELECT public.fixture_expect($q$SELECT * FROM public.hq_store_owner_pending_list()$q$,'HQ_ONLY');
SELECT public.fixture_expect($q$SELECT public.hq_store_owner_invitation_cancel(715,public.fixture_uid(715))$q$,'HQ_ONLY');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.service_store_owner_temp_issue_for_opening(bigint,uuid,uuid,boolean)','EXECUTE'),'recipient cannot approve');
SELECT public.fixture_assert(NOT has_function_privilege('anon','public.store_owner_temp_complete(text)','EXECUTE'),'anonymous cannot complete');
SELECT public.fixture_assert(NOT has_function_privilege('authenticated','private.finish_approved_owner_opening(bigint,uuid,uuid)','EXECUTE'),'private opener not public');
SELECT public.fixture_assert(NOT has_table_privilege('authenticated','public.store_owner_temp_first_logins','UPDATE'),'approval flag not recipient writable');
DELETE FROM public.store_primary_owners WHERE store_id=702;
DELETE FROM public.admin_users WHERE store_id=702;
SELECT public.fixture_identity('authenticated',702);
SELECT public.fixture_expect($q$SELECT public.store_owner_temp_complete('Personal password 123!')$q$,'NO_VERIFIED_COMPLETED_OWNER');
SELECT 'PASS role revocation cannot be undone by completion replay';
SELECT 'PASS all approved-owner opening SQL scenarios (real disposable PostgreSQL)';
