-- P0 clock direction: an administrator-entered FUTURE correction is not an
-- event that has already happened. Do not let it flip today's next punch.
-- Fail closed if any other hotfix has touched guarded punch after audit.
DO $future_guard$
DECLARE
  sig regprocedure := 'public.punch(bigint,text,text,bigint)'::regprocedure;
  source text;
  old_fragment text := 'select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;';
  new_fragment text := 'select typ into v_last_type from eff where at is not null AND at<=v_now_utc order by at desc,ord desc limit 1;';
  old_md5 text := 'eb8ff8f7ea971fb2ae6ef24b868440a1';
BEGIN
  IF to_regnamespace('pin_private') IS NULL THEN
    RAISE EXCEPTION 'PIN_GUARD_REQUIRED';
  END IF;
  source:=pg_get_functiondef(sig);
  IF md5(source)<>old_md5 THEN
    RAISE EXCEPTION 'PUNCH_SOURCE_DRIFT';
  END IF;
  IF position(old_fragment in source)=0 OR position(new_fragment in source)>0 THEN
    RAISE EXCEPTION 'PUNCH_FUTURE_FILTER_UNEXPECTED_SOURCE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pin_private.source_archive
     WHERE signature='public.punch(bigint, text, text, bigint)'
       AND installed_md5=old_md5
  ) THEN
    RAISE EXCEPTION 'PUNCH_RECOVERY_ARCHIVE_DRIFT';
  END IF;
  EXECUTE replace(source,old_fragment,new_fragment);
  UPDATE pin_private.source_archive
     SET installed_md5=md5(pg_get_functiondef(sig))
   WHERE signature='public.punch(bigint, text, text, bigint)'
     AND installed_md5=old_md5;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUNCH_ARCHIVE_UPDATE_FAILED'; END IF;
END $future_guard$;
NOTIFY pgrst, 'reload schema';
