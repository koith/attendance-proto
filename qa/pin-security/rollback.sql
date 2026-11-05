-- Code rollback only. Preserve all new attendance/business rows and counter evidence.
-- Second-line defense for direct psql -f invocations that bypass Python preflight.
-- Only disposable QA database names accepted. This is NOT a substitute for
-- fixture_safety.py host + actual backend + synthetic seed verification.
DO $fixture_safety$
BEGIN
 IF current_database() !~ '^(audit_pin|pin_fixture)(_[a-z0-9]+)*BEGIN;
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

 THEN RAISE EXCEPTION 'PIN_FIXTURE_DATABASE_REFUSED'; END IF;
END $fixture_safety$;
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
