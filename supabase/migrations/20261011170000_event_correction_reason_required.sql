-- Preserve auditability: every attendance correction must carry a nonblank reason.
-- Production preflight (2026-10-11): no existing correction has a missing/blank reason.
-- This is additive; it does not modify existing attendance or correction rows.
ALTER TABLE public.event_corrections
ADD CONSTRAINT event_corrections_reason_required
CHECK (reason IS NOT NULL AND length(btrim(reason)) > 0);
