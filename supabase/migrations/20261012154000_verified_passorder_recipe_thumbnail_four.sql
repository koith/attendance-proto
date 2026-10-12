-- Four exact-name menu images verified against publicly listed Baekeok Coffee
-- merchant menus (PassOrder). Preserve every existing non-null photograph.
-- Evidence:
-- 34/135/104: Baekeok Coffee Bangbae station menu
--   https://app.passorder.co.kr/normal/a3563570-7296-43db-85c8-fae07858cdbe/menus
-- 93: Baekeok Coffee Bangi store menu
--   https://app.passorder.co.kr/normal/f0ba7806-e401-430f-9ffe-67a1095fc4e6/menus
-- These are product-specific menu photos, not guessed similar-product assets.
UPDATE public.recipe_versions AS r
SET thumbnail_url = verified.image_url
FROM (
  VALUES
    (34::bigint, '연유 버터떡', 'https://passorder-static.passorder.site/store/1067fb4b-583f-4977-929a-27ffcd75febf/menu/b918db87-9a74-44f4-862b-1acdb8556faf/999/260429-231448-048643.image'),
    (93::bigint, '콜드브루 연유라떼', 'https://passorder-static.passorder.site/store/1067fb4b-583f-4977-929a-27ffcd75febf/menu/ea1a27cd-3c6e-4d64-bf71-b0e95c3f9b43/999/250918-065749-953581.image'),
    (104::bigint, '패스츄리 호두과자(5EA)', 'https://passorder-static.passorder.site/store/1067fb4b-583f-4977-929a-27ffcd75febf/menu/8e9730f5-5d79-487b-8d95-cc63c644bcc5/999/260709-032316-291917.image'),
    (135::bigint, '빅 초코 버터떡', 'https://passorder-static.passorder.site/store/1067fb4b-583f-4977-929a-27ffcd75febf/menu/b918db87-9a74-44f4-862b-1acdb8556faf/999/260705-231623-582231.image')
) AS verified(recipe_id, exact_name, image_url)
WHERE r.id = verified.recipe_id
  AND r.menu_name = verified.exact_name
  AND r.is_demo IS FALSE
  AND r.effective_to IS NULL
  AND r.thumbnail_url IS NULL;
