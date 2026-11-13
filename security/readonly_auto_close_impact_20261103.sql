-- SEC-S11 / 2026-11-03. READ ONLY. No employee IDs or monetary amounts returned.
-- IMPORTANT: nominal open-to-auto-close time is NOT payable time, and NOT overpayment.
-- Use the production canonical UTC converter for user-entered correction times;
-- human corrections after 2026-10-13 are KST local, older/system values UTC.
BEGIN READ ONLY;
WITH latest AS (
  SELECT DISTINCT ON (event_id) event_id, action, new_event_at, new_event_type, created_by, created_at
  FROM public.event_corrections
  WHERE event_id IS NOT NULL
  ORDER BY event_id, created_at DESC, id DESC
), eff AS (
  SELECT e.employee_id,
    CASE WHEN c.action='EDIT_TYPE' AND c.new_event_type IS NOT NULL THEN c.new_event_type ELSE e.event_type END AS typ,
    CASE WHEN c.action='EDIT_TIME' AND c.new_event_at IS NOT NULL THEN public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) ELSE e.event_at END AS at,
    e.id::text AS event_key
  FROM public.attendance_events e LEFT JOIN latest c ON c.event_id=e.id
  WHERE coalesce(c.action,'')<>'VOID'
  UNION ALL
  SELECT c.employee_id,c.new_event_type,
         public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at),
         'add_'||c.id::text
  FROM public.event_corrections c
  WHERE c.action='ADD' AND c.reason !~ '[[]VOID_ADD:[0-9]+[]]'
), auto AS (
  SELECT id,employee_id,new_event_at AS auto_at
  FROM public.event_corrections
  WHERE action='ADD' AND created_by='system:auto-close' AND reason='SYSTEM_STORE_CLOSE'
), estimated_pair AS (
  SELECT a.auto_at, last_in.at AS in_at,
    (SELECT count(*) FROM eff e
      WHERE e.employee_id=a.employee_id AND e.typ='OUT' AND e.at>last_in.at
        AND e.at<a.auto_at AND e.event_key<>('add_'||a.id::text)) AS intervening_outs
  FROM auto a
  LEFT JOIN LATERAL (
    SELECT e.at FROM eff e
    WHERE e.employee_id=a.employee_id AND e.typ='IN' AND e.at<a.auto_at
    ORDER BY e.at DESC LIMIT 1
  ) last_in ON true
)
SELECT to_char(auto_at,'YYYY-MM') AS month,
  count(*) AS active_auto_close_events,
  count(*) FILTER(WHERE in_at IS NULL) AS no_preceding_in,
  count(*) FILTER(WHERE in_at IS NOT NULL AND intervening_outs=0) AS last_in_matched_without_other_out,
  round(sum(extract(epoch FROM(auto_at-in_at))/3600)
    FILTER(WHERE in_at IS NOT NULL AND intervening_outs=0)::numeric,2) AS nominal_hours_not_payroll_hours
FROM estimated_pair
GROUP BY 1 ORDER BY 1;
ROLLBACK;
