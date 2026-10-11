-- These PostgreSQL SECURITY DEFINER helpers have no caller or PIN check.
-- Direct authenticated invocation can reveal another branch's live shift state
-- or schedule conflict. They are used only by PIN-protected server functions.
-- Preserve trusted server/owner calls and all existing employee / attendance rows.

REVOKE ALL ON FUNCTION public.substitution_is_working(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.substitution_schedule_conflict(
  bigint, timestamp without time zone, timestamp without time zone
) FROM PUBLIC, anon, authenticated;
