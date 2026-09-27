-- Cover the foreign keys introduced by v220 and make the demo archive
-- idempotent/queryable without full scans.
create index if not exists admin_users_store_id_idx
  on public.admin_users(store_id);
create index if not exists inventory_manual_items_source_item_id_idx
  on public.inventory_manual_items(source_item_id);
create index if not exists store_notifications_product_id_idx
  on public.store_notifications(product_id);

alter table public.recipe_versions_demo_archive
  add constraint recipe_versions_demo_archive_pkey primary key(id);
alter table public.recipe_components_demo_archive
  add constraint recipe_components_demo_archive_pkey
  primary key(recipe_version_id,item_id);
