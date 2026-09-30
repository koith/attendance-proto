-- v0.85 inventory unit conversion + audit hardening
alter table public.inventory_items add column if not exists stock_unit text, add column if not exists order_unit text, add column if not exists conversion_quantity numeric;
alter table public.inventory_manual_items add column if not exists stock_unit text, add column if not exists order_unit text, add column if not exists conversion_quantity numeric;
alter table public.inventory_purchase_orders add column if not exists stock_unit text, add column if not exists order_unit text, add column if not exists conversion_quantity numeric;
alter table public.inventory_items drop constraint if exists inventory_items_conversion_quantity_check;
alter table public.inventory_items add constraint inventory_items_conversion_quantity_check check(conversion_quantity is null or conversion_quantity>0);
alter table public.inventory_manual_items drop constraint if exists inventory_manual_items_conversion_quantity_check;
alter table public.inventory_manual_items add constraint inventory_manual_items_conversion_quantity_check check(conversion_quantity is null or conversion_quantity>0);
alter table public.inventory_purchase_orders drop constraint if exists inventory_purchase_orders_conversion_quantity_check;
alter table public.inventory_purchase_orders add constraint inventory_purchase_orders_conversion_quantity_check check(conversion_quantity is null or conversion_quantity>0);

-- Only seed conversions that are provably 1:1. Composite/source-basis units stay unresolved.
update public.inventory_items set stock_unit=unit,order_unit=unit,conversion_quantity=1
where stock_unit is null and order_unit is null and conversion_quantity is null and nullif(trim(unit),'') is not null and unit not like '%/%' and unit<>'원본 기준';
update public.inventory_manual_items set stock_unit=unit,order_unit=unit,conversion_quantity=1
where stock_unit is null and order_unit is null and conversion_quantity is null and nullif(trim(unit),'') is not null and unit not like '%/%' and unit<>'원본 기준';

create or replace function public.admin_inventory_purchase_order_create(p_store_id bigint,p_item_id bigint,p_manual_item_id bigint,p_quantity numeric,p_note text default null)
returns public.inventory_purchase_orders language plpgsql security definer set search_path='public','pg_temp' as $$
declare r public.inventory_purchase_orders; v_name text; v_unit text; v_stock text; v_order text; v_conv numeric;
begin
 if not public.can_manage_store(p_store_id) then raise exception 'NOT_AUTHORIZED'; end if;
 if coalesce(p_quantity,0)<=0 then raise exception 'INVALID_QUANTITY'; end if;
 if (p_item_id is null)=(p_manual_item_id is null) then raise exception 'EXACTLY_ONE_ITEM_REQUIRED'; end if;
 if p_manual_item_id is not null then
   select name,unit,stock_unit,order_unit,conversion_quantity into v_name,v_unit,v_stock,v_order,v_conv from public.inventory_manual_items where id=p_manual_item_id and store_id=p_store_id and is_active;
 else
   select name,unit,stock_unit,order_unit,conversion_quantity into v_name,v_unit,v_stock,v_order,v_conv from public.inventory_items where id=p_item_id and is_active;
 end if;
 if v_name is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
 v_stock:=coalesce(nullif(v_stock,''),v_unit); v_order:=coalesce(nullif(v_order,''),v_unit); v_conv:=coalesce(v_conv,1);
 insert into public.inventory_purchase_orders(store_id,item_id,manual_item_id,item_name,unit,stock_unit,order_unit,conversion_quantity,ordered_quantity,note)
 values(p_store_id,p_item_id,p_manual_item_id,v_name,v_order,v_stock,v_order,v_conv,p_quantity,nullif(trim(p_note),'')) returning * into r;
 return r;
end $$;

