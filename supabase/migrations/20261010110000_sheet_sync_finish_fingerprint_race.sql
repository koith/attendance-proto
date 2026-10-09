-- A new desired fingerprint may arrive while a Google Sheet write holds the lease.
-- Finish the write for its own claim token; keep the newer desired fingerprint pending.
-- This prevents CLAIM_STALE after a successful external Sheet write and preserves catch-up.
CREATE OR REPLACE FUNCTION public.sheet_autosync_finish(p_store_id bigint, p_ym text, p_fingerprint text, p_claim uuid, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count int;
begin
 update public.sheet_sync_month_state set
  synced_fingerprint=case when p_ok then p_fingerprint else synced_fingerprint end,
  synced_at=case when p_ok then now() else synced_at end,
  claimed_until=null,claim_token=null,
  retry_after=case when p_ok then null else now()+make_interval(secs=>least(3600,15*power(2,least(attempt_count,8))::integer)) end,
  last_error=case when p_ok then null else left(coalesce(p_error,'UNKNOWN_ERROR'),1000) end
 where store_id=p_store_id and ym=p_ym and claim_token=p_claim;
 get diagnostics v_count=row_count;
 return v_count=1;
end $function$
;
