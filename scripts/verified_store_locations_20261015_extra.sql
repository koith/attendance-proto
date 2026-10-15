-- 2026-10-15 KST additional corroborated store addresses, separate from official names.
-- Exact customer-facing '부천신흥시장점' was checked at DiningCode with public location.
-- '남양주다산점' in our official_demo seed corresponds to the only '다산점'
-- found on both the official 10billioncoffee.co.kr/store and PassOrder,
-- in Namyangju-si, with the identical address 경기 남양주시 경춘로 379.
-- ADD-ONLY; decline nonunique store name or any existing location.
with candidates (name,address,province,district,subdistrict,source_url) as (
 values
 ('부천신흥시장점','경기도 부천시 오정구 중동로408번길 18','경기도','부천시','오정구','https://www.diningcode.com/profile.php?rid=W2Cc9fYV8a6I'),
 ('남양주다산점','경기도 남양주시 경춘로 379 (다산동)','경기도','남양주시','','https://app.passorder.co.kr/normal/0a2cef9f-1be1-4b30-80d1-fced3e23f75a')
)
insert into public.store_locations (store_id,address,province,district,subdistrict,source_url,verified_at)
select s.id,c.address,c.province,c.district,c.subdistrict,c.source_url,now()
from candidates c join public.stores s on s.name=c.name
where (select count(*) from public.stores s2 where s2.name=c.name)=1
 and not exists (select 1 from public.store_locations old where old.store_id=s.id)
on conflict (store_id) do nothing;
