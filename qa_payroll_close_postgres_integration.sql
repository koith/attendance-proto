-- Isolated PostgreSQL 16 integration. No Supabase network access, production
-- credentials, personnel records, real PINs or live payroll writes.
\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid primary key,email text);
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('role',current_setting('request.jwt.claim.role',true))
$$;
CREATE TABLE public.stores(id bigint primary key,is_active boolean,onboarding_status text);
CREATE TABLE public.admin_users(user_id uuid primary key,admin_role text,store_id bigint);
CREATE TABLE public.employees(id bigint primary key,name text,store_id bigint,is_active boolean);
CREATE TABLE public.payroll_period(
  store_id bigint not null,ym text not null,status text not null,
  updated_by text,updated_at timestamptz default now(),
  primary key(store_id,ym)
);
CREATE TABLE public.payroll_snapshot(
  store_id bigint not null,ym text not null,employee_id bigint not null,
  employee_name text not null,hours numeric,wage integer,weeks integer,
  base_pay integer,juhyu_pay integer,adjust integer,gross_pay integer,
  tax_rate numeric,net_pay integer,memo text,source_fingerprint text,
  closed_by text,closed_at timestamptz default now(),
  primary key(store_id,ym,employee_id)
);
INSERT INTO public.stores VALUES(1,true,'READY'),(2,false,'STAGED');
INSERT INTO public.admin_users VALUES ('00000000-0000-4000-8000-000000000001','HQ',1);
INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001','qa@example.invalid');
INSERT INTO public.employees VALUES(1,'Synthetic employee',1,true),(2,'Another store',2,true);
SELECT set_config('request.jwt.claim.role','service_role',false);

-- Execute the real migration, not a mocked interpretation of its SQL.
\i supabase/migrations/20261012063000_payroll_close_require_nonnull_amounts.sql

CREATE OR REPLACE FUNCTION public.assert_payroll_close_error(
 p_row jsonb,p_error text,p_ym text default '2026-09',
 p_store bigint default 1) RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN
  PERFORM public.server_payroll_close_verified(
    p_store,p_ym,jsonb_build_array(p_row),repeat('a',64),
    '00000000-0000-4000-8000-000000000001'::uuid);
  RAISE EXCEPTION 'EXPECTED_REJECTION_WAS_MISSING';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS observed=MESSAGE_TEXT;
  IF observed IS DISTINCT FROM p_error THEN
    RAISE EXCEPTION 'Expected %, got %',p_error,observed;
  END IF;
 END;
END
$$;
CREATE OR REPLACE FUNCTION public.test_salary_json()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object(
   'employee_id',1,'employee_name','Synthetic employee',
   'hours',0,'wage',0,'weeks',0,
   'base_pay',800000,'juhyu_pay',0,'adjust',0,
   'gross_pay',800000,'tax_rate',0.033,'net_pay',773600,
   'memo','Synthetic salary: no punches')
$$;

DO $$
DECLARE good jsonb:=public.test_salary_json();
        key text;
BEGIN
 -- Presence is not enough: each required value must be a JSON number.
 FOREACH key IN ARRAY ARRAY['employee_id','hours','wage','weeks',
   'base_pay','juhyu_pay','adjust','gross_pay','tax_rate','net_pay']
 LOOP
  PERFORM public.assert_payroll_close_error(
    jsonb_set(good,ARRAY[key],'null'::jsonb),'PAYROLL_ROW_NONNUMERIC_OR_NULL');
  PERFORM public.assert_payroll_close_error(
    jsonb_set(good,ARRAY[key],'"garbage"'::jsonb),'PAYROLL_ROW_NONNUMERIC_OR_NULL');
  PERFORM public.assert_payroll_close_error(
    good-key,'PAYROLL_ROW_FIELDS_MISSING');
 END LOOP;
 PERFORM public.assert_payroll_close_error(
   jsonb_set(good,'{employee_name}','null'::jsonb),
   'PAYROLL_ROW_NONNUMERIC_OR_NULL');
 PERFORM public.assert_payroll_close_error(
   jsonb_set(good,'{employee_name}','4'::jsonb),
   'PAYROLL_ROW_NONNUMERIC_OR_NULL');
 IF EXISTS(SELECT 1 FROM public.payroll_snapshot) THEN
  RAISE EXCEPTION 'Rejected snapshots unexpectedly persisted';
 END IF;
