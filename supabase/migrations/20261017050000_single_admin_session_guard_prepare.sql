-- #998: Single active authenticated session per user, enforced for PostgREST.
-- Deliberately split activation: install objects first, enable db_pre_request only after
-- integration QA. Never revoke unrelated anonymous POS traffic.
create schema if not exists session_guard;
revoke all on schema session_guard from public, anon, authenticated;
create table if not exists session_guard.latest_session (
  user_id uuid primary key,
  session_id uuid not null,
  issued_at timestamptz not null default clock_timestamp()
);
revoke all on session_guard.latest_session from public, anon, authenticated;
create or replace function session_guard.record_latest_session()
returns trigger language plpgsql security definer
set search_path = pg_catalog, session_guard as $$
begin
  insert into session_guard.latest_session(user_id,session_id,issued_at)
  values (new.user_id,new.id,clock_timestamp())
  on conflict (user_id) do update set
    session_id=excluded.session_id,issued_at=excluded.issued_at;
  return new;
end $$;
revoke all on function session_guard.record_latest_session() from public,anon,authenticated;
drop trigger if exists record_latest_session_v1 on auth.sessions;
create trigger record_latest_session_v1
after insert on auth.sessions
for each row execute function session_guard.record_latest_session();

-- For legacy existing sessions, choose newest by created_at, but never overwrite
-- a newer session captured by the trigger.
insert into session_guard.latest_session(user_id,session_id,issued_at)
select distinct on (user_id) user_id,id,created_at
from auth.sessions
order by user_id,created_at desc,id desc
on conflict (user_id) do update set
session_id=excluded.session_id,issued_at=excluded.issued_at
where session_guard.latest_session.issued_at < excluded.issued_at;

create or replace function session_guard.require_latest_session()
returns void language plpgsql security definer
set search_path = pg_catalog, session_guard as $$
declare
  claims jsonb;
  uid uuid;
  sid uuid;
  latest uuid;
begin
  -- Current PostgREST publishes the role in signed request.jwt.claims.
  -- The legacy request.jwt.claim.role GUC is not guaranteed to exist.
  claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  if coalesce(claims->>'role',nullif(current_setting('request.jwt.claim.role',true),''))
       is distinct from 'authenticated' then
    return; -- Anon POS and public recipes remain usable.
  end if;
  uid := nullif(claims->>'sub','')::uuid;
  -- Staff and other non-admin authenticated users are not subject to the
  -- single-admin-session policy. Do not silently invalidate their devices.
  if not exists (select 1 from public.admin_users a where a.user_id=uid) then
    return;
  end if;
  sid := nullif(claims->>'session_id','')::uuid;
  if uid is null or sid is null then
    raise exception 'SESSION_SUPERSEDED' using errcode='P0001';
  end if;
  select session_id into latest from session_guard.latest_session where user_id=uid;
  if latest is distinct from sid then
    raise exception 'SESSION_SUPERSEDED' using errcode='P0001';
  end if;
end $$;
revoke all on function session_guard.require_latest_session() from public,anon;
-- PostgREST calls db_pre_request AFTER switching to anon/authenticated role.
-- Both need schema USAGE and function EXECUTE. Not table access.
grant usage on schema session_guard to anon,authenticated,authenticator;
grant execute on function session_guard.require_latest_session() to anon,authenticated,authenticator;
-- IMPORTANT: activation in separate migration after QA:
-- ALTER ROLE authenticator SET pgrst.db_pre_request = 'session_guard.require_latest_session';
-- NOTIFY pgrst, 'reload config';
-- Rollback: ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';
