-- SEC-S11 / SEC-S12: reproducible read-only, privacy-safe operating triage.
-- No employee ID, employee name, staff PIN, event ID, wage, or payroll amount is returned.
-- ZERO mutation: this file contains one SELECT statement only.
-- IMPORTANT: nominal span is NOT payable working time, a wage debt, or approved overtime.
-- Only action=ADD, created_by=system:auto-close, reason=SYSTEM_STORE_CLOSE
-- are counted as active auto-close candidates. Entries marked [VOID_ADD:id]
-- are historical cancelled records and MUST NOT be counted as active.
-- The latest correction per original event follows the existing canonical
-- readonly_auto_close_impact_20261103.sql logic; it is not payroll adjudication.
WITH candidate AS (
  SELECT id, employee_id, new_event_at AS auto_at,
    to_char(new_event_at, 'YYYY-MM') AS ym,
    reason
  FROM public.event_corrections
  WHERE action = 'ADD'
    AND created_by = 'system:auto-close'
    AND reason LIKE 'SYSTEM_STORE_CLOSE%'
),
history AS (
  SELECT ym, count(*) AS system_close_history,
    count(*) FILTER (WHERE reason = 'SYSTEM_STORE_CLOSE') AS active_unvoided,
    count(*) FILTER (WHERE reason ~ '[[]VOID_ADD:[0-9]+[]]') AS void_marker_history,
    count(*) FILTER (
      WHERE reason <> 'SYSTEM_STORE_CLOSE'
        AND reason !~ '[[]VOID_ADD:[0-9]+[]]'
    ) AS unknown_reason_requires_review
  FROM candidate
  GROUP BY ym
),
latest AS (
  SELECT DISTINCT ON (event_id)
    event_id, action, new_event_at, new_event_type
  FROM public.event_corrections
  WHERE event_id IS NOT NULL
  ORDER BY event_id, created_at DESC, id DESC
),
effective_punch AS (
  SELECT e.employee_id, e.id::text AS event_key,
    CASE WHEN c.action='EDIT_TYPE' AND c.new_event_type IS NOT NULL
      THEN c.new_event_type ELSE e.event_type END AS typ,
    CASE WHEN c.action='EDIT_TIME' AND c.new_event_at IS NOT NULL
      THEN c.new_event_at ELSE e.event_at END AS at
  FROM public.attendance_events e
  LEFT JOIN latest c ON c.event_id=e.id
  WHERE coalesce(c.action,'') <> 'VOID'
  UNION ALL
  SELECT c.employee_id, 'add_' || c.id::text,
    c.new_event_type, c.new_event_at
  FROM public.event_corrections c
  WHERE c.action='ADD' AND c.reason !~ '[[]VOID_ADD:[0-9]+[]]'
),
diagnostics AS (
  SELECT a.ym, a.auto_at, last_in.at AS preceding_in,
    EXISTS (
      SELECT 1 FROM effective_punch e
      WHERE e.employee_id=a.employee_id AND e.typ='IN'
    ) AS any_effective_in,
    (
      SELECT count(*) FROM effective_punch e
      WHERE e.employee_id=a.employee_id AND e.typ='OUT'
        AND last_in.at IS NOT NULL
        AND e.at>last_in.at AND e.at<a.auto_at
        AND e.event_key<>('add_' || a.id::text)
    ) AS intervening_outs,
    EXISTS (
      SELECT 1
      FROM public.employment_periods ep
      JOIN public.employment_contracts ec ON ec.employment_period_id=ep.id
      WHERE ep.employee_id=a.employee_id
        AND a.auto_at::date BETWEEN ep.started_on
          AND coalesce(ep.ended_on, 'infinity'::date)
        AND a.auto_at::date BETWEEN ec.effective_from
          AND coalesce(ec.effective_to, 'infinity'::date)
    ) AS effective_contract_exists,
    EXISTS (
      SELECT 1 FROM public.payroll_snapshot p
      WHERE p.employee_id=a.employee_id
        AND p.ym=a.ym
    ) AS payroll_snapshot_exists
  FROM candidate a
  LEFT JOIN LATERAL (
    SELECT max(e.at) AS at FROM effective_punch e
    WHERE e.employee_id=a.employee_id AND e.typ='IN'
      AND e.at<a.auto_at
  ) last_in ON true
  WHERE a.reason='SYSTEM_STORE_CLOSE'
)
SELECT h.ym,
  h.system_close_history,
  h.active_unvoided,
  h.void_marker_history,
  h.unknown_reason_requires_review,
  count(d.ym) AS independently_traced_active,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND d.preceding_in IS NULL)
    AS missing_preceding_in,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND d.preceding_in IS NULL
                     AND d.any_effective_in)
    AS preceding_in_missing_but_other_in_exists,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND NOT d.any_effective_in)
    AS no_effective_in_anytime,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND d.preceding_in IS NOT NULL
                     AND d.intervening_outs=0)
    AS provisional_in_out_candidate,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND d.preceding_in IS NOT NULL
                     AND d.intervening_outs>0)
    AS has_intervening_out,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND d.effective_contract_exists)
    AS effective_contract_present,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND NOT d.effective_contract_exists)
    AS effective_contract_missing,
  count(*) FILTER (WHERE d.ym IS NOT NULL AND d.payroll_snapshot_exists)
    AS payroll_snapshot_exists,
  round(sum(extract(epoch FROM (d.auto_at-d.preceding_in))/3600)
    FILTER (WHERE d.preceding_in IS NOT NULL AND d.intervening_outs=0)::numeric,2)
    AS provisional_nominal_hours_NOT_payroll_hours
FROM history h LEFT JOIN diagnostics d ON d.ym=h.ym
GROUP BY h.ym,h.system_close_history,h.active_unvoided,
 h.void_marker_history,h.unknown_reason_requires_review
ORDER BY h.ym;