END
$$;

-- The isolated anon role must not reach the privileged close routine.
SELECT set_config('request.jwt.claim.role','anon',false);
SELECT public.assert_payroll_close_error(public.test_salary_json(),'SERVICE_ONLY');
SELECT set_config('request.jwt.claim.role','service_role',false);
-- A staged / inactive store must never accept a close.
SELECT public.assert_payroll_close_error(public.test_salary_json(),'NOT_AUTHORIZED','2026-09',2);
-- No current/future payroll close, even with a legitimate salary.
SELECT public.assert_payroll_close_error(public.test_salary_json(),
 'CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE','2099-12');

-- Legitimate month with no timecards must be persisted atomically.
SELECT public.server_payroll_close_verified(
 1,'2026-09',jsonb_build_array(public.test_salary_json()),
 repeat('a',64),'00000000-0000-4000-8000-000000000001'::uuid);

DO $$
BEGIN
 IF (SELECT count(*) FROM public.payroll_snapshot
   WHERE store_id=1 AND ym='2026-09' AND hours=0 AND base_pay=800000
     AND gross_pay=800000 AND net_pay=773600)<>1 THEN
  RAISE EXCEPTION 'Valid zero-punch salaried close did not persist';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.payroll_period
   WHERE store_id=1 AND ym='2026-09' AND status='CLOSED') THEN
  RAISE EXCEPTION 'Close period missing';
 END IF;
END $$;

-- Repeating close must not silently replace the immutable monthly snapshot.
SELECT public.assert_payroll_close_error(public.test_salary_json(),
 'PAYROLL_ALREADY_CLOSED','2026-09');

-- Verified weekly-only arrears can be closed without current-month punches.
SELECT public.server_payroll_close_verified(
 1,'2026-08',jsonb_build_array(jsonb_build_object(
   'employee_id',1,'employee_name','Synthetic employee',
   'hours',0,'wage',12000,'weeks',0,'base_pay',0,'juhyu_pay',25000,
   'adjust',0,'gross_pay',25000,'tax_rate',0,'net_pay',25000)),
 repeat('b',64),'00000000-0000-4000-8000-000000000001'::uuid);

DO $$
BEGIN
 IF (SELECT count(*) FROM public.payroll_snapshot)<>2 THEN
  RAISE EXCEPTION 'Expected two distinct close snapshots';
 END IF;
 IF (SELECT juhyu_pay FROM public.payroll_snapshot
   WHERE ym='2026-08' AND store_id=1 AND employee_id=1)<>25000 THEN
  RAISE EXCEPTION 'Approved weekly-only accrual missing';
 END IF;
END $$;
\echo PASS: isolated real PostgreSQL close RPC rejects NULL fields, permits verified zero-punch earnings


-- Regression for the new immutable itemized close protocol. The existing two
-- historical snapshots remain readable with NULL component evidence.
\i supabase/migrations/20261012121500_payroll_close_allowance_component_snapshot.sql
DO $$
BEGIN
 IF (SELECT count(*) FROM public.payroll_snapshot
     WHERE night_allowance_won IS NULL AND break_compensation_won IS NULL
       AND substitution_pay_won IS NULL)<>2
 THEN RAISE EXCEPTION 'Old snapshots must preserve unknown component history'; END IF;
END $$;

SELECT public.assert_payroll_close_error(
 public.test_salary_json()||'{"night_allowance_won":null}'::jsonb,
 'PAYROLL_ALLOWANCE_COMPONENT_INVALID','2026-07');
