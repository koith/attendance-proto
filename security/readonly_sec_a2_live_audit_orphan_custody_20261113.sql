-- A2 custody acceptance 2026-11-13: OPERATIONAL READ-ONLY SQL.
-- Query only metadata/aggregate counts. NO employee, IDs, PINs or row JSON output.
-- Explicitly separate historical orphan VOID storage from its business intent.
WITH live_receipts AS (
 SELECT
   count(*)::int audit_rows,
   count(*) FILTER (WHERE a.source_table='event_corrections'
       AND a.operation='INSERT'
       AND a.row_before IS NULL AND a.row_after IS NOT NULL
       AND a.source_pk=e.id::text
       AND a.row_after=to_jsonb(e))::int full_original_matches,
   count(*) FILTER (WHERE a.source_table='event_corrections'
       AND a.operation='INSERT'
       AND a.row_before IS NULL AND a.row_after IS NOT NULL
       AND (a.row_after->>'action')='ADD'
       AND (a.row_after->>'created_by')='system:auto-close')::int actual_operating_auto_close_receipts,
   count(*) FILTER (WHERE a.row_after IS NOT NULL AND
     a.observed_at>=((a.row_after->>'created_at')::timestamptz))::int chronological,
   count(*) FILTER (WHERE a.operation='INSERT' AND
     (a.row_before IS NOT NULL OR a.row_after IS NULL))::int malformed_insert_receipts
 FROM private.attendance_mutation_audit_v1 a
 LEFT JOIN public.event_corrections e
   ON a.source_table='event_corrections' AND a.source_pk=e.id::text
), historic_orphans AS (
 SELECT count(*)::int orphan_voids,
   count(*) FILTER (WHERE c.new_event_at IS NULL AND c.new_event_type IS NULL)::int without_event_payload,
   count(*) FILTER (WHERE c.reason IS NOT NULL AND btrim(c.reason)<>'')::int reason_preserved,
   count(*) FILTER (WHERE c.action='VOID' AND c.event_id IS NULL)::int unlinked,
   count(DISTINCT c.employee_id)::int employee_groups
 FROM public.event_corrections c
 WHERE c.action='VOID' AND c.event_id IS NULL
), catalog_checks AS (
 SELECT
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relnamespace='public'::regnamespace AND c.relname IN
       ('event_corrections','correction_requests')
       AND t.tgname='sec_a2_correction_insert_audit_v3'
       AND t.tgenabled IN('O','A')) AS insert_triggers,
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relnamespace='private'::regnamespace
       AND c.relname='attendance_mutation_audit_v1'
       AND t.tgname IN('sec_a2_audit_no_rewrite_v2','sec_a2_audit_no_truncate_v2')
       AND t.tgenabled IN('O','A')) AS immutable_guards,
  (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relnamespace='public'::regnamespace
       AND c.relname IN('attendance_events','event_corrections','correction_requests')
       AND t.tgname IN('sec_a2_mutation_audit_v1','sec_a2_protect_truncate_v1')
       AND t.tgenabled IN('O','A')) AS update_delete_and_truncate_guards,
  (SELECT count(*)::int FROM pg_proc p
     WHERE p.pronamespace='public'::regnamespace AND
      ((p.proname='sheet_month_attendance_projection'
        AND pg_get_functiondef(p.oid) LIKE '%c.event_id is not null%'
        AND pg_get_functiondef(p.oid) LIKE '%c.action=%ADD%')
       OR (p.proname='substitution_is_working'
        AND pg_get_functiondef(p.oid) LIKE '%event_id is not null%'
        AND pg_get_functiondef(p.oid) LIKE '%c.action=%ADD%'))) AS bounded_effective_projections
)
SELECT r.*,o.*,c.*,
 has_schema_privilege('anon','private','USAGE') AS anon_private_usage,
 has_schema_privilege('authenticated','private','USAGE') AS auth_private_usage,
 has_table_privilege('anon','private.attendance_mutation_audit_v1','SELECT') AS anon_audit_read,
 has_table_privilege('authenticated','private.attendance_mutation_audit_v1','SELECT') AS auth_audit_read
FROM live_receipts r CROSS JOIN historic_orphans o CROSS JOIN catalog_checks c;
-- Expected live 2026-11-13 evidence: at least one full actual operating receipt;
-- 8 historical orphan VOID rows all have no event pointer/punch payload and
-- remain in every one of three private ciphertext archives. Those eight
-- MAY reflect unrealized human deletion intent; NEVER infer intended target,
-- create a pointer or delete records to "fix" history without authorization.
