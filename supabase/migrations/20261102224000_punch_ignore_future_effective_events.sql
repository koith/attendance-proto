-- P0: a future manager-added/corrected event must not flip TODAY'S punch direction.
-- Existing user PINs, normal IN/OUT responses, RLS, permissions and all business rows stay unchanged.
-- Fail-closed against unknown current source and preserve the pin-guard rollback archive contract.
DO $fix_punch_future$
DECLARE
  v_signature CONSTANT text := 'public.punch(bigint, text, text, bigint)';
  v_old_md5 CONSTANT text := 'eb8ff8f7ea971fb2ae6ef24b868440a1';
  v_source text;
  v_patched text;
  v_old_fragment CONSTANT text := 'where at is not null order by at desc,ord desc limit 1;';
  v_new_fragment CONSTANT text := 'where at is not null AND at<=v_now_utc order by at desc,ord desc limit 1;';
BEGIN
  IF (SELECT enabled FROM pin_private.settings WHERE id IS TRUE) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'PIN_GUARD_MUST_REMAIN_ON'; END IF;

  v_source := pg_get_functiondef(v_signature::regprocedure);
  IF md5(v_source)<>v_old_md5
  THEN RAISE EXCEPTION 'PUNCH_SOURCE_DRIFT'; END IF;
  IF (SELECT installed_md5 FROM pin_private.source_archive WHERE signature=v_signature)
      IS DISTINCT FROM v_old_md5
  THEN RAISE EXCEPTION 'PIN_ARCHIVE_DRIFT'; END IF;
  IF position(v_old_fragment in v_source)=0
  THEN RAISE EXCEPTION 'PUNCH_DIRECTION_ANCHOR_MISSING'; END IF;

  v_patched := replace(v_source,v_old_fragment,v_new_fragment);
  IF length(v_patched)-length(v_source) <> length(v_new_fragment)-length(v_old_fragment)
  THEN RAISE EXCEPTION 'PUNCH_DIRECTION_ANCHOR_NOT_UNIQUE'; END IF;

  -- CREATE OR REPLACE retains its existing signature and EXECUTE grants.
  EXECUTE v_patched;

  UPDATE pin_private.source_archive
     SET installed_md5=md5(pg_get_functiondef(v_signature::regprocedure))
   WHERE signature=v_signature AND installed_md5=v_old_md5;
  IF NOT FOUND THEN RAISE EXCEPTION 'PIN_ARCHIVE_UPDATE_FAILED'; END IF;
  IF (SELECT count(*) FROM pin_private.source_archive a
       WHERE md5(pg_get_functiondef(a.signature::regprocedure))=a.installed_md5)<>15
  THEN RAISE EXCEPTION 'PIN_GUARD_SOURCE_INTEGRITY_FAILED'; END IF;
END $fix_punch_future$;
