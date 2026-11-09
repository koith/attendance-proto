-- SEC-A2 v3 emergency disable-new-audit only; preserve all historic audit INSERT rows.
-- DO NOT restore row_before NOT NULL or old 2-value operation check while INSERT
-- histories exist; never delete or backfill actual correction data.
DO $pre$
BEGIN
 IF to_regprocedure('private.sec_a2_capture_correction_insert_v3()') IS NULL
  OR (SELECT count(*) FROM pg_trigger
   WHERE tgname='sec_a2_correction_insert_audit_v3'
     AND tgrelid IN ('public.event_corrections'::regclass,'public.correction_requests'::regclass))<>2
 THEN RAISE EXCEPTION 'SEC_A2_V3_ROLLBACK_EXPECTED_STATE_MISSING'; END IF;
END $pre$;

DROP TRIGGER sec_a2_correction_insert_audit_v3 ON public.event_corrections;
DROP TRIGGER sec_a2_correction_insert_audit_v3 ON public.correction_requests;
DROP FUNCTION private.sec_a2_capture_correction_insert_v3();

-- Keep expanded audit v3 CHECK/nullable column, and all captured rows.
DO $verify$
BEGIN
 IF to_regprocedure('private.sec_a2_capture_correction_insert_v3()') IS NOT NULL
 OR (SELECT count(*) FROM pg_trigger
    WHERE tgrelid='private.attendance_mutation_audit_v1'::regclass
    AND tgenabled='O' AND tgname IN
      ('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2'))<>2
 OR NOT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='private.attendance_mutation_audit_v1'::regclass
      AND conname='attendance_mutation_audit_v3_row_shape_check')
 THEN RAISE EXCEPTION 'SEC_A2_V3_ROLLBACK_LOST_HISTORY_GUARD'; END IF;
END $verify$;
