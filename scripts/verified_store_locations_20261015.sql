-- Verified public storefront addresses, checked 2026-10-15 KST.
-- Source: first-party 10billioncoffee.co.kr/store (11 exact names);
--         PassOrder listed under the exact business name (금호역점).
-- This is an ADDITIVE, idempotent geographic enrichment only.
-- Never replace existing verified addresses, modify store status, or create stores.
-- Location labels follow official 2026-07-01 전남광주통합특별시 merger.
with candidates (name,address,province,district,subdistrict,source_url) as (
 values
  ('광주금호점', '전남광주 서구 금화로 67 1층 105호 (금호동 우진빌딩)', '전남광주통합특별시', '서구', '', 'https://10billioncoffee.co.kr/store'),
  ('광주송정점', '전남광주 광산구 상무대로 208-1', '전남광주통합특별시', '광산구', '', 'https://10billioncoffee.co.kr/store'),
  ('광주수완점', '전남광주 광산구 장신로 136 101호 (수완동, 본타워)', '전남광주통합특별시', '광산구', '', 'https://10billioncoffee.co.kr/store'),
  ('광주전남대점', '전남광주통합특별시 북구 서방로 7-1 1층', '전남광주통합특별시', '북구', '', 'https://10billioncoffee.co.kr/store'),
  ('광주충장로점', '전남광주 동구 충장로 77-4 1층', '전남광주통합특별시', '동구', '', 'https://10billioncoffee.co.kr/store'),
  ('나주혁신점', '전남광주 나주시 상야1길 7 1층 104호', '전남광주통합특별시', '나주시', '', 'https://10billioncoffee.co.kr/store'),
  ('목포남악점', '전남광주통합특별시 무안군 삼향읍 남악2로74번길 33', '전남광주통합특별시', '무안군', '', 'https://10billioncoffee.co.kr/store'),
  ('목포터미널점', '전남광주 목포시 영산로 517', '전남광주통합특별시', '목포시', '', 'https://10billioncoffee.co.kr/store/221-%EB%AA%A9%ED%8F%AC%ED%84%B0%EB%AF%B8%EB%84%90%EC%A0%90'),
  ('순천법원점', '전남광주 순천시 왕지1길 3-4 1층', '전남광주통합특별시', '순천시', '', 'https://10billioncoffee.co.kr/store'),
  ('전남장성점', '전남광주 장성군 장성읍 단풍로 30 상가동 1층 107호 (대광 로제비앙)', '전남광주통합특별시', '장성군', '', 'https://10billioncoffee.co.kr/store'),
  ('성수점', '서울 성동구 아차산로 49 1층 105-1호', '서울특별시', '성동구', '', 'https://10billioncoffee.co.kr/store/77-%EC%84%B1%EC%88%98%EC%A0%90'),
  ('금호역점', '서울특별시 성동구 장터길 17-2 (금호동3가)', '서울특별시', '성동구', '', 'https://app.passorder.co.kr/normal/05de92d1-a638-4cd0-ba28-e4360cc4bc4e')
), exact_store as (
 select s.id, c.address,c.province,c.district,c.subdistrict,c.source_url
 from candidates c join public.stores s on s.name=c.name
 where (select count(*) from public.stores s2 where s2.name=c.name)=1
)
insert into public.store_locations (store_id,address,province,district,subdistrict,source_url,verified_at)
select e.id,e.address,e.province,e.district,e.subdistrict,e.source_url,now()
from exact_store e
where not exists (select 1 from public.store_locations old where old.store_id=e.id)
on conflict (store_id) do nothing;
