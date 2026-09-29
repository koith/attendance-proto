-- Keep the live source-recipe categories aligned with the employee recipe UI taxonomy.
update public.recipe_source_variants
set category = case
  when category='디저트&베이커리' then '푸드류(베이커리)'
  when category='백억휴게소' then '푸드류(백억 휴게소)'
  when category='백억 시네마' then '푸드류(백억 시네마)'
  when category='밀크쉐이크' then '스무디'
  when category='라떼&버블티' and menu_name ~ '^(찐[ ]*)' then '찐 우유'
  when category='라떼&버블티' and menu_name ~ '(버블|흑당)' then '버블티'
  when category='라떼&버블티' then '라떼'
  when category='스무디&에이드' and menu_name ~ '스무디' then '스무디'
  when category='스무디&에이드' and menu_name ~ '주스' then '주스'
  when category='스무디&에이드' then '에이드'
  when category='티&주스' and menu_name ~ '(주스|식혜)' then '주스'
  when category='티&주스' then '티 & 스윗티'
  when category='커피&콜드브루' and menu_name ~ '(라떼|마끼아또|모카)' then '라떼'
  when category='커피&콜드브루' then '커피'
  when category='시그니처' and menu_name ~ '라떼' then '라떼'
  when category='시그니처' and menu_name ~ '커피' then '커피'
  when category='시그니처' then '에이드'
  when category='신메뉴' and menu_name ~ '(핫도그|프라이|팝콘|볶음밥|떡볶이|감자)' then '푸드 조리'
  when category='신메뉴' and menu_name ~ '스무디|밀크쉐이크' then '스무디'
  when category='신메뉴' and menu_name ~ '주스' then '주스'
  when category='신메뉴' and menu_name ~ '라떼' then '라떼'
  when category='신메뉴' then '에이드'
  else category
end
where category <> '대용량 베이스';

-- Official menu-board assets currently exposed by the official site.
update public.recipe_versions set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260806/0327d5bd383657b99ffb1993f3e91e0e.png'
where effective_to is null and is_demo=false and menu_name='트로피컬 피나콜라다' and coalesce(thumbnail_url,'')='';
update public.recipe_versions set thumbnail_url='https://10billioncoffee.co.kr/uploads/menu_boards/20260806/1e3b8cd303967602c1cb5a7cc0bd8c74.png'
where effective_to is null and is_demo=false and menu_name='선셋 코스모폴리탄' and coalesce(thumbnail_url,'')='';
