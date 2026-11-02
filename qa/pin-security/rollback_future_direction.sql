-- Emergency rollback for 20261102224000_punch_ignore_future_effective_events.sql.
-- Undo *only* the future-direction change. Keep PIN protection ENABLED and
-- all employee, attendance, payroll, correction records untouched.
DO $rollback_future$
DECLARE
 v_signature CONSTANT text:='public.punch(bigint, text, text, bigint)';
 v_expected_old CONSTANT text:='eb8ff8f7ea971fb2ae6ef24b868440a1';
 v_old_fragment CONSTANT text:='where at is not null order by at desc,ord desc limit 1;';
 v_new_fragment CONSTANT text:='where at is not null AND at<=v_now_utc order by at desc,ord desc limit 1;';
 v_source text;
 v_reverted text;
BEGIN
 IF (SELECT enabled FROM pin_private.settings WHERE id IS TRUE) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PIN_PROTECTION_DISABLED_ROLLBACK_REFUSED'; END IF;
 v_source:=pg_get_functiondef(v_signature::regprocedure);
 IF (SELECT installed_md5 FROM pin_private.source_archive WHERE signature=v_signature)
   IS DISTINCT FROM md5(v_source)
 THEN RAISE EXCEPTION 'PUNCH_HOTFIX_SOURCE_DRIFT'; END IF;
 IF position(v_new_fragment in v_source)=0
 THEN RAISE EXCEPTION 'FUTURE_DIRECTION_PATCH_NOT_INSTALLED'; END IF;
 v_reverted:=replace(v_source,v_new_fragment,v_old_fragment);
 IF md5(v_reverted)<>v_expected_old THEN
   RAISE EXCEPTION 'PUNCH_ROLLBACK_SOURCE_UNEXPECTED'; END IF;
 EXECUTE v_reverted;
 UPDATE pin_private.source_archive
   SET installed_md5=md5(pg_get_functiondef(v_signature::regprocedure))
   WHERE signature=v_signature AND installed_md5=md5(v_source);
 IF NOT FOUND THEN RAISE EXCEPTION 'PUNCH_ROLLBACK_ARCHIVE_UPDATE_FAILED'; END IF;
 IF (SELECT count(*) FROM pin_private.source_archive a
       WHERE md5(pg_get_functiondef(a.signature::regprocedure))=a.installed_md5)<>15
 THEN RAISE EXCEPTION 'PIN_ARCHIVE_INTEGRITY_POST_ROLLBACK'; END IF;
END $rollback_future$;
