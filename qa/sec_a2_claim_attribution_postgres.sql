\set ON_ERROR_STOP on
-- SEC-A2 v4: synthetic-only real PostgreSQL 16/17 GUC transport regression.
-- PostgREST signs/verifies JWTs before setting these GUCs; this fixture checks
-- the trigger's PostgreSQL-side extraction, NOT cryptographic JWT validity.
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
\i security/sec_a2_correction_insert_audit_v3.sql

-- Original v3 captured a legitimate INSERT but only the obsolete singular GUC.
SELECT set_config('request.jwt.claims',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
INSERT INTO public.event_corrections VALUES (10,101,NULL,'ADD','baseline','fixture');
DO $baseline$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1 WHERE source_pk='10' AND actor_uid IS NULL)<>1
 THEN RAISE EXCEPTION 'SEC_A2_V4_ORIGINAL_GAP_NOT_REPRODUCED'; END IF;
END $baseline$;
\i security/sec_a2_claim_attribution_v4.sql

-- The aggregate supersedes an old/stale legacy sub.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO public.event_corrections VALUES (11,101,NULL,'ADD','agg-user','fixture');
UPDATE public.event_corrections SET reason='agg-updated' WHERE id=11;
DELETE FROM public.event_corrections WHERE id=11;
DO $aggregated$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1
     WHERE source_pk='11' AND actor_uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       AND postgrest_role='authenticated')<>3
 OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
     WHERE source_pk='11' AND actor_uid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>0
 THEN RAISE EXCEPTION 'SEC_A2_V4_AGGREGATE_NOT_PREFERRED'; END IF;
END $aggregated$;

-- Legacy GUC is still supported when aggregate is entirely unavailable.
SELECT set_config('request.jwt.claims','',true);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
INSERT INTO public.correction_requests VALUES (21,101,'TIME','PENDING','legacy');
DO $legacy$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1
   WHERE source_pk='21' AND actor_uid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     AND postgrest_role='authenticated')<>1
 THEN RAISE EXCEPTION 'SEC_A2_V4_LEGACY_REGRESSION'; END IF;
END $legacy$;

-- A present aggregate without sub MUST NOT consume a stale legacy sub.
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
INSERT INTO public.correction_requests VALUES (22,101,'TIME','PENDING','no-sub');
-- An invalid subject string must not be misattributed.
SELECT set_config('request.jwt.claims','{"sub":"spoofed","role":"authenticated"}',true);
INSERT INTO public.correction_requests VALUES (23,101,'TIME','PENDING','invalid-sub');
-- Direct SQL without JWT identity stays unattributed.
SELECT set_config('request.jwt.claims','',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','',true);
INSERT INTO public.correction_requests VALUES (24,101,'TIME','PENDING','sql');
DO $v4_complete$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>8
 OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
     WHERE source_pk IN ('22','23','24') AND actor_uid IS NULL)<>3
 OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
     WHERE source_pk='10' AND actor_uid IS NULL)<>1
 THEN RAISE EXCEPTION 'SEC_A2_V4_NULL_PROVENANCE_OR_HISTORY_CHANGED'; END IF;
 IF has_function_privilege('anon','private.sec_a2_request_identity_v4()','EXECUTE')
 OR has_function_privilege('authenticated','private.sec_a2_request_identity_v4()','EXECUTE')
 OR has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT')
 OR has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT')
 THEN RAISE EXCEPTION 'SEC_A2_V4_AUDIT_EXPOSED'; END IF;
 BEGIN
   UPDATE private.attendance_mutation_audit_v1 SET actor_uid='forged';
   RAISE EXCEPTION 'SEC_A2_V4_IMMUTABILITY_BYPASS';
 EXCEPTION WHEN SQLSTATE '42501' THEN
   IF SQLERRM NOT LIKE 'SEC_A2_AUDIT_IMMUTABLE_DENIED:%' THEN RAISE; END IF;
 END;
END $v4_complete$;

\i security/sec_a2_claim_attribution_v4_rollback.sql
-- Rollback reverts ONLY code behavior; all eight append-only receipts survive.
SELECT set_config('request.jwt.claims',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
INSERT INTO public.correction_requests VALUES (25,101,'TIME','PENDING','after-rollback');
DO $rollback_verified$
BEGIN
 IF (SELECT count(*) FROM private.attendance_mutation_audit_v1)<>9
 OR (SELECT count(*) FROM private.attendance_mutation_audit_v1
     WHERE source_pk='25' AND actor_uid IS NULL)<>1
 OR to_regprocedure('private.sec_a2_request_identity_v4()') IS NOT NULL
 THEN RAISE EXCEPTION 'SEC_A2_V4_ROLLBACK_NOT_PRESERVED'; END IF;
END $rollback_verified$;
ROLLBACK;
SELECT 'PASS SEC-A2 v4 PG16/17: aggregate priority, legacy fallback, missing/invalid subject null, source INSERT/UPDATE/DELETE, immutable history, safe code rollback' AS result;
