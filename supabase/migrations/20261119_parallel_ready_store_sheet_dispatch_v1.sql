-- Dispatch all eligible changed READY stores concurrently; retain the existing
-- INHA writer (job 5) and the existing staff/change detector (job 3).
-- No test-store data, production secrets or direct Google writes in this SQL.
-- pg_net delivers one HTTP request per eligible store; each Edge invocation
-- validates its own immutable store identity and takes a store-month DB lease.
-- The 15-minute refresh keeps ongoing shift duration reports from going stale.
SELECT cron.schedule('baekeok-sheet-ready-stores-writer','* * * * *',$cron$
  SELECT net.http_post(
    url := 'https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-sheet-autosync-token',
      (SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name='baekeok_sheet_autosync_token')
    ),
    body := jsonb_build_object('mode','cron','store_id',s.id),
    timeout_milliseconds := 50000
  )
  FROM public.stores AS s
  JOIN public.sheet_sync_change_state AS c ON c.store_id=s.id
  WHERE s.is_active=true
    AND s.onboarding_status='READY'
    AND s.id<>1 AND s.id<>80
    AND s.code ~ '^(REAL_|BC_)[0-9]+$'
    AND s.name NOT LIKE '[QA%'
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.store_id=s.id)
    AND (
      c.synced_at IS NULL OR c.changed_at>c.synced_at
      OR NOT EXISTS (
        SELECT 1 FROM public.sheet_sync_month_state m
        WHERE m.store_id=s.id
          AND m.ym=to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM')
          AND m.synced_at>now()-interval '15 minutes'
      )
    )
  ORDER BY s.id;
$cron$);
