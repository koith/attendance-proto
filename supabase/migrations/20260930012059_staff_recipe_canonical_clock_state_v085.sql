-- v0.85 staff recipe access must follow canonical corrected attendance state.
create or replace function public.staff_recipe_list(p_employee_id bigint,p_pin text,p_store_id bigint)
returns table(product_id bigint,recipe_version_id bigint,menu_key text,menu_name text,category text,thumbnail_url text,instructions jsonb,components jsonb,assignment_status text,retirement_requested_at timestamptz)
language plpgsql security definer set search_path='public','extensions','pg_temp' as $$
begin
 if not exists(select 1 from public.employees e where e.id=p_employee_id and e.store_id=p_store_id and e.is_active and e.pin_bcrypt=crypt(p_pin,e.pin_bcrypt)) then raise exception 'BAD_PIN'; end if;
 if not public.substitution_is_working(p_employee_id) then raise exception 'NOT_CLOCKED_IN'; end if;
 return query
 with src as (
   select v.menu_name,min(v.category) category,max(nullif(v.thumbnail_url,'')) thumbnail_url
   from public.recipe_source_variants v where v.category<>'토핑' group by v.menu_name
 ), base as (
  select hp.id product_id,hp.recipe_version_id,coalesce(hp.product_key,'source_'||md5(s.menu_name)) menu_key,s.menu_name,s.category,
         coalesce(s.thumbnail_url,rv.thumbnail_url,public.recipe_thumbnail_for_source(s.menu_name)) thumbnail_url,
         public.source_recipe_instructions(s.menu_name) instructions,public.source_recipe_components(s.menu_name) components
  from src s
  left join lateral (select p.* from public.hq_products p where p.status='ACTIVE' and regexp_replace(lower(p.name),'[^0-9a-z가-힣]','','g')=regexp_replace(lower(s.menu_name),'[^0-9a-z가-힣]','','g') order by p.id limit 1) hp on true
  left join public.recipe_versions rv on rv.id=hp.recipe_version_id
 )
 select b.product_id,b.recipe_version_id,b.menu_key,coalesce(nullif(o.menu_name,''),b.menu_name),coalesce(nullif(o.category,''),b.category),
        coalesce(nullif(o.thumbnail_url,''),b.thumbnail_url),coalesce(o.instructions,b.instructions),case when o.store_id is null then b.components else o.components end,
        'ACTIVE'::text,null::timestamptz
 from base b left join public.store_recipe_overrides o on o.store_id=p_store_id and o.menu_key=b.menu_key
 order by coalesce(nullif(o.category,''),b.category),coalesce(nullif(o.menu_name,''),b.menu_name);
end $$;
