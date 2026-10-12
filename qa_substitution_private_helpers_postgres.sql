-- Run only in a disposable PostgreSQL 16 CI database. No production keys or data.
-- Execute the checked-in migration, rather than reimplementing its REVOKEs.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

-- Minimal synthetic functions with the exact deployed signatures and owner.
CREATE FUNCTION public.substitution_is_working(bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT TRUE $$;
CREATE FUNCTION public.substitution_schedule_conflict(
  bigint, timestamp without time zone, timestamp without time zone
) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT FALSE $$;

-- Reproduce the dangerous inherited/default and direct function privileges.
GRANT EXECUTE ON FUNCTION public.substitution_is_working(bigint)
  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.substitution_schedule_conflict(
  bigint, timestamp without time zone, timestamp without time zone
) TO PUBLIC, anon, authenticated;

DO $$
DECLARE
  work_fn oid := 'public.substitution_is_working(bigint)'::regprocedure;
  schedule_fn oid := 'public.substitution_schedule_conflict(bigint,timestamp without time zone,timestamp without time zone)'::regprocedure;
BEGIN
  IF NOT has_function_privilege('anon', work_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', work_fn, 'EXECUTE')
     OR NOT has_function_privilege('anon', schedule_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', schedule_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Synthetic precondition failed: helpers must start exposed';
  END IF;
END $$;

\i supabase/migrations/20261012075500_private_substitution_helpers.sql

-- Both identities must lose effective privileges (including PUBLIC inheritance).
-- The owning postgres role must retain the ability to call both helpers.
DO $$
DECLARE
  work_fn oid := 'public.substitution_is_working(bigint)'::regprocedure;
  schedule_fn oid := 'public.substitution_schedule_conflict(bigint,timestamp without time zone,timestamp without time zone)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', work_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', work_fn, 'EXECUTE')
     OR has_function_privilege('anon', schedule_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', schedule_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Private substitution helper is still directly executable';
  END IF;
  IF NOT has_function_privilege('postgres', work_fn, 'EXECUTE')
     OR NOT has_function_privilege('postgres', schedule_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Trusted postgres execution of a helper was broken';
  END IF;
END $$;

-- Exercise real permission-denied errors, not just catalog ACL inspection.
SET ROLE anon;
DO $$
DECLARE
  denied_work boolean := FALSE;
  denied_schedule boolean := FALSE;
BEGIN
  BEGIN
    PERFORM public.substitution_is_working(1);
  EXCEPTION WHEN insufficient_privilege THEN denied_work := TRUE;
  END;
  BEGIN
    PERFORM public.substitution_schedule_conflict(1, '2026-10-01', '2026-10-02');
  EXCEPTION WHEN insufficient_privilege THEN denied_schedule := TRUE;
  END;
  IF NOT denied_work OR NOT denied_schedule THEN
    RAISE EXCEPTION 'Anonymous direct function call was not denied';
  END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
DO $$
DECLARE
  denied_work boolean := FALSE;
  denied_schedule boolean := FALSE;
BEGIN
  BEGIN
    PERFORM public.substitution_is_working(1);
  EXCEPTION WHEN insufficient_privilege THEN denied_work := TRUE;
  END;
  BEGIN
    PERFORM public.substitution_schedule_conflict(1, '2026-10-01', '2026-10-02');
  EXCEPTION WHEN insufficient_privilege THEN denied_schedule := TRUE;
  END;
  IF NOT denied_work OR NOT denied_schedule THEN
    RAISE EXCEPTION 'Authenticated direct function call was not denied';
  END IF;
END $$;
RESET ROLE;

-- A trusted SECURITY DEFINER server-side caller continues working as owner.
-- This synthetic wrapper tests privilege propagation only, not production PIN validation.
CREATE FUNCTION public.qa_trusted_substitution_wrapper()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.substitution_is_working(1)
    AND NOT public.substitution_schedule_conflict(1, '2026-10-01', '2026-10-02');
$$;
REVOKE ALL ON FUNCTION public.qa_trusted_substitution_wrapper()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_trusted_substitution_wrapper() TO authenticated;

SET ROLE authenticated;
DO $$
BEGIN
  IF NOT public.qa_trusted_substitution_wrapper() THEN
    RAISE EXCEPTION 'Trusted server-side helper call was broken';
  END IF;
END $$;
RESET ROLE;

SELECT 'PASS private helper ACL and trusted owner execution (synthetic PostgreSQL)' AS result;
