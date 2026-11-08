\set ON_ERROR_STOP on
-- Independent PostgreSQL 16/17 synthetic fixture. Entire test rolled back.
-- No production host, credentials, or employee information.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;
CREATE TABLE public.attendance_events
 (id bigint PRIMARY KEY,employee_id bigint,event_type text,event_at timestamp,device_id text);
CREATE TABLE public.event_corrections
 (id bigint PRIMARY KEY,employee_id bigint,event_id bigint,action text,reason text,created_by text);
CREATE TABLE public.correction_requests
 (id bigint PRIMARY KEY,employee_id bigint,kind text,status text,note text);
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
\i security/sec_a2_attendance_mutation_audit_v1.sql
\i security/sec_a2_audit_immutability_guard_v2.sql

INSERT INTO public.attendance_events VALUES (801,901,'IN','2026-11-08 01:00','SYNTHETIC');
INSERT INTO public.event_corrections VALUES (802,901,801,'ADD','SYNTHETIC','CI');
INSERT INTO public.correction_requests VALUES (803,901,'TIME','PENDING','SYNTHETIC');
UPDATE public.attendance_events SET event_type='OUT' WHERE id=801;
UPDATE public.event_corrections SET reason='SYNTHETIC_UPDATED' WHERE id=802;
UPDATE public.correction_requests SET status='APPROVED' WHERE id=803;
DELETE FROM public.attendance_events WHERE id=801;
DELETE FROM public.event_corrections WHERE id=802;
DELETE FROM public.correction_requests WHERE id=803;

DO $sec_a2_v2_test$
DECLARE
  n_before bigint;
  saved jsonb;
BEGIN
  SELECT count(*) INTO n_before FROM private.attendance_mutation_audit_v1;
  IF n_before<>6
     OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
         WHERE operation='UPDATE' AND row_before IS DISTINCT FROM row_after)<>3
     OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
         WHERE operation='DELETE' AND row_after IS NULL)<>3 THEN
    RAISE EXCEPTION 'SEC_A2_V2_SOURCE_CAPTURE_REGRESSION';
  END IF;
  SELECT row_before INTO saved FROM private.attendance_mutation_audit_v1 ORDER BY audit_id LIMIT 1;

  BEGIN
    UPDATE private.attendance_mutation_audit_v1 SET row_before='{}'::jsonb;
    RAISE EXCEPTION 'SEC_A2_V2_UPDATE_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT LIKE 'SEC_A2_AUDIT_IMMUTABLE_DENIED:%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM private.attendance_mutation_audit_v1;
    RAISE EXCEPTION 'SEC_A2_V2_DELETE_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT LIKE 'SEC_A2_AUDIT_IMMUTABLE_DENIED:%' THEN RAISE; END IF;
  END;
  BEGIN
    EXECUTE 'TRUNCATE private.attendance_mutation_audit_v1';
    RAISE EXCEPTION 'SEC_A2_V2_TRUNCATE_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT LIKE 'SEC_A2_AUDIT_IMMUTABLE_DENIED:%' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>n_before
     OR (SELECT row_before FROM private.attendance_mutation_audit_v1
          ORDER BY audit_id LIMIT 1) IS DISTINCT FROM saved
     OR (SELECT count(DISTINCT source_table)
         FROM private.attendance_mutation_audit_v1)<>3
     OR (SELECT count(*) FROM pg_trigger
         WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
           AND tgenabled='O' AND tgname LIKE 'sec_a2_audit_%')<>2 THEN
    RAISE EXCEPTION 'SEC_A2_V2_AUDIT_INTEGRITY_FAILURE';
  END IF;
END
$sec_a2_v2_test$;
ROLLBACK;
SELECT 'PASS SEC-A2 immutable audit PG fixture; UPDATE DELETE TRUNCATE blocked, source append preserved' AS result;