SELECT public.assert_payroll_close_error(
 public.test_salary_json()||'{"break_compensation_won":"500"}'::jsonb,
 'PAYROLL_ALLOWANCE_COMPONENT_INVALID','2026-07');
SELECT public.assert_payroll_close_error(
 public.test_salary_json()||'{"substitution_pay_won":false}'::jsonb,
 'PAYROLL_ALLOWANCE_COMPONENT_INVALID','2026-07');
SELECT public.assert_payroll_close_error(
 public.test_salary_json()||'{"night_allowance_won":-1}'::jsonb,
 'PAYROLL_ROW_VALUE_INVALID','2026-07');
SELECT public.assert_payroll_close_error(
 public.test_salary_json()||'{"break_mode":"NOT_A_MODE"}'::jsonb,
 'PAYROLL_ROW_VALUE_INVALID','2026-07');

SELECT public.server_payroll_close_verified(
 1,'2026-07',jsonb_build_array(jsonb_build_object(
  'employee_id',1,'employee_name','Synthetic employee',
  'hours',8,'wage',12000,'weeks',0,
  'base_pay',100000,'juhyu_pay',0,'adjust',0,
  'gross_pay',117000,'tax_rate',0,'net_pay',117000,
  'night_allowance_won',10000,'break_compensation_won',5000,
  'substitution_pay_won',2000,'night_allowance_label','정률 50%',
  'break_mode','NOT_PROVIDED')),
 repeat('c',64),'00000000-0000-4000-8000-000000000001'::uuid);

DO $$
BEGIN
 IF (SELECT count(*) FROM public.payroll_snapshot
   WHERE store_id=1 AND ym='2026-07' AND employee_id=1
   AND gross_pay=117000 AND night_allowance_won=10000
   AND break_compensation_won=5000 AND substitution_pay_won=2000
   AND night_allowance_label='정률 50%' AND break_mode='NOT_PROVIDED')<>1
 THEN RAISE EXCEPTION 'Verified immutable allowance components did not persist'; END IF;
 IF (SELECT count(*) FROM public.payroll_snapshot)<>3
 THEN RAISE EXCEPTION 'Unexpected extra/overwritten salary snapshots'; END IF;
END $$;
\echo PASS: itemized night/break/substitution amounts persist; historical absence remains NULL; malformed payloads rejected

-- The actual manager-scoped snapshot projection now powers the closed UI.
-- Use the same isolated PostgreSQL fixture; never read or write live salaries.
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_store_id=1 AND current_setting('request.jwt.claim.role',true)='service_role'
$$;
\i supabase/migrations/20261012152500_closed_payroll_immutable_ui_snapshot.sql
DO $$
DECLARE closed jsonb;
BEGIN
 closed:=public.admin_store_snapshot(1,'2026-07')::jsonb;
 IF closed->>'status'<>'CLOSED' OR jsonb_array_length(closed->'rows')<>1 THEN
   RAISE EXCEPTION 'Immutable closed month is unavailable to authorized UI'; END IF;
 IF (closed->'rows'->0->>'gross_pay')::integer<>117000 OR
    (closed->'rows'->0->>'night_allowance_won')::integer<>10000 OR
    (closed->'rows'->0->>'break_compensation_won')::integer<>5000 OR
    (closed->'rows'->0->>'substitution_pay_won')::integer<>2000 OR
    closed->'rows'->0->>'night_allowance_label'<>'정률 50%' OR
    closed->'rows'->0->>'break_mode'<>'NOT_PROVIDED' THEN
   RAISE EXCEPTION 'Stored component evidence not available to manager UI'; END IF;
 closed:=public.admin_store_snapshot(1,'2026-09')::jsonb;
 IF closed->'rows'->0->>'night_allowance_won' IS NOT NULL OR
    closed->'rows'->0->>'break_compensation_won' IS NOT NULL THEN
   RAISE EXCEPTION 'Legacy missing allowance must remain unknown, not fabricated zero'; END IF;
