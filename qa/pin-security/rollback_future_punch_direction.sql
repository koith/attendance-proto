-- Targeted rollback: restore the exact pre-future-filter PIN-guarded punch,
-- without reverting PIN protection or modifying any employee/business rows.
DO $rollback$
DECLARE
 sig regprocedure:='public.punch(bigint,text,text,bigint)'::regprocedure;
 source text;
 old_part text:='select typ into v_last_type from eff where at is not null AND at<=v_now_utc order by at desc,ord desc limit 1;';
 restore_part text:='select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;';
BEGIN
 source:=pg_get_functiondef(sig);
 IF NOT EXISTS(SELECT 1 FROM pin_private.source_archive
  WHERE signature='public.punch(bigint, text, text, bigint)'
   AND installed_md5=md5(source)) THEN
   RAISE EXCEPTION 'PUNCH_ROLLBACK_SOURCE_DRIFT';
 END IF;
 IF position(old_part in source)=0 OR position(restore_part in source)>0 THEN
   RAISE EXCEPTION 'PUNCH_ROLLBACK_NOT_INSTALLED';
 END IF;
 EXECUTE replace(source,old_part,restore_part);
 IF md5(pg_get_functiondef(sig))<>'eb8ff8f7ea971fb2ae6ef24b868440a1' THEN
   RAISE EXCEPTION 'PUNCH_ROLLBACK_HASH_MISMATCH';
 END IF;
 UPDATE pin_private.source_archive
 SET installed_md5=md5(pg_get_functiondef(sig))
 WHERE signature='public.punch(bigint, text, text, bigint)';
END $rollback$;
NOTIFY pgrst, 'reload schema';
