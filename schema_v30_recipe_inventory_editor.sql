-- V1.59 recipe editor support. Applied to production Supabase on 2026-09-26.
alter table public.recipe_versions add column if not exists category text;

-- Production also has admin_recipe_save(...) and admin_recipe_list_v2() RPCs.
-- admin_recipe_save accepts only active inventory_items as components so recipe
-- composition remains linked to the inventory master instead of free-text notes.
-- Current public menu catalog names/categories were seeded from the live
-- Baekeok Coffee Lafesta Passorder menu on 2026-09-26. Proprietary preparation
-- quantities were not invented; menus without verified BOM remain component-empty
-- until an administrator registers inventory-backed quantities.