END $$;
SELECT set_config('request.jwt.claim.role','anon',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.admin_store_snapshot(1,'2026-07');
  RAISE EXCEPTION 'UNAUTHORIZED_SNAPSHOT_EXPOSED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
END $$;
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.admin_store_snapshot(2,'2026-07');
  RAISE EXCEPTION 'CROSS_STORE_SNAPSHOT_EXPOSED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'NOT_AUTHORIZED' THEN RAISE; END IF;
 END;
END $$;
\echo PASS: real closed payroll snapshot RPC returns immutable gross and allowances; legacy unknowns and store scope honored


-- PAY-01: the production close routine must never report success without
-- reading back the EXACT immutable payload in the same transaction.
\i supabase/migrations/20261014001000_payroll_close_atomic_readback.sql
SELECT public.server_payroll_close_verified(
 1,'2026-05',jsonb_build_array(public.test_salary_json()),
 repeat('d',64),'00000000-0000-4000-8000-000000000001'::uuid);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.payroll_snapshot WHERE store_id=1 AND ym='2026-05'
      AND gross_pay=800000 AND net_pay=773600 AND source_fingerprint=repeat('d',64))<>1
 THEN RAISE EXCEPTION 'Verified legitimate close did not persist'; END IF;
END $$;

-- Synthetic trigger simulates a drift/corruption between the approved input
-- and physical row. Must fail and roll back BOTH period and snapshot.
CREATE FUNCTION public.qa_corrupt_snapshot_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 NEW.net_pay:=NEW.net_pay-1;
 RETURN NEW;
END $$;
CREATE TRIGGER qa_corrupt_snapshot_before_insert
  BEFORE INSERT ON public.payroll_snapshot FOR EACH ROW
  EXECUTE FUNCTION public.qa_corrupt_snapshot_before_insert();
SELECT public.assert_payroll_close_error(
 public.test_salary_json(),'PAYROLL_SNAPSHOT_READBACK_MISMATCH','2026-04');
DROP TRIGGER qa_corrupt_snapshot_before_insert ON public.payroll_snapshot;
DROP FUNCTION public.qa_corrupt_snapshot_before_insert();
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=1 AND ym='2026-04')
 OR EXISTS(SELECT 1 FROM public.payroll_snapshot WHERE store_id=1 AND ym='2026-04')
 THEN RAISE EXCEPTION 'Failed readback MUST roll back every close write'; END IF;
 IF (SELECT count(*) FROM public.payroll_snapshot)<>4
 THEN RAISE EXCEPTION 'The failed close corrupted earlier immutable snapshots'; END IF;
END $$;
\echo PASS: PAY-01 close readback rejects drift atomically and preserves old snapshots


-- Extra production-compatible two-person month-close verification: the
-- snapshot, UI projection, and original one-person historic rows must agree.
-- Synthetic fixture ONLY; never mutate the live payroll tables.
INSERT INTO public.employees(id,name,store_id,is_active)
VALUES(3,'Synthetic second',1,true);
DO $qa_multi$
DECLARE row2 jsonb; month_result jsonb; closed jsonb; duplicate_rejected boolean:=false;
        denied_other_store boolean:=false;
