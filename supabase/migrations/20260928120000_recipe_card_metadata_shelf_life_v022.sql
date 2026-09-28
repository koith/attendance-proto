-- v0.22 supplied recipe/inventory metadata
alter table public.inventory_source_reference
  add column if not exists storage_before text,
  add column if not exists storage_after text,
  add column if not exists expiry_before text,
  add column if not exists expiry_after text,
  add column if not exists after_portion text,
  add column if not exists safety_note text;
with v(sku,storage_before,storage_after,expiry_before,expiry_after,after_portion,safety_note) as (values
('SRC-47C9DBB34AC5','실온','실온','UBD','1개월','(소) 7일',''),
('SRC-05DD00D5674A','실온','실온','UBD','6개월','(소) 1개월',''),
('SRC-4611418A05BB','실온','실온','UBD','6개월','(소) 14일',''),
('SRC-84B0A55BD436','실온','실온','UBD','6개월','(소) 14일',''),
('SRC-5EB57167DBD0','실온','실온','UBD','6개월','(소) 1개월',''),
('SRC-F59C4B123DFE','','실온','UBD','6개월','(소) 14일',''),
('SRC-3F7CE569349E','실온','실온','UBD','6개월','(소) 1개월',''),
('SRC-020E3CB86F90','실온','실온','UBD','6개월','(소) 1개월',''),
('SRC-3FA2DAEC439B','실온','실온','UBD','6개월','(소) 1개월',''),
('SRC-C3ABE712F261','실온','실온','UBD','1년','(소) 1개월',''),
('SRC-616860961D09','실온','실온','UBD','1개월','(소) 7일',''),
('SRC-D9C675DD02DF','','실온','','6개월','(소) 14일',''),
('SRC-7AFF92F97B02','','냉장','지 일반 1분 UBD','3개월','(소) 14일',''),
('SRC-BAAC6C06306E','지 일반 1분 실온','실온','UBD','6개월','',''),
('SRC-35273BEFF24A','실온','냉장','UBD','3개월','(소) 14일',''),
('SRC-4915AD75336B','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-130C6A28B431','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-3C295D07528E','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-38F242861759','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-74F023F5F833','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-46B79901B77A','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-479CECF06C45','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-70B5EA488C8B','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-AC4EF158B3B0','실온','실온','UBD','6개월','',''),
('SRC-E0C1B66B5EAA','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-5B22EEB0A52D','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-654817441A39','실온','상온','UBD','6개월','(소) 14일',''),
('SRC-FFC606ABEF55','냉동','냉동','UBD','1개월','-',''),
('SRC-03503C19DD89','냉동','냉동','UBD','1개월','(소) 4일',''),
('SRC-47BE699CF0F8','냉동','냉장','UBD','1개월','(소) 4일',''),
('SRC-92239A789D2E','냉동','냉동','UBD','1개월','(소) 4일',''),
('SRC-FE05EC98C29C','냉동','냉동','UBD','1개월','(소) 4일',''),
('SRC-AE44523859F6','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-72A0BD48B501','실온','냉장','UBD','6개월','(소) 7일',''),
('SRC-EB83EC07AFC5','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-2AD26A89313E','냉동','냉장','UBD','3개월','(소) 3일',''),
('SRC-FB7D09CCC992','실온','냉장','UBD','1개월','(소) 7일',''),
('SRC-1B8BC96BFA70','실온','냉장','UBD','3일','-',''),
('SRC-78FC877FE22B','실온','냉장','UBD','1일','-',''),
('SRC-E6FF521D1BA7','실온','냉장','UBD','1일','-',''),
('SRC-13B89D0B442F','실온','냉장','UBD','1일','-',''),
('SRC-90AE885D4438','실온','냉장','UBD','5일','(소) 3일','')
)
update public.inventory_source_reference r set storage_before=v.storage_before,storage_after=v.storage_after,expiry_before=v.expiry_before,expiry_after=v.expiry_after,after_portion=v.after_portion,safety_note=v.safety_note from v where r.sku=v.sku;
insert into public.recipe_source_variants(menu_name,category,source_version,sort_order,variant_label,content)
select '추가 옵션','푸드 조리','26.09.11',999,'소시지 · 계란 후라이','①볶음밥 7분 조리 후\n②추가 옵션(소시지 또는 계란 후라이)을 넣고 전자레인지 1분\n*상태 확인 후 부족하면 1분 추가 가열'
where not exists(select 1 from public.recipe_source_variants where menu_name='추가 옵션');
insert into public.recipe_source_components(menu_name,variant_label,line_order,ingredient_name,quantity,unit,source_line)
select '추가 옵션','소시지 · 계란 후라이',1,'소시지',null,'옵션','추가 옵션: 소시지' where not exists(select 1 from public.recipe_source_components where menu_name='추가 옵션' and ingredient_name='소시지');
insert into public.recipe_source_components(menu_name,variant_label,line_order,ingredient_name,quantity,unit,source_line)
select '추가 옵션','소시지 · 계란 후라이',2,'계란 후라이',null,'옵션','추가 옵션: 계란 후라이' where not exists(select 1 from public.recipe_source_components where menu_name='추가 옵션' and ingredient_name='계란 후라이');

-- Operational topping reference cards from the supplied 26.09.11 panel.
insert into public.recipe_source_variants(menu_name,category,source_version,sort_order,variant_label,content)
select * from (values
('카페시럽','토핑','26.09.11',1000,'1회 제공량','포모나시럽펌프 · 1P · 10g'),
('바닐라시럽','토핑','26.09.11',1001,'1회 제공량','포모나시럽펌프 · 3P · 30g'),
('헤이즐넛시럽','토핑','26.09.11',1002,'1회 제공량','포모나시럽펌프 · 3P · 30g'),
('제로바닐라시럽','토핑','26.09.11',1003,'1회 제공량','포모나시럽펌프 · 3P · 30g'),
('제로헤이즐넛시럽','토핑','26.09.11',1004,'1회 제공량','포모나시럽펌프 · 3P · 30g'),
('꿀베이스','토핑','26.09.11',1005,'1회 제공량','코리안 블렌딩 펌프 · 4P · 52g'),
('카라멜소스','토핑','26.09.11',1006,'1회 제공량','까로망소스 펌프 · 3P · 90g'),
('타피오카펄','토핑','26.09.11',1007,'1회 제공량','제조 후 사용 · 1EA · 60g'),
('코코넛젤리','토핑','26.09.11',1008,'1회 제공량','큰 바스푼 사용 · 50g · 1스푼=15g')
) v(menu_name,category,source_version,sort_order,variant_label,content)
where not exists(select 1 from public.recipe_source_variants x where x.menu_name=v.menu_name and x.category='토핑');
