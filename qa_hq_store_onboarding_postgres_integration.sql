-- Synthetic P4 nationwide HQ activation integration. Disposable PostgreSQL ONLY.
-- No production accounts, owners, stores, contracts, attendances or payroll rows.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,
 email_confirmed_at timestamptz,
 deleted_at timestamptz,
 is_anonymous boolean DEFAULT false,
 banned_until timestamptz
);
CREATE OR REPLACE FUNCTION public.is_hq_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT current_setting('fixture.hq',true)='yes' $$;
CREATE TABLE public.stores(
 id bigint PRIMARY KEY,
 name text NOT NULL,
 source_store_key text,
 onboarding_status text NOT NULL DEFAULT 'STAGED',
 is_active boolean NOT NULL DEFAULT false,
 CONSTRAINT ready_active CHECK(is_active=(onboarding_status='READY'))
);
CREATE TABLE public.admin_users(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 admin_role text NOT NULL,
 store_id bigint REFERENCES public.stores(id)
);
CREATE TABLE public.employees(
 id bigint PRIMARY KEY,
 store_id bigint REFERENCES public.stores(id),
 name text,
 memo text
);
CREATE TABLE public.store_provenance_reviews(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id bigint REFERENCES public.stores(id),
 decision text NOT NULL
);
INSERT INTO public.stores(id,name,source_store_key,onboarding_status,is_active) VALUES
 (1,'Synthetic Inha','inha','READY',true),
 (2,'Synthetic staging 2','staged2','STAGED',false),
 (3,'Synthetic staging 3','staged3','STAGED',false);
INSERT INTO auth.users(id,email_confirmed_at,is_anonymous) VALUES
 ('00000000-0000-4000-8000-000000000010',now(),false),
 ('00000000-0000-4000-8000-000000000011',NULL,false);
INSERT INTO public.admin_users(user_id,admin_role,store_id) VALUES
 ('00000000-0000-4000-8000-000000000010','STORE_MANAGER',2);
SELECT set_config('fixture.hq','yes',false);

-- Install REAL checked-in final activation migration, including the safe
-- sample roster utility. No copies of the activation function body.
\i supabase/migrations/20261011130000_hq_sample_roster_activation_guard.sql

