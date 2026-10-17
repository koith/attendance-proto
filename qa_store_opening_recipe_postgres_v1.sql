-- #1000: real recipe migrations, isolated PostgreSQL. Never connect to production.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
 LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('qa.actor',true),'')::uuid $$;
CREATE TABLE public.stores (
 id bigint PRIMARY KEY, code text, name text,
 is_active boolean NOT NULL, onboarding_status text NOT NULL
);
CREATE TABLE public.admin_users (
 user_id uuid PRIMARY KEY, email text NOT NULL
);
CREATE TABLE public.inventory_items (
 id bigint PRIMARY KEY, name text, sku text, unit text,
 is_active boolean NOT NULL DEFAULT true, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.inventory_manual_items (
 id bigint generated always as identity PRIMARY KEY,
 store_id bigint REFERENCES public.stores(id), name text, sku text, category text,
 unit text, on_hand numeric DEFAULT 0, target_level numeric DEFAULT 0,
 reorder_point numeric DEFAULT 0, thumbnail_url text, is_active boolean DEFAULT true,
 updated_at timestamptz DEFAULT now(), UNIQUE(store_id,name)
);
CREATE TABLE public.recipe_versions (
 id bigint PRIMARY KEY, menu_name text, thumbnail_url text,
 is_demo boolean NOT NULL DEFAULT false
);
CREATE TABLE public.recipe_components (
 id bigint PRIMARY KEY, recipe_version_id bigint REFERENCES public.recipe_versions(id),
 item_id bigint REFERENCES public.inventory_items(id), quantity numeric
);
CREATE TABLE public.hq_products (
 id bigint PRIMARY KEY, product_key text, name text, category text,
 recipe_version_id bigint REFERENCES public.recipe_versions(id), status text DEFAULT 'ACTIVE'
);
CREATE TABLE public.store_product_assignments (
 store_id bigint REFERENCES public.stores(id), product_id bigint REFERENCES public.hq_products(id),
 status text NOT NULL DEFAULT 'ACTIVE', discontinued_at timestamptz,
 PRIMARY KEY(store_id,product_id),
 CONSTRAINT store_product_assignments_status_check CHECK(status IN ('ACTIVE','DISCONTINUED'))
);
CREATE TABLE public.hq_product_items(
 product_id bigint REFERENCES public.hq_products(id), item_id bigint REFERENCES public.inventory_items(id),
 created_by_hq boolean DEFAULT true
);
CREATE TABLE public.employees (
 id bigint PRIMARY KEY, store_id bigint REFERENCES public.stores(id),
 is_active boolean DEFAULT true, pin_bcrypt text NOT NULL
);
CREATE TABLE public.attendance_events (
 id bigint PRIMARY KEY, employee_id bigint REFERENCES public.employees(id), event_type text
);
INSERT INTO public.stores VALUES
 (701,'QA701','QA Alpha',true,'READY'),
 (702,'QA702','QA Beta',true,'READY'),
 (703,'QA703','QA Unopened',false,'STAGED');
INSERT INTO public.admin_users VALUES
 ('00000000-0000-4000-8000-000000000001','hq@synthetic.invalid'),
 ('00000000-0000-4000-8000-000000000002','alpha@synthetic.invalid'),
 ('00000000-0000-4000-8000-000000000003','beta@synthetic.invalid');
INSERT INTO public.inventory_items(id,name,sku,unit)
 VALUES (7,'QA Milk','QA-MILK','ml');
INSERT INTO public.recipe_versions(id,menu_name,thumbnail_url)
 VALUES (111,'QA HQ Latte',null);
INSERT INTO public.recipe_components(id,recipe_version_id,item_id,quantity)
 VALUES (1,111,7,180);
INSERT INTO public.hq_products(id,product_key,name,category,recipe_version_id,status)
 VALUES (90001,'QA-LATTE','QA HQ Latte','LATTE',111,'ACTIVE');
INSERT INTO public.store_product_assignments(store_id,product_id)
 VALUES (701,90001),(702,90001);
INSERT INTO public.hq_product_items VALUES (90001,7,true);
-- Apply the real checked-in store override migration; do not reimplement it.
\ir supabase/migrations/20260927183000_recipe_access_store_overrides_and_safe_retirement.sql

UPDATE public.admin_users SET admin_role='HQ' WHERE user_id='00000000-0000-4000-8000-000000000001';
UPDATE public.admin_users SET admin_role='STORE_MANAGER',store_id=701
 WHERE user_id='00000000-0000-4000-8000-000000000002';
UPDATE public.admin_users SET admin_role='STORE_MANAGER',store_id=702
 WHERE user_id='00000000-0000-4000-8000-000000000003';

-- Later real staff recipe migration reads canonical recipe source helpers.
CREATE TABLE public.recipe_source_variants (
 menu_name text, category text, thumbnail_url text
);
INSERT INTO public.recipe_source_variants VALUES ('QA HQ Latte','LATTE',null);
CREATE OR REPLACE FUNCTION public.source_recipe_instructions(p_name text)
 RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_array(jsonb_build_object('label','ICED','content','HQ 180ml')) $$;
CREATE OR REPLACE FUNCTION public.source_recipe_components(p_name text)
 RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_array(jsonb_build_object('item_id',7,'item_name','QA Milk','unit','ml','quantity',180)) $$;
CREATE OR REPLACE FUNCTION public.recipe_thumbnail_for_source(p_name text)
 RETURNS text LANGUAGE sql STABLE AS $$ SELECT null::text $$;
CREATE OR REPLACE FUNCTION public.substitution_is_working(p_employee_id bigint)
 RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT event_type='IN' FROM public.attendance_events
 WHERE employee_id=p_employee_id ORDER BY id DESC LIMIT 1),false) $$;
