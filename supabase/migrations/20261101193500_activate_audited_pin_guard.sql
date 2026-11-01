-- Controlled production activation of audited PIN guard.
-- Precondition: 20261031043549_audit_pin_server_guard.sql already applied and verified.
-- Only configuration changes; no employees, attendance, payroll, auth, or store rows touched.
DO $preflight$
BEGIN
  IF to_regnamespace('pin_private') IS NULL
    THEN RAISE EXCEPTION 'PIN_GUARD_SCHEMA_MISSING'; END IF;
  IF (SELECT count(*) FROM pin_private.source_archive) <> 15
    THEN RAISE EXCEPTION 'PIN_GUARD_ARCHIVE_INCOMPLETE'; END IF;
  IF EXISTS (
    SELECT 1 FROM pin_private.source_archive a
     WHERE md5(pg_get_functiondef(a.signature::regprocedure)) IS DISTINCT FROM a.installed_md5
  ) THEN RAISE EXCEPTION 'PIN_GUARD_INSTALLED_SOURCE_DRIFT'; END IF;
  IF (SELECT count(*) FROM pin_private.settings WHERE id) <> 1
    THEN RAISE EXCEPTION 'PIN_GUARD_SETTINGS_MISSING'; END IF;
  IF (SELECT count(*) FROM information_schema.sequences WHERE sequence_schema='pin_private')
       < (SELECT count(*) FROM public.employees)
    THEN RAISE EXCEPTION 'PIN_GUARD_EMPLOYEE_SEQUENCE_INCOMPLETE'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='pin_guard_seed' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'PIN_GUARD_SEED_TRIGGER_MISSING'; END IF;
END $preflight$;

UPDATE pin_private.settings
SET enabled = true
WHERE id IS TRUE AND enabled IS FALSE;

DO $verify$
BEGIN
  IF (SELECT enabled FROM pin_private.settings WHERE id) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'PIN_GUARD_ACTIVATION_FAILED'; END IF;
END $verify$;
