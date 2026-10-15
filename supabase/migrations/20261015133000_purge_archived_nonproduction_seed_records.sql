-- ONLY after 20261015132500 archive migration and matching archive readback.
-- Physically remove proven synthetic STAGED rosters and 39 fictional STORES;
-- archive schema remains private. All changes atomic, no cascade of real data.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $pre$
DECLARE n bigint;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id=1 AND onboarding_status='READY') THEN
  RAISE EXCEPTION 'INHA_READY_STORE_GUARD';
 END IF;
 IF (SELECT count(*) FROM demo_cleanup_archive.stores_20261015)<>39
 OR (SELECT count(*) FROM demo_cleanup_archive.employees_20261015)<>893
 OR (SELECT count(*) FROM demo_cleanup_archive.attendance_events_20261015)<>5236
 OR (SELECT count(*) FROM demo_cleanup_archive.employment_periods_20261015)<>719
 OR (SELECT count(*) FROM demo_cleanup_archive.employment_contracts_20261015)<>719
 OR (SELECT count(*) FROM demo_cleanup_archive.employment_contract_workdays_20261015)<>3595
 OR (SELECT count(*) FROM demo_cleanup_archive.store_locations_20261015)<>4
 THEN RAISE EXCEPTION 'MISSING_OR_INCOMPLETE_SEED_ARCHIVE'; END IF;
 IF (SELECT count(*) FROM public.stores WHERE source_store_key LIKE 'demo_%')<>39
 OR (SELECT count(*) FROM public.employees WHERE store_id<>1)<>893
 THEN RAISE EXCEPTION 'LIVE_SEED_COUNTS_CHANGED'; END IF;
 -- Exact rows must match archived originals. No new staff edits, contracts,
 -- clock actions, or provenance changes can pass this equality check.
 IF EXISTS (SELECT 1 FROM public.stores t FULL JOIN demo_cleanup_archive.stores_20261015 a USING(id)
   WHERE (t.source_store_key LIKE 'demo_%' OR a.id IS NOT NULL)
     AND (t.id IS NULL OR a.id IS NULL OR to_jsonb(t) IS DISTINCT FROM to_jsonb(a)))
 OR EXISTS (SELECT 1 FROM public.employees t FULL JOIN demo_cleanup_archive.employees_20261015 a USING(id)
   WHERE (t.store_id<>1 OR a.id IS NOT NULL)
     AND (t.id IS NULL OR a.id IS NULL OR to_jsonb(t) IS DISTINCT FROM to_jsonb(a)))
 OR EXISTS (SELECT 1 FROM public.attendance_events t FULL JOIN demo_cleanup_archive.attendance_events_20261015 a USING(id)
   WHERE (a.id IS NOT NULL OR t.employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
     AND (t.id IS NULL OR a.id IS NULL OR to_jsonb(t) IS DISTINCT FROM to_jsonb(a)))
 OR EXISTS (SELECT 1 FROM public.employment_periods t FULL JOIN demo_cleanup_archive.employment_periods_20261015 a USING(id)
   WHERE (a.id IS NOT NULL OR t.employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
     AND (t.id IS NULL OR a.id IS NULL OR to_jsonb(t) IS DISTINCT FROM to_jsonb(a)))
 OR EXISTS (SELECT 1 FROM public.employment_contracts t FULL JOIN demo_cleanup_archive.employment_contracts_20261015 a USING(id)
   WHERE (a.id IS NOT NULL OR t.employment_period_id IN (SELECT id FROM demo_cleanup_archive.employment_periods_20261015))
     AND (t.id IS NULL OR a.id IS NULL OR to_jsonb(t) IS DISTINCT FROM to_jsonb(a)))
 OR EXISTS (
   (SELECT t.* FROM public.employment_contract_workdays t
    WHERE t.contract_id IN (SELECT id FROM demo_cleanup_archive.employment_contracts_20261015))
   EXCEPT ALL
   SELECT a.* FROM demo_cleanup_archive.employment_contract_workdays_20261015 a
  )
 OR EXISTS (
   SELECT a.* FROM demo_cleanup_archive.employment_contract_workdays_20261015 a
   EXCEPT ALL
   (SELECT t.* FROM public.employment_contract_workdays t
    WHERE t.contract_id IN (SELECT id FROM demo_cleanup_archive.employment_contracts_20261015))
  )
 OR EXISTS (SELECT 1 FROM public.store_locations t FULL JOIN demo_cleanup_archive.store_locations_20261015 a USING(store_id)
   WHERE (a.store_id IS NOT NULL OR t.store_id IN (SELECT id FROM demo_cleanup_archive.stores_20261015))
     AND (t.store_id IS NULL OR a.store_id IS NULL OR to_jsonb(t) IS DISTINCT FROM to_jsonb(a)))
 THEN RAISE EXCEPTION 'SOURCE_VS_ARCHIVE_MISMATCH_REFUSE_PURGE'; END IF;
 -- Refuse cleanup if any other real business reference points at seeded IDs.
 IF EXISTS (SELECT 1 FROM public.store_admin_memberships WHERE store_id IN (SELECT id FROM demo_cleanup_archive.stores_20261015))
 OR EXISTS (SELECT 1 FROM public.admin_users WHERE store_id IN (SELECT id FROM demo_cleanup_archive.stores_20261015))
 OR EXISTS (SELECT 1 FROM public.operations_transactions WHERE store_id IN (SELECT id FROM demo_cleanup_archive.stores_20261015))
 OR EXISTS (SELECT 1 FROM public.store_primary_owners WHERE store_id IN (SELECT id FROM demo_cleanup_archive.stores_20261015))
 OR EXISTS (SELECT 1 FROM public.employee_documents WHERE employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
 OR EXISTS (SELECT 1 FROM public.payroll_snapshot WHERE employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
 OR EXISTS (SELECT 1 FROM public.payroll_weekly_approvals WHERE employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
 OR EXISTS (SELECT 1 FROM public.event_corrections WHERE employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
 OR EXISTS (SELECT 1 FROM public.correction_requests WHERE employee_id IN (SELECT id FROM demo_cleanup_archive.employees_20261015))
 THEN RAISE EXCEPTION 'LIVE_BUSINESS_REFERENCE_REFUSE_PURGE'; END IF;
END;
$pre$;

DELETE FROM public.employment_contract_workdays t
WHERE t.contract_id IN (SELECT distinct contract_id FROM demo_cleanup_archive.employment_contract_workdays_20261015);
DELETE FROM public.employment_contracts t USING demo_cleanup_archive.employment_contracts_20261015 a WHERE t.id=a.id;
DELETE FROM public.employment_periods t USING demo_cleanup_archive.employment_periods_20261015 a WHERE t.id=a.id;
DELETE FROM public.attendance_events t USING demo_cleanup_archive.attendance_events_20261015 a WHERE t.id=a.id;
DELETE FROM public.employees t USING demo_cleanup_archive.employees_20261015 a WHERE t.id=a.id;
DELETE FROM public.store_locations t USING demo_cleanup_archive.store_locations_20261015 a WHERE t.store_id=a.store_id;
DELETE FROM public.stores t USING demo_cleanup_archive.stores_20261015 a WHERE t.id=a.id;
-- Zero seed rows remain in operating tables. Originals are recoverable
-- from private demo_cleanup_archive, not accessible through public Data API.
DO $post$
BEGIN
 IF EXISTS (SELECT 1 FROM public.stores WHERE source_store_key LIKE 'demo_%')
 OR EXISTS (SELECT 1 FROM public.employees WHERE store_id<>1)
 OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id=1 AND onboarding_status='READY')
 THEN RAISE EXCEPTION 'SEED_PURGE_POSTCONDITION_FAILED'; END IF;
END;
$post$;
COMMIT;
