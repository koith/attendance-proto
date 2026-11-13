-- SEC-01 / SEC-S09 / recovery S5: preserve existing single-device guard and
-- reject an already revoked/removed GoTrue session even if it was the latest.
-- Apply only after isolated PG16/PG17 + signed PostgREST HTTP QA.
-- This file does NOT activate pgrst.db_pre_request or modify operational rows.
-- Backout: reapply previous function from the immutable 20261017050000
-- _single_admin_session_guard_prepare.sql. Do not run backout as a blind
-- batch; the operator must approve restoration of the prior policy.
CREATE OR REPLACE FUNCTION session_guard.require_latest_session()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, session_guard AS $$
DECLARE
  claims jsonb;
  uid uuid;
  sid uuid;
  latest uuid;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF coalesce(claims->>'role',
      nullif(current_setting('request.jwt.claim.role', true), ''))
      IS DISTINCT FROM 'authenticated' THEN
    RETURN; -- Anonymous public POS/recipe flows are unaffected.
  END IF;
  uid := nullif(claims->>'sub', '')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = uid
  ) THEN
    RETURN; -- Existing policy never single-device-locks non-admin staff.
  END IF;
  sid := nullif(claims->>'session_id', '')::uuid;
  IF uid IS NULL OR sid IS NULL THEN
    RAISE EXCEPTION 'SESSION_SUPERSEDED' USING errcode = 'P0001';
  END IF;
  SELECT session_id INTO latest FROM session_guard.latest_session
    WHERE user_id = uid;
  IF latest IS DISTINCT FROM sid THEN
    RAISE EXCEPTION 'SESSION_SUPERSEDED' USING errcode = 'P0001';
  END IF;
  -- Prior logic checked only latest_session; signing out deletes the row from
  -- auth.sessions while the stored latest pointer remains. A cryptographically
  -- valid but revoked JWT could therefore continue accessing admin RPCs.
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions s WHERE s.id = sid AND s.user_id = uid
  ) THEN
    RAISE EXCEPTION 'SESSION_SUPERSEDED' USING errcode = 'P0001';
  END IF;
END $$;
REVOKE ALL ON FUNCTION session_guard.require_latest_session() FROM public, anon;
GRANT EXECUTE ON FUNCTION session_guard.require_latest_session()
  TO anon, authenticated, authenticator;
