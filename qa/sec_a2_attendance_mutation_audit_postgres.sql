\set ON_ERROR_STOP on
-- Only PG16/17 disposable fixture. No production DB host or credentials.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;
CREATE TABLE public.attendance_events (
 id bigint PRIMARY KEY, employee_id bigint NOT NULL,
 event_type text, event_at timestamp, device_id text
);
CREATE TABLE public.event_corrections (
 id bigint PRIMARY KEY, employee_id bigint, event_id bigint,
 action text,reason text,created_by text
);
CREATE TABLE public.correction_requests (
 id bigint PRIMARY KEY,employee_id bigint,kind text,status text,note text
);
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
INSERT INTO public.attendance_events VALUES (1,100,'IN','2026-11-08 12:00','SYNTHETIC_ONLY');
INSERT INTO public.event_corrections VALUES (10,100,1,'ADD','SYNTHETIC_ONLY','CI');
INSERT INTO public.correction_requests VALUES (20,100,'TIME','PENDING','SYNTHETIC_ONLY');
\i security/sec_a2_attendance_mutation_audit_v1.sql
DO $check_initial$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>0 THEN
  RAISE EXCEPTION 'SEC_A2_MIGRATION_SELFTEST_LEFT_SYNTHETIC_ROWS';
 END IF;
END
$check_initial$;
-- Verify real PostgreSQL triggers record both BEFORE and AFTER mutation
-- values without relying on UI/JS mock or special database privileges.
UPDATE public.attendance_events SET event_type='OUT' WHERE id=1;
UPDATE public.event_corrections SET reason='UPDATED_BY_CI_ONLY' WHERE id=10;
UPDATE public.correction_requests SET status='ACCEPTED' WHERE id=20;
DELETE FROM public.attendance_events WHERE id=1;
DELETE FROM public.event_corrections WHERE id=10;
DELETE FROM public.correction_requests WHERE id=20;
DO $check$
DECLARE
 n_all bigint;
 n_update bigint;
 n_delete bigint;
BEGIN
 SELECT count(*),count(*) FILTER (WHERE operation='UPDATE'),
        count(*) FILTER (WHERE operation='DELETE')
 INTO n_all,n_update,n_delete FROM private.attendance_mutation_audit_v1;
 IF n_all<>6 OR n_update<>3 OR n_delete<>3 THEN
  RAISE EXCEPTION 'SEC_A2_AUDIT_COUNT_MISMATCH % % %',n_all,n_update,n_delete;
 END IF;
 IF (SELECT count(DISTINCT source_table) FROM private.attendance_mutation_audit_v1)<>3
 OR EXISTS(SELECT 1 FROM private.attendance_mutation_audit_v1
           WHERE row_before IS NULL
             OR (operation='UPDATE' AND (row_after IS NULL OR row_after=row_before))
             OR (operation='DELETE' AND row_after IS NOT NULL))
 OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
     WHERE row_before->>'employee_id'='100')<>6 THEN
  RAISE EXCEPTION 'SEC_A2_ROW_VALUES_OR_THREE_TABLE_COVERAGE_FAILED';
 END IF;
 IF has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
 OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','UPDATE')
 OR has_function_privilege('anon','private.sec_a2_capture_mutation_v1()','EXECUTE')
 THEN RAISE EXCEPTION 'SEC_A2_AUDIT_NOT_PRIVATE'; END IF;
END
$check$;
DO $check_truncate$
BEGIN
 BEGIN
  EXECUTE 'TRUNCATE public.attendance_events';
  RAISE EXCEPTION 'SEC_A2_UNEXPECTED_TRUNCATE_SUCCESS';
 EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'SEC_A2_UNAUDITED_TRUNCATE_DENIED:%' THEN RAISE; END IF;
 END;
END
$check_truncate$;
ROLLBACK;
SELECT 'PASS SEC-A2 PG fixture: source 3-table UPDATE/DELETE histories, protected private RLS, live rollback selftest, TRUNCATE denied' AS result;
