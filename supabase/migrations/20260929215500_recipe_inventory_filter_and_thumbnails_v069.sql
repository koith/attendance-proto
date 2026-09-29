-- v0.69 production migration summary.
-- 1) Source recipe rows can now own the official menu thumbnail directly.
alter table public.recipe_source_variants add column if not exists thumbnail_url text;

-- 2) Raw inventory/topping rows are intentionally excluded by the three recipe-list RPCs
--    (admin_store_recipe_list, store_recipe_list_public, staff_recipe_list).
--    Production definitions use: WHERE v.category <> '토핑'
--    Manufacturing recipes / semi-finished bases remain visible.

-- 3) Representative official thumbnails for grouped recipes.
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260721/3e21da1cf9630c903473cf031e0f6969.png' where menu_name='오트/코코넛 밀크 라떼';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260721/3fa8cf07121f00c523e662a89963b4fb.png' where menu_name='레몬/자몽차';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260721/87968ad2ba867cba24069212af323dd2.png' where menu_name='오미자/매실차';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260721/ecb69184cb481a8ecbc759a468d94c22.png' where menu_name like '티백 5종%';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260709/menu-417.webp' where menu_name like '바삭 반반 강정%';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260709/menu-422.webp' where menu_name='볶음밥 3종';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260709/menu-425.webp' where menu_name like '케이크 4종%';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260709/menu-434.webp' where menu_name like '크로아상 붕어빵 2종%';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260709/menu-436.webp' where menu_name='탕종 베이글 3종';
update recipe_source_variants set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260709/menu-440.webp' where menu_name='크림 소금빵';