create or replace function public.admin_inventory_purchase_receive(p_order_id bigint,p_quantity numeric)
returns public.inventory_purchase_orders language plpgsql security definer set search_path='public','pg_temp' as $$
declare r public.inventory_purchase_orders; v_remaining numeric; v_stock_qty numeric; v_updated bigint;
begin
 select * into r from public.inventory_purchase_orders where id=p_order_id for update;
 if r.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.can_manage_store(r.store_id) then raise exception 'NOT_AUTHORIZED'; end if;
 if r.status not in ('ORDERED','PARTIAL') then raise exception 'ORDER_NOT_RECEIVABLE'; end if;
 v_remaining:=r.ordered_quantity-r.received_quantity;
 if coalesce(p_quantity,0)<=0 or p_quantity>v_remaining then raise exception 'INVALID_RECEIVE_QUANTITY'; end if;
 v_stock_qty:=p_quantity*coalesce(r.conversion_quantity,1);
 if r.manual_item_id is not null then
   update public.inventory_manual_items set on_hand=on_hand+v_stock_qty,updated_at=now() where id=r.manual_item_id and store_id=r.store_id returning id into v_updated;
   if v_updated is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
 else
   if not exists(select 1 from public.inventory_items where id=r.item_id) then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
   insert into public.inventory_movements(item_id,business_date,movement_type,quantity,source_type,source_key,note)
   values(r.item_id,(now() at time zone 'Asia/Seoul')::date,'RECEIPT',v_stock_qty,'PURCHASE_ORDER',r.id::text,
   '발주 입고 '||p_quantity||' '||coalesce(r.order_unit,r.unit)||case when coalesce(r.conversion_quantity,1)<>1 then ' → '||v_stock_qty||' '||coalesce(r.stock_unit,r.unit) else '' end);
 end if;
 update public.inventory_purchase_orders set received_quantity=received_quantity+p_quantity,
 status=case when received_quantity+p_quantity>=ordered_quantity then 'RECEIVED' else 'PARTIAL' end,
 received_at=case when received_quantity+p_quantity>=ordered_quantity then now() else received_at end,updated_at=now()
 where id=r.id returning * into r; return r;
end $$;

create or replace function public.admin_close_payroll(p_ym text,p_rows json,p_fingerprint text)
returns json language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_actor text; r json; n int:=0; v_month date;
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 if p_ym !~ '^\\d{4}-\\d{2}$' then raise exception 'BAD_YM'; end if;
 v_month:=(p_ym||'-01')::date;
 if v_month>=date_trunc('month',now() at time zone 'Asia/Seoul')::date then raise exception 'CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE'; end if;
 if exists(select 1 from public.payroll_period where ym=p_ym and status='CLOSED') then raise exception 'PAYROLL_ALREADY_CLOSED'; end if;
 v_actor:=coalesce(auth.jwt()->>'email','admin'); delete from public.payroll_snapshot where ym=p_ym;
 for r in select * from json_array_elements(p_rows) loop
   insert into public.payroll_snapshot(ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_by)
   values(p_ym,(r->>'employee_id')::bigint,r->>'employee_name',nullif(r->>'hours','')::numeric,nullif(r->>'wage','')::int,nullif(r->>'weeks','')::int,
   nullif(r->>'base_pay','')::int,nullif(r->>'juhyu_pay','')::int,coalesce(nullif(r->>'adjust','')::int,0),nullif(r->>'gross_pay','')::int,
   nullif(r->>'tax_rate','')::numeric,nullif(r->>'net_pay','')::int,r->>'memo',p_fingerprint,v_actor); n:=n+1;
 end loop;
 insert into public.payroll_period(ym,status,updated_by,updated_at) values(p_ym,'CLOSED',v_actor,now())
 on conflict(ym) do update set status='CLOSED',updated_by=v_actor,updated_at=now();
 return json_build_object('ok',true,'count',n);
end $$;

revoke execute on function public.substitution_is_working(bigint) from public,anon;
revoke execute on function public.substitution_schedule_conflict(bigint,timestamp without time zone,timestamp without time zone) from public,anon;
grant execute on function public.substitution_is_working(bigint) to authenticated,service_role;
grant execute on function public.substitution_schedule_conflict(bigint,timestamp without time zone,timestamp without time zone) to authenticated,service_role;