BEGIN
 row2:=jsonb_build_object(
   'employee_id',3,'employee_name','Synthetic second',
   'hours',4,'wage',12000,'weeks',1,'base_pay',48000,
   'juhyu_pay',22000,'adjust',0,'gross_pay',70000,
   'tax_rate',0.025,'net_pay',68250,
   'night_allowance_won',0,'break_compensation_won',0,
   'substitution_pay_won',0,'night_allowance_label','없음',
   'break_mode','PROVIDED');
 month_result:=public.server_payroll_close_verified(
   1,'2026-03',jsonb_build_array(public.test_salary_json(),row2),
   repeat('e',64),'00000000-0000-4000-8000-000000000001'::uuid);
 IF (month_result->>'count')::integer<>2 THEN
   RAISE EXCEPTION 'TWO_EMPLOYEE_CLOSE_DID_NOT_ATOMICALLY_RETURN_2: %',month_result;
 END IF;
 closed:=public.admin_store_snapshot(1,'2026-03')::jsonb;
 IF closed->>'status'<>'CLOSED' OR jsonb_array_length(closed->'rows')<>2 THEN
   RAISE EXCEPTION 'TWO_EMPLOYEE_CLOSED_UI_MISMATCH: %',closed;
 END IF;
 IF (SELECT sum(gross_pay) FROM public.payroll_snapshot
     WHERE store_id=1 AND ym='2026-03')<>870000
 OR (SELECT sum(net_pay) FROM public.payroll_snapshot
     WHERE store_id=1 AND ym='2026-03')<>841850 THEN
   RAISE EXCEPTION 'TWO_EMPLOYEE_STORED_PAY_NOT_RECONCILED';
 END IF;
 BEGIN
   PERFORM public.server_payroll_close_verified(
     1,'2026-02',jsonb_build_array(row2,row2),
     repeat('f',64),'00000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='DUPLICATE_PAYROLL_EMPLOYEE' THEN duplicate_rejected:=true;
   ELSE RAISE; END IF;
 END;
 IF NOT duplicate_rejected THEN RAISE EXCEPTION 'DUPLICATE_SNAPSHOT_ALLOWED'; END IF;
 BEGIN
   PERFORM public.server_payroll_close_verified(
     1,'2026-02',jsonb_build_array(
       jsonb_set(public.test_salary_json(),'{employee_id}','2'::jsonb)),
     repeat('f',64),'00000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='PAYROLL_EMPLOYEE_STORE_MISMATCH' THEN denied_other_store:=true;
   ELSE RAISE; END IF;
 END;
 IF NOT denied_other_store THEN RAISE EXCEPTION 'CROSS_STORE_CLOSE_ALLOWED'; END IF;
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE store_id=1 AND ym='2026-02')
 OR EXISTS(SELECT 1 FROM public.payroll_snapshot WHERE store_id=1 AND ym='2026-02')
 OR (SELECT count(*) FROM public.payroll_snapshot
     WHERE store_id=1 AND ym='2026-03')<>2 THEN
   RAISE EXCEPTION 'REJECTED_MULTI_CLOSE_MODIFIED_APPROVED_PAYROLL';
 END IF;
END $qa_multi$;

-- A source-fingerprint-corrupting trigger must roll back every new row
-- while retaining both employees from the prior valid close.
CREATE FUNCTION public.qa_corrupt_fingerprint_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.source_fingerprint:=repeat('0',64);RETURN NEW; END $$;
CREATE TRIGGER qa_corrupt_fingerprint_before_insert
BEFORE INSERT ON public.payroll_snapshot FOR EACH ROW
EXECUTE FUNCTION public.qa_corrupt_fingerprint_before_insert();
SELECT public.assert_payroll_close_error(
 public.test_salary_json(),'PAYROLL_SNAPSHOT_READBACK_MISMATCH','2026-02');
DROP TRIGGER qa_corrupt_fingerprint_before_insert ON public.payroll_snapshot;
DROP FUNCTION public.qa_corrupt_fingerprint_before_insert();
DO $qa_final$
BEGIN
 IF EXISTS(SELECT 1 FROM public.payroll_period WHERE ym='2026-02')
 OR EXISTS(SELECT 1 FROM public.payroll_snapshot WHERE ym='2026-02')
 OR (SELECT count(*) FROM public.payroll_snapshot
     WHERE store_id=1 AND ym='2026-03')<>2
 OR (SELECT count(*) FROM public.payroll_snapshot WHERE store_id=2)<>0 THEN
  RAISE EXCEPTION 'FINGERPRINT_CORRUPTION_DID_NOT_ROLL_BACK_SAFELY';
 END IF;
END $qa_final$;
\echo PASS: PAY-01 multiemployee immutable month close/UI readback, cross-store/duplicate rejection, corrupt-fingerprint rollback
