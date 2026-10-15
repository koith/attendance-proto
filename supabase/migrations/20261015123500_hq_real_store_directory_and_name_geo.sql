-- Preserve the 157 seeded employees and 4,726 linked attendance events for traceability.
-- These 39 seeded DEMO stores are not real storefronts. Exclude them from
-- current HQ operational selectors and headcounts, without destructive DML.
-- Keep the existing RPC signatures, authorization checks, and grants intact.
create or replace function public.hq_stores_onboarding_list()
returns table (id bigint,name text,code text,region_group text,is_active boolean,onboarding_status text,manager_count bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  select s.id,s.name,s.code,s.region_group,s.is_active,s.onboarding_status,
    (select count(*) from public.admin_users a join auth.users u on u.id=a.user_id
     where a.store_id=s.id and a.admin_role='STORE_MANAGER'
       and u.email_confirmed_at is not null and u.deleted_at is null
       and not u.is_anonymous and (u.banned_until is null or u.banned_until<now()))
  from public.stores s
  where coalesce(s.source_store_key,'') not like 'demo_%'
  order by s.name,s.id;
end;
$$;

create or replace function public.hq_store_catalog()
returns table (id bigint,name text,code text,region_group text,onboarding_status text,is_active boolean,owners bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
  select s.id,s.name,s.code,s.region_group,s.onboarding_status,s.is_active,
    (select count(*) from public.admin_users a where a.store_id=s.id and a.admin_role='STORE_MANAGER')
  from public.stores s
  where coalesce(s.source_store_key,'') not like 'demo_%'
  order by s.region_group,s.name;
end;
$$;

create or replace function public.hq_store_locations_list()
returns table (store_id bigint,address text,province text,district text,subdistrict text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_hq_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  return query
  select l.store_id,l.address,l.province,l.district,l.subdistrict
  from public.store_locations l join public.stores s on s.id=l.store_id
  where coalesce(s.source_store_key,'') not like 'demo_%'
  order by l.store_id;
end;
$$;

-- Name-derived city only. The brand's September 2026 official campaign
-- lists '김해부원점' under '경남'; '김해' establishes Gimhae-si.
-- No street address was found. Keep address/verified_at NULL, so the app
-- can display "지점명 기준 · 상세주소 미확인" and never a false address.
insert into public.store_locations
  (store_id,address,province,district,subdistrict,source_url,verified_at)
select s.id,null,'경상남도','김해시',null,
  'https://10billioncoffee.co.kr/community/event/49',null
from public.stores s
where s.name='김해부원점' and s.source_store_key='official_demo'
  and (select count(*) from public.stores x where x.name='김해부원점')=1
  and not exists(select 1 from public.store_locations l where l.store_id=s.id)
on conflict(store_id) do nothing;
