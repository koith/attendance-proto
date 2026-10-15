-- HQ-only real evidence readiness. No source writes. Derived from qa_real_field_readiness_readonly.sql.
-- Explicitly revoke function defaults to prevent exposing sensitive aggregate KPIs.
CREATE OR REPLACE FUNCTION public.hq_field_readiness_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $func$
DECLARE v_snapshot jsonb;
BEGIN
 IF NOT public.is_hq_admin() THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED';
 END IF;
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
 qualifying_payroll_periods AS (
  SELECT p.store_id,p.ym FROM closed_with_snapshot p
  WHERE EXISTS (
   SELECT 1 FROM public.payroll_weekly_approvals w
   WHERE w.store_id=p.store_id AND w.approved_at IS NOT NULL AND w.approved_by IS NOT NULL
     AND w.week_start >= (to_date(p.ym||'-01','YYYY-MM-DD') - interval '6 days')::date
     AND w.week_start < (to_date(p.ym||'-01','YYYY-MM-DD') + interval '1 month')::date
  )
 ),
 real_weekly AS (
  SELECT count(*)::int AS c FROM public.payroll_weekly_approvals w
  JOIN closed_with_snapshot p ON p.store_id=w.store_id
  WHERE w.approved_at IS NOT NULL AND w.approved_by IS NOT NULL
    AND w.week_start >= (to_date(p.ym||'-01','YYYY-MM-DD') - interval '6 days')::date
    AND w.week_start < (to_date(p.ym||'-01','YYYY-MM-DD') + interval '1 month')::date
 ),
 qualified_owners AS (
  SELECT count(*)::int AS c
  FROM public.store_primary_owners o
  JOIN public.store_admin_memberships m
    ON m.store_id=o.store_id AND m.user_id=o.user_id
  JOIN public.stores s ON s.id=o.store_id
  JOIN LATERAL (
   SELECT v.decision FROM public.store_provenance_reviews v
   WHERE v.store_id=s.id ORDER BY v.reviewed_at DESC,v.id DESC LIMIT 1
  ) latest_review ON latest_review.decision='VERIFIED'
  WHERE s.is_active IS TRUE AND s.onboarding_status='READY'
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
  'schema_version',2,
  'captured_at',clock_timestamp(),
  'payroll',jsonb_build_object(
    'closed_periods',(SELECT count(*)::int FROM closed_periods),
    'closed_periods_with_snapshots',(SELECT count(*)::int FROM closed_with_snapshot),
    'qualified_closed_periods',(SELECT count(*)::int FROM qualifying_payroll_periods),
    'approved_weeks',(SELECT c FROM real_weekly)),
  'stores',jsonb_build_object(
    'qualified_owner_links',(SELECT c FROM qualified_owners),
    'staged_count',(SELECT count(*)::int FROM public.stores WHERE onboarding_status='STAGED')),
  'operations',jsonb_build_object(
    'completed_imports',(SELECT count(*)::int FROM valid_imports),
    'confirmed_linked_real_transactions',(SELECT c FROM linked_real_transactions),
    'unresolved_reconciliations',(SELECT c FROM unresolved_real_reconciliation),
    'real_stock_movements',(SELECT c FROM real_stock))
 ) INTO v_snapshot;
 IF v_snapshot IS NULL OR v_snapshot->>'schema_version' <> '2' THEN
   RAISE EXCEPTION 'INVALID_READINESS_SNAPSHOT';
 END IF;
 RETURN v_snapshot;
END $func$;
REVOKE ALL ON FUNCTION public.hq_field_readiness_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hq_field_readiness_v1() TO authenticated, service_role;