\ir supabase/migrations/20261011145000_staff_recipe_ready_guard.sql
\ir supabase/migrations/20261011183000_lock_source_recipe_helpers.sql

INSERT INTO public.employees(id,store_id,pin_bcrypt)
 VALUES (210,701,extensions.crypt('1234',extensions.gen_salt('bf'))),
        (220,702,extensions.crypt('4321',extensions.gen_salt('bf')));
SELECT set_config('qa.actor','00000000-0000-4000-8000-000000000002',false);

DO $qa$
DECLARE data record; msg text; changed jsonb;
BEGIN
 SELECT * INTO data FROM public.admin_store_recipe_list(701) LIMIT 1;
 IF data.menu_name<>'QA HQ Latte' OR data.is_overridden THEN
   RAISE EXCEPTION 'SOURCE_RECIPE_ALREADY_CHANGED'; END IF;

 -- Bad components must be rejected, and never create an override.
 BEGIN
  PERFORM public.admin_store_recipe_override_save(
   701,'QA-LATTE','Bad Recipe','LATTE','[]'::jsonb,null,'[]'::jsonb);
  RAISE EXCEPTION 'EMPTY_COMPONENTS_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'COMPONENT_REQUIRED' THEN RAISE EXCEPTION 'WRONG_COMPONENT_GATE %',msg; END IF;
 END;

 changed:=public.admin_store_recipe_override_save(
  701,'QA-LATTE','QA Alpha Special','LOCAL',
  '[{"item_id":7,"quantity":220}]'::jsonb,null,
  '[{"label":"ICED","content":"Alpha only 220ml"}]'::jsonb);
 IF changed->>'ok'<>'true' THEN RAISE EXCEPTION 'SAVE_RESPONSE_BAD'; END IF;
 SELECT * INTO data FROM public.admin_store_recipe_list(701) LIMIT 1;
 IF data.menu_name<>'QA Alpha Special' OR NOT data.is_overridden OR
    data.components->0->>'quantity'<>'220' OR
    data.instructions->0->>'content'<>'Alpha only 220ml'
 THEN RAISE EXCEPTION 'STORED_OVERRIDE_NOT_REFLECTED_IN_LIST'; END IF;

 IF (SELECT name FROM public.hq_products WHERE id=90001)<>'QA HQ Latte'
 OR (SELECT quantity FROM public.recipe_components WHERE id=1)<>180
 THEN RAISE EXCEPTION 'CANONICAL_HQ_RECIPE_MUTATED'; END IF;

 -- Authenticated managers cannot change another store's recipe.
 BEGIN
  PERFORM public.admin_store_recipe_override_save(
   702,'QA-LATTE','Cross-store corruption','LOCAL',
   '[{"item_id":7,"quantity":333}]'::jsonb,null,'[]'::jsonb);
  RAISE EXCEPTION 'CROSS_STORE_SAVE_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'NOT_AUTHORIZED' THEN RAISE EXCEPTION 'WRONG_CROSS_STORE_GATE %',msg; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.store_recipe_overrides WHERE store_id=702)
 THEN RAISE EXCEPTION 'BETA_OVERRIDE_LEAKED'; END IF;