CREATE OR REPLACE FUNCTION public.assert_onboarding_error(
 p_id bigint,p_status text,p_error text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN
  PERFORM public.hq_store_onboarding_set(p_id,p_status);
  RAISE EXCEPTION 'EXPECTED_REJECTION_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM p_error THEN
   RAISE EXCEPTION 'Expected %, got %',p_error,observed;
  END IF;
 END;
END $$;

SELECT set_config('fixture.hq','no',false);
SELECT public.assert_onboarding_error(2,'READY','NOT_AUTHORIZED');
SELECT set_config('fixture.hq','yes',false);
SELECT public.assert_onboarding_error(1,'SUSPENDED','INHA_PRODUCTION_LOCK');
SELECT public.assert_onboarding_error(2,'UNKNOWN','BAD_ONBOARDING_STATUS');
SELECT public.assert_onboarding_error(999,'READY','STORE_NOT_FOUND');
-- READY cannot be enabled by manager presence alone without a verified source.
SELECT public.assert_onboarding_error(2,'READY','PROVENANCE_VERIFICATION_REQUIRED');
INSERT INTO public.store_provenance_reviews(store_id,decision) VALUES(2,'VERIFIED');
INSERT INTO public.employees(id,store_id,name,memo) VALUES
 (20,2,'Real-looking demo fixture','샘플 지점 직원');
SELECT public.assert_onboarding_error(2,'READY','DEMO_EMPLOYEES_REQUIRE_REVIEW');
DELETE FROM public.employees WHERE id=20; -- disposable synthetic fixture only
INSERT INTO public.employees(id,store_id,name,memo) VALUES
 (21,2,'테스트 직원','safe');
SELECT public.assert_onboarding_error(2,'READY','DEMO_EMPLOYEES_REQUIRE_REVIEW');
DELETE FROM public.employees WHERE id=21; -- disposable synthetic fixture only
-- First unconfirmed manager does not qualify, regardless of raw role assignment.
UPDATE auth.users SET email_confirmed_at=NULL
 WHERE id='00000000-0000-4000-8000-000000000010';
SELECT public.assert_onboarding_error(2,'READY','CONFIRMED_STORE_MANAGER_REQUIRED');
UPDATE auth.users SET email_confirmed_at=now(),banned_until=now()+interval '1 day'
 WHERE id='00000000-0000-4000-8000-000000000010';
SELECT public.assert_onboarding_error(2,'READY','CONFIRMED_STORE_MANAGER_REQUIRED');
UPDATE auth.users SET banned_until=NULL,deleted_at=now()
 WHERE id='00000000-0000-4000-8000-000000000010';
SELECT public.assert_onboarding_error(2,'READY','CONFIRMED_STORE_MANAGER_REQUIRED');
UPDATE auth.users SET deleted_at=NULL,is_anonymous=true
 WHERE id='00000000-0000-4000-8000-000000000010';
SELECT public.assert_onboarding_error(2,'READY','CONFIRMED_STORE_MANAGER_REQUIRED');
UPDATE auth.users SET is_anonymous=false WHERE id='00000000-0000-4000-8000-000000000010';

-- Safe READY path: verified provenance + no demo staff + verified real manager.
DO $$
DECLARE result jsonb;
BEGIN
 result:=public.hq_store_onboarding_set(2,'READY');
 IF result->>'status'<>'READY' OR result->>'provenance_verified'<>'true'
    OR (result->>'manager_count')::integer<>1
    OR NOT EXISTS(select 1 from public.stores where id=2 and is_active
      and onboarding_status='READY') THEN
   RAISE EXCEPTION 'Legitimate branch activation unexpectedly failed';
 END IF;
END $$;

-- Other branch 3 remains STAGED; store activation never crosses boundaries.
DO $$
BEGIN
 IF EXISTS(select 1 from public.stores where id=3 and is_active) THEN
  RAISE EXCEPTION 'OTHER_STORE_ACTIVATED';
 END IF;
END $$;

-- An HQ suspension must remove public active flag at the same instant.
SELECT public.hq_store_onboarding_set(2,'SUSPENDED');
DO $$
BEGIN
 IF EXISTS(select 1 from public.stores where id=2 and is_active) OR
    (select onboarding_status from public.stores where id=2)<>'SUSPENDED'
    OR (select onboarding_status from public.stores where id=1)<>'READY' THEN
  RAISE EXCEPTION 'Suspension or Inha guard failed';
 END IF;
END $$;

-- Later revocation of evidence invalidates READY reactivation.
INSERT INTO public.store_provenance_reviews(store_id,decision) VALUES(2,'REJECTED');
SELECT public.assert_onboarding_error(2,'READY','PROVENANCE_VERIFICATION_REQUIRED');
SELECT set_config('fixture.hq','no',false);
DO $$
DECLARE observed text;
BEGIN
 BEGIN PERFORM count(*) FROM public.hq_store_sample_roster_counts();
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
 END;
 IF observed IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
  RAISE EXCEPTION 'Sample roster info leaked outside HQ';
 END IF;
END $$;

-- Full-scale gate rehearsal: populate all 283 published branch identifiers
-- inside the disposable PostgreSQL instance, without generating any real owner.
INSERT INTO public.stores(id,name,source_store_key,onboarding_status,is_active)
SELECT i,'Synthetic store '||i,'synthetic:'||i,'STAGED',false
FROM generate_series(4,283) AS i;
DO $check_283$
DECLARE total bigint;ready bigint;staged bigint;suspended bigint;
BEGIN
 SELECT count(*),count(*) FILTER(WHERE onboarding_status='READY'),
 count(*) FILTER(WHERE onboarding_status='STAGED'),
 count(*) FILTER(WHERE onboarding_status='SUSPENDED')
 INTO total,ready,staged,suspended FROM public.stores;
 IF total<>283 OR ready<>1 OR staged<>281 OR suspended<>1 THEN
  RAISE EXCEPTION '283_STORE_LIFECYCLE_WRONG %/%/%/%',total,ready,staged,suspended;
 END IF;
 IF EXISTS(SELECT 1 FROM public.stores WHERE id>3 AND is_active) THEN
  RAISE EXCEPTION 'UNVERIFIED_STORE_AUTO_ACTIVATED';
 END IF;
END $check_283$;

\echo PASS: HQ store READY requires provenance, no demo, verified manager; INHA and other branches isolated
