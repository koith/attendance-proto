-- Code rollback only. Preserve all new attendance/business rows and counter evidence.
BEGIN;
DO $restore$
DECLARE r record;
BEGIN
 IF (SELECT count(*) FROM pin_private.source_archive)<>15 THEN RAISE EXCEPTION 'PIN_ROLLBACK_ARCHIVE_INCOMPLETE'; END IF;
 FOR r IN SELECT * FROM pin_private.source_archive ORDER BY signature LOOP
  IF md5(pg_get_functiondef(r.signature::regprocedure)) IS DISTINCT FROM r.installed_md5
  THEN RAISE EXCEPTION 'PIN_ROLLBACK_SOURCE_DRIFT: %',r.signature; END IF;
 END LOOP;
 UPDATE pin_private.settings SET enabled=false WHERE id;
 FOR r IN SELECT * FROM pin_private.source_archive ORDER BY signature LOOP
  EXECUTE r.before_definition;
  IF r.before_public THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.signature||' TO PUBLIC'; END IF;
 END LOOP;
 DROP TRIGGER pin_guard_seed ON public.employees;
END $restore$;
NOTIFY pgrst,'reload schema';
COMMIT;