END $qa$;

-- Staff: PIN, READY and current shift must all be enforced.
DO $qa$
DECLARE data record; msg text;
BEGIN
 BEGIN
  PERFORM public.staff_recipe_list(210,'0000',701);
  RAISE EXCEPTION 'INVALID_PIN_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'BAD_PIN' THEN RAISE EXCEPTION 'WRONG_PIN_GATE %',msg; END IF;
 END;
 BEGIN
  PERFORM public.staff_recipe_list(210,'1234',701);
  RAISE EXCEPTION 'OFF_SHIFT_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'NOT_CLOCKED_IN' THEN RAISE EXCEPTION 'WRONG_SHIFT_GATE %',msg; END IF;
 END;
 UPDATE public.stores SET is_active=false WHERE id=701;
 BEGIN
  PERFORM public.staff_recipe_list(210,'1234',701);
  RAISE EXCEPTION 'INACTIVE_STORE_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'STORE_NOT_READY' THEN RAISE EXCEPTION 'WRONG_READY_GATE %',msg; END IF;
 END;
 UPDATE public.stores SET is_active=true WHERE id=701;
 INSERT INTO public.attendance_events VALUES (1,210,'IN'),(2,220,'IN');
 SELECT * INTO data FROM public.staff_recipe_list(210,'1234',701) LIMIT 1;
 IF data.menu_name<>'QA Alpha Special' OR
    data.instructions->0->>'content'<>'Alpha only 220ml'
 THEN RAISE EXCEPTION 'CLOCKED_IN_STAFF_MISSES_LOCAL_OVERRIDE'; END IF;
 SELECT * INTO data FROM public.staff_recipe_list(220,'4321',702) LIMIT 1;
 IF data.menu_name<>'QA HQ Latte' OR
    data.instructions->0->>'content'<>'HQ 180ml'
 THEN RAISE EXCEPTION 'BETA_STAFF_RECEIVED_ALPHA_OVERRIDE'; END IF;
END $qa$;

SELECT set_config('qa.actor','00000000-0000-4000-8000-000000000003',false);
DO $qa$
DECLARE data record; msg text;
BEGIN
 SELECT * INTO data FROM public.admin_store_recipe_list(702) LIMIT 1;
 IF data.menu_name<>'QA HQ Latte' OR data.is_overridden
 THEN RAISE EXCEPTION 'BETA_ADMIN_RECEIVED_ALPHA_OVERRIDE'; END IF;
 BEGIN
  PERFORM public.admin_store_recipe_override_clear(701,'QA-LATTE');
  RAISE EXCEPTION 'BETA_CLEARED_ALPHA_OVERRIDE';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg<>'NOT_AUTHORIZED' THEN RAISE EXCEPTION 'WRONG_CLEAR_AUTHZ %',msg; END IF;
 END;
END $qa$;
SELECT set_config('qa.actor','00000000-0000-4000-8000-000000000002',false);
SELECT public.admin_store_recipe_override_clear(701,'QA-LATTE');
DO $qa$
DECLARE data record;
BEGIN
 SELECT * INTO data FROM public.admin_store_recipe_list(701) LIMIT 1;
 IF data.is_overridden OR data.menu_name<>'QA HQ Latte'
 THEN RAISE EXCEPTION 'CLEAR_FAILED_TO_RESTORE_SOURCE'; END IF;
 IF EXISTS(SELECT 1 FROM public.store_recipe_overrides WHERE store_id=701)
 THEN RAISE EXCEPTION 'OVERRIDE_ROW_REMAINED_AFTER_CLEAR'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hq_products WHERE id=90001 AND name='QA HQ Latte')
 THEN RAISE EXCEPTION 'CANONICAL_SOURCE_DELETED'; END IF;
 IF has_function_privilege('anon','public.admin_store_recipe_override_save(bigint,text,text,text,jsonb,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'ANON_RECIPE_WRITE_ALLOWED'; END IF;
END $qa$;
\echo PASS: real recipe migration, manager tenant boundary, source immutability, staff PIN/shift/READY, save/read/restore
