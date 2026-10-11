-- Source variant #225 and active official recipe #117 are the same product
-- with a single internal space difference in the Korean menu name.
-- Backfill exactly one missing official thumbnail, preserving all recipes,
-- ingredients, staff, payroll, attendance and Sheet data.
UPDATE public.recipe_source_variants v
SET thumbnail_url = rv.thumbnail_url
FROM public.recipe_versions rv
WHERE v.id = 225
  AND v.menu_name = '땅콩버터 오징어'
  AND v.category = '푸드류(백억 시네마)'
  AND NULLIF(TRIM(v.thumbnail_url), '') IS NULL
  AND rv.id = 117
  AND rv.menu_name = '땅콩 버터 오징어'
  AND rv.effective_to IS NULL
  AND rv.is_demo IS FALSE
  AND rv.thumbnail_url LIKE 'https://10billioncoffee.co.kr/uploads/menu_boards/%'
  AND public.recipe_thumbnail_for_source(v.menu_name) = rv.thumbnail_url;
