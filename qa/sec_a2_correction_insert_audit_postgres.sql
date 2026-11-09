\set ON_ERROR_STOP on
-- Actual PG16/17 synthetic, no network and no real personnel information.
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
-- Baseline: actual prior v1 UPDATE/DELETE-only audit has no new INSERT receipts.
INSERT INTO public.event_corrections VALUES(10,101,NULL,'ADD','synthetic','synthetic');
INSERT INTO public.correction_requests VALUES(20,101,'TIME','PENDING','synthetic');
DO $baseline$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>0
 THEN RAISE EXCEPTION 'SEC_A2_V3_ORIGINAL_GAP_NOT_REPRODUCED'; END IF;
END $baseline$;
\i security/sec_a2_correction_insert_audit_v3.sql
INSERT INTO public.event_corrections VALUES(11,101,NULL,'ADD','fixture-new','fixture');
INSERT INTO public.correction_requests VALUES(21,101,'TIME','PENDING','fixture');
UPDATE public.event_corrections SET reason='fixture-updated' WHERE id=11;
DELETE FROM public.correction_requests WHERE id=21;
DO $check$
DECLARE n_insert int;n_update int;n_delete int;
BEGIN
 SELECT count(*) FILTER(WHERE operation='INSERT'),
        count(*) FILTER(WHERE operation='UPDATE'),
        count(*) FILTER(WHERE operation='DELETE')
 INTO n_insert,n_update,n_delete FROM private.attendance_mutation_audit_v1;
 IF n_insert<>2 OR n_update<>1 OR n_delete<>1
 THEN RAISE EXCEPTION 'SEC_A2_V3_HISTORY_INCOMPLETE % % %',n_insert,n_update,n_delete; END IF;
 IF (SELECT count(DISTINCT source_table) FROM private.attendance_mutation_audit_v1 WHERE operation='INSERT')<>2
 OR EXISTS(SELECT 1 FROM private.attendance_mutation_audit_v1
  WHERE (operation='INSERT' AND (row_before IS NOT NULL OR row_after IS NULL))
     OR (operation='UPDATE' AND (row_before IS NULL OR row_after IS NULL))
     OR (operation='DELETE' AND (row_before IS NULL OR row_after IS NOT NULL)))
 THEN RAISE EXCEPTION 'SEC_A2_V3_BEFORE_AFTER_SHAPE_WRONG'; END IF;
 IF has_function_privilege('anon','private.sec_a2_capture_correction_insert_v3()','EXECUTE')
 OR has_function_privilege('authenticated','private.sec_a2_capture_correction_insert_v3()','EXECUTE')
 OR has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
 OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT')
 THEN RAISE EXCEPTION 'SEC_A2_V3_PRIVATE_ACCESS_EXPOSED'; END IF;
END $check$;
DO $immutable$
BEGIN
 BEGIN
  UPDATE private.attendance_mutation_audit_v1 SET source_pk='tamper';
  RAISE EXCEPTION 'SEC_A2_V3_MUTATION_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM NOT LIKE 'SEC_A2_AUDIT_IMMUTABLE_DENIED:%' THEN RAISE; END IF;
 END;
 BEGIN
  DELETE FROM private.attendance_mutation_audit_v1;
  RAISE EXCEPTION 'SEC_A2_V3_DELETE_ALLOWED';
 EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM NOT LIKE 'SEC_A2_AUDIT_IMMUTABLE_DENIED:%' THEN RAISE; END IF;
 END;
END $immutable$;
\i security/sec_a2_correction_insert_audit_v3_rollback.sql
DO $preserved$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>4
 OR (SELECT count(*) FROM private.attendance_mutation_audit_v1 WHERE operation='INSERT')<>2
 THEN RAISE EXCEPTION 'SEC_A2_V3_ROLLBACK_REMOVED_AUDIT_HISTORY'; END IF;
END $preserved$;
ROLLBACK;
SELECT 'PASS SEC-A2 v3 real PG16/17: original missing INSERT audit, v3 creation and change trace, private immutable history, safe rollback preserves evidence' AS result;
