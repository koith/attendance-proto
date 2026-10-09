-- Cron worker follows the existing read-only detector. Never embed any service key in SQL.
-- Internal requests are authenticated by the 256-bit secret stored only in Supabase Vault.
select cron.schedule(
  'baekeok-sheet-server-writer',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-sheet-autosync-token',(select decrypted_secret from vault.decrypted_secrets where name='baekeok_sheet_autosync_token')
    ),
    body := '{"mode":"cron","store_id":1}'::jsonb,
    timeout_milliseconds := 50000
  );
  $job$
);
