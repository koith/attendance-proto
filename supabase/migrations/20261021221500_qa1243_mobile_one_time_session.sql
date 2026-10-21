-- QA1243 ONLY: one-time Safari OAuth session tracking, isolated from
-- operational stores, payroll, recipes and original Google Sheets.
-- This SQL contains zero operational table writes or Google credentials.
BEGIN;
CREATE SCHEMA IF NOT EXISTS qa1243_private;
REVOKE ALL ON SCHEMA qa1243_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS qa1243_private.mobile_oneuse_sessions (
  nonce_digest text PRIMARY KEY CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT qa1243_expiry_window CHECK (expires_at <= created_at + interval '10 minutes')
);
REVOKE ALL ON qa1243_private.mobile_oneuse_sessions FROM PUBLIC, anon, authenticated;
ALTER TABLE qa1243_private.mobile_oneuse_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS qa1243_mobile_oneuse_issued_idx
  ON qa1243_private.mobile_oneuse_sessions(created_at DESC);

CREATE OR REPLACE FUNCTION public.qa1243_mobile_session_issue(p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $fn$
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  -- Avoid unbounded storage and malicious repeated prefetches.
  DELETE FROM qa1243_private.mobile_oneuse_sessions
    WHERE expires_at < now() - interval '1 hour';
  IF (SELECT count(*) FROM qa1243_private.mobile_oneuse_sessions
      WHERE created_at > now()-interval '15 minutes') >= 24 THEN
    RETURN FALSE;
  END IF;
  INSERT INTO qa1243_private.mobile_oneuse_sessions(nonce_digest,expires_at)
    VALUES(p_digest,now()+interval '10 minutes')
    ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $fn$;

CREATE OR REPLACE FUNCTION public.qa1243_mobile_session_claim(p_digest text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $fn$
BEGIN
  IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  -- Atomic write-once claim: second request fails even when concurrent.
  UPDATE qa1243_private.mobile_oneuse_sessions
    SET used_at=now()
    WHERE nonce_digest=p_digest
      AND used_at IS NULL AND expires_at > now();
  RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION public.qa1243_mobile_session_issue(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qa1243_mobile_session_claim(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa1243_mobile_session_issue(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.qa1243_mobile_session_claim(text) TO service_role;
COMMIT;
