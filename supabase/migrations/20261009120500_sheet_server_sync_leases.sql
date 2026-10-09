-- Server-only lock/retry/dedup and private cron authentication for monthly Sheets writes.
create table if not exists public.sheet_sync_month_state (
  store_id bigint not null references public.stores(id),
  ym text not null check(ym ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  desired_fingerprint text not null,
  synced_fingerprint text,
  synced_at timestamptz,
  claimed_until timestamptz,
  claim_token uuid,
  attempt_count integer not null default 0,
  retry_after timestamptz,
  last_error text,
  primary key(store_id,ym)
);
alter table public.sheet_sync_month_state enable row level security;
revoke all on public.sheet_sync_month_state from anon,authenticated;
grant select,insert,update on public.sheet_sync_month_state to service_role;

do $private$
begin
 if not exists(select 1 from vault.secrets where name='baekeok_sheet_autosync_token') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'baekeok_sheet_autosync_token','Private scheduled Google Sheet writer token');
 end if;
end $private$;

-- The Edge Function calls this with its server-side service_role key.
-- Never allow the public Data API to validate or oracle-guess a token.
create or replace function public.sheet_autosync_token_valid(p_token text)
returns boolean language sql stable security definer
set search_path=public,pg_temp as $fn$
 select length(coalesce(p_token,''))>=64
   and exists(select 1 from vault.decrypted_secrets v
     where v.name='baekeok_sheet_autosync_token' and v.decrypted_secret=p_token)
$fn$;
revoke all on function public.sheet_autosync_token_valid(text) from public,anon,authenticated;
grant execute on function public.sheet_autosync_token_valid(text) to service_role;

-- Atomic 2-minute lease. Skips identical confirmed source and respects backoff.
create or replace function public.sheet_autosync_claim(
  p_store_id bigint,p_ym text,p_fingerprint text,p_force boolean default false)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $fn$
declare r public.sheet_sync_month_state%rowtype; v_claim uuid;
begin
 if p_ym !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or length(coalesce(p_fingerprint,''))<32 then raise exception 'BAD_SYNC_REQUEST';end if;
 insert into public.sheet_sync_month_state(store_id,ym,desired_fingerprint)
 values(p_store_id,p_ym,p_fingerprint)
 on conflict(store_id,ym) do update set desired_fingerprint=excluded.desired_fingerprint;
 select * into r from public.sheet_sync_month_state where store_id=p_store_id and ym=p_ym for update;
 if (not p_force and r.synced_fingerprint=p_fingerprint)
    or (r.claimed_until is not null and r.claimed_until>now())
    or (not p_force and r.retry_after is not null and r.retry_after>now()) then
   return null;
 end if;
 v_claim=gen_random_uuid();
 update public.sheet_sync_month_state set claim_token=v_claim,claimed_until=now()+interval '2 minutes',
   attempt_count=case when synced_fingerprint is distinct from p_fingerprint then 1 else attempt_count+1 end,
   retry_after=null,last_error=null
 where store_id=p_store_id and ym=p_ym;
 return v_claim;
end $fn$;
revoke all on function public.sheet_autosync_claim(bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function public.sheet_autosync_claim(bigint,text,text,boolean) to service_role;

create or replace function public.sheet_autosync_finish(
 p_store_id bigint,p_ym text,p_fingerprint text,p_claim uuid,p_ok boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $fn$
declare v_count int;
begin
 update public.sheet_sync_month_state set
  synced_fingerprint=case when p_ok then p_fingerprint else synced_fingerprint end,
  synced_at=case when p_ok then now() else synced_at end,
  claimed_until=null,claim_token=null,
  retry_after=case when p_ok then null else now()+make_interval(secs=>least(3600,15*power(2,least(attempt_count,8))::integer)) end,
  last_error=case when p_ok then null else left(coalesce(p_error,'UNKNOWN_ERROR'),1000) end
 where store_id=p_store_id and ym=p_ym and claim_token=p_claim and desired_fingerprint=p_fingerprint;
 get diagnostics v_count=row_count;
 return v_count=1;
end $fn$;
revoke all on function public.sheet_autosync_finish(bigint,text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.sheet_autosync_finish(bigint,text,text,uuid,boolean,text) to service_role;
