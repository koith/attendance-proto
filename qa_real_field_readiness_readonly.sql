-- READ ONLY: PAY-01, STORE-01, FEATURE-01 operational evidence readiness.
-- Output contains aggregate counts only; no employee, owner, transaction PII.
-- Run with authorized Supabase SQL tooling. Never expose this query as an anon RPC.
WITH
closed_periods AS (
 SELECT p.store_id,p.ym
 FROM public.payroll_period p
 WHERE p.status='CLOSED'
),
closed_with_snapshot AS (
 SELECT p.store_id,p.ym
 FROM closed_periods p
 WHERE EXISTS (
  SELECT 1 FROM public.payroll_snapshot snap
  WHERE snap.store_id=p.store_id AND snap.ym=p.ym
    AND snap.source_fingerprint IS NOT NULL AND btrim(snap.source_fingerprint)<>''
 )
),
real_weekly AS (
 SELECT count(*)::int AS c FROM public.payroll_weekly_approvals
 WHERE approved_at IS NOT NULL AND approved_by IS NOT NULL
),
qualified_owners AS (
 SELECT count(*)::int AS c
 FROM public.store_primary_owners o
 JOIN public.store_admin_memberships m
   ON m.store_id=o.store_id AND m.user_id=o.user_id
 JOIN public.stores s ON s.id=o.store_id
 WHERE s.is_active IS TRUE AND s.onboarding_status='READY'
   AND EXISTS (
    SELECT 1 FROM public.store_provenance_reviews v
    WHERE v.store_id=s.id AND v.decision='VERIFIED'
   )
),
valid_imports AS (
 SELECT b.id FROM public.operations_import_batches b
 WHERE b.completed_at IS NOT NULL AND b.error_message IS NULL
),
linked_real_transactions AS (
 SELECT count(*)::int AS c
 FROM public.operations_transactions t
 JOIN public.operations_raw_records r ON r.id=t.raw_record_id AND r.store_id=t.store_id
 JOIN valid_imports b ON b.id=r.batch_id
 WHERE t.is_demo IS FALSE AND t.status='CONFIRMED'
),
unresolved_real_reconciliation AS (
 SELECT count(*)::int AS c FROM public.operations_reconciliation_issues
 WHERE status='OPEN'
),
real_stock AS (
 SELECT count(*)::int AS c FROM public.inventory_movements
 WHERE is_demo IS FALSE AND source_type <> 'DEMO'
)
SELECT jsonb_build_object(
 'schema_version',1,
 'captured_at',clock_timestamp(),
 'payroll',jsonb_build_object(
   'closed_periods',(SELECT count(*)::int FROM closed_periods),
   'closed_periods_with_snapshots',(SELECT count(*)::int FROM closed_with_snapshot),
   'approved_weeks',(SELECT c FROM real_weekly)),
 'stores',jsonb_build_object(
   'qualified_owner_links',(SELECT c FROM qualified_owners),
   'staged_count',(SELECT count(*)::int FROM public.stores WHERE onboarding_status='STAGED')),
 'operations',jsonb_build_object(
   'completed_imports',(SELECT count(*)::int FROM valid_imports),
   'confirmed_linked_real_transactions',(SELECT c FROM linked_real_transactions),
   'unresolved_reconciliations',(SELECT c FROM unresolved_real_reconciliation),
   'real_stock_movements',(SELECT c FROM real_stock))
) AS readiness_snapshot;
