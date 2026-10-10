-- Nationwide inventory: preserve Inha legacy balances, isolate subsequent store stock.
-- Historical movements have no verified store mapping and remain NULL; only store 1
-- may include these legacy unassigned rows for backward-compatible reporting.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS store_id bigint REFERENCES public.stores(id);
CREATE INDEX IF NOT EXISTS inventory_movements_store_item_day_idx
  ON public.inventory_movements(store_id,item_id,business_date DESC);

CREATE TABLE IF NOT EXISTS public.store_inventory_unit_configs(
  store_id bigint NOT NULL REFERENCES public.stores(id),
  item_id bigint NOT NULL REFERENCES public.inventory_items(id),
  stock_unit text NOT NULL,
  order_unit text NOT NULL,
  conversion_quantity numeric NOT NULL CHECK(conversion_quantity>0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,item_id)
);
ALTER TABLE public.store_inventory_unit_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_inventory_unit_configs FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_store_inventory_overview_v3(p_store_id bigint)
RETURNS TABLE(id bigint,sku text,name text,unit text,is_active boolean,
 on_hand numeric,reorder_level numeric,inventory_value numeric,low_stock boolean,
 category text,source_unit_system text,source_minimum_text text,source_current_text text,
 source_order_text text,source_note text,stock_unit text,order_unit text,
 conversion_quantity numeric,unit_configured boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 SELECT i.id,i.sku,i.name,i.unit,i.is_active,
   COALESCE(SUM(m.quantity),0)::numeric AS on_hand,
   i.reorder_level,
   COALESCE(SUM(m.quantity*COALESCE(m.unit_cost,0)),0)::numeric AS inventory_value,
   (i.reorder_level IS NOT NULL AND COALESCE(SUM(m.quantity),0)<=i.reorder_level) AS low_stock,
   i.category,i.source_unit_system,i.source_minimum_text,i.source_current_text,
   i.source_order_text,i.source_note,
   COALESCE(c.stock_unit,i.stock_unit),COALESCE(c.order_unit,i.order_unit),
   COALESCE(c.conversion_quantity,i.conversion_quantity),
   (COALESCE(c.stock_unit,i.stock_unit) IS NOT NULL
    AND COALESCE(c.order_unit,i.order_unit) IS NOT NULL
    AND COALESCE(c.conversion_quantity,i.conversion_quantity) IS NOT NULL)
 FROM public.inventory_items i
 LEFT JOIN public.inventory_movements m ON m.item_id=i.id
   AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
 LEFT JOIN public.store_inventory_unit_configs c
   ON c.store_id=p_store_id AND c.item_id=i.id
 GROUP BY i.id,c.stock_unit,c.order_unit,c.conversion_quantity
 ORDER BY i.is_active DESC,i.name;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_inventory_items(p_store_id bigint)
RETURNS TABLE(id bigint,sku text,name text,unit text,is_active boolean,on_hand numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT v.id,v.sku,v.name,v.unit,v.is_active,v.on_hand
 FROM public.admin_store_inventory_overview_v3(p_store_id) v;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_inventory_movements(
 p_store_id bigint,p_item_id bigint DEFAULT NULL::bigint,
 p_from date DEFAULT NULL::date,p_to date DEFAULT NULL::date)
RETURNS TABLE(id bigint,item_id bigint,item_name text,business_date date,
 movement_type text,quantity numeric,unit_cost bigint,source_type text,
 source_key text,note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT m.id,m.item_id,i.name,m.business_date,m.movement_type,
  m.quantity,m.unit_cost,m.source_type,m.source_key,m.note
 FROM public.inventory_movements m JOIN public.inventory_items i ON i.id=m.item_id
 WHERE (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
   AND (p_item_id IS NULL OR m.item_id=p_item_id)
   AND (p_from IS NULL OR m.business_date>=p_from)
   AND (p_to IS NULL OR m.business_date<=p_to)
 ORDER BY m.business_date DESC,m.id DESC LIMIT 1000;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_store_inventory_unit_config_save(
 p_store_id bigint,p_item_id bigint,p_stock_unit text,p_order_unit text,
 p_conversion_quantity numeric,p_is_manual boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_id bigint;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_item_id IS NULL THEN RAISE EXCEPTION 'ITEM_REQUIRED'; END IF;
 IF NULLIF(btrim(p_stock_unit),'') IS NULL OR NULLIF(btrim(p_order_unit),'') IS NULL
 THEN RAISE EXCEPTION 'UNIT_REQUIRED'; END IF;
 IF p_conversion_quantity IS NULL OR p_conversion_quantity<=0
 THEN RAISE EXCEPTION 'INVALID_CONVERSION_QUANTITY'; END IF;
 IF COALESCE(p_is_manual,false) THEN
   UPDATE public.inventory_manual_items SET stock_unit=btrim(p_stock_unit),
     order_unit=btrim(p_order_unit),conversion_quantity=p_conversion_quantity,
     updated_at=now()
   WHERE id=p_item_id AND store_id=p_store_id RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND'; END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM public.inventory_items WHERE id=p_item_id AND is_active)
   THEN RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND'; END IF;
   INSERT INTO public.store_inventory_unit_configs
     (store_id,item_id,stock_unit,order_unit,conversion_quantity,updated_by)
   VALUES(p_store_id,p_item_id,btrim(p_stock_unit),btrim(p_order_unit),
          p_conversion_quantity,auth.uid())
   ON CONFLICT(store_id,item_id) DO UPDATE
     SET stock_unit=excluded.stock_unit,order_unit=excluded.order_unit,
         conversion_quantity=excluded.conversion_quantity,
         updated_by=excluded.updated_by,updated_at=now();
   v_id:=p_item_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'id',v_id,'store_id',p_store_id,
   'stock_unit',btrim(p_stock_unit),'order_unit',btrim(p_order_unit),
   'conversion_quantity',p_conversion_quantity);
END $function$;

-- Purchase orders snapshot the selected store's own unit conversion, not a shared default.
CREATE OR REPLACE FUNCTION public.admin_inventory_purchase_order_create(
 p_store_id bigint,p_item_id bigint,p_manual_item_id bigint,p_quantity numeric,
 p_note text DEFAULT NULL::text)
RETURNS public.inventory_purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE r public.inventory_purchase_orders;
 v_name text;v_unit text;v_stock text;v_order text;v_conv numeric;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF COALESCE(p_quantity,0)<=0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
 IF (p_item_id IS NULL)=(p_manual_item_id IS NULL)
 THEN RAISE EXCEPTION 'EXACTLY_ONE_ITEM_REQUIRED'; END IF;
 IF p_manual_item_id IS NOT NULL THEN
   SELECT m.name,m.unit,m.stock_unit,m.order_unit,m.conversion_quantity
     INTO v_name,v_unit,v_stock,v_order,v_conv
   FROM public.inventory_manual_items m
   WHERE m.id=p_manual_item_id AND m.store_id=p_store_id AND m.is_active;
 ELSE
   SELECT i.name,i.unit,COALESCE(c.stock_unit,i.stock_unit),
      COALESCE(c.order_unit,i.order_unit),COALESCE(c.conversion_quantity,i.conversion_quantity)
     INTO v_name,v_unit,v_stock,v_order,v_conv
   FROM public.inventory_items i
   LEFT JOIN public.store_inventory_unit_configs c
     ON c.store_id=p_store_id AND c.item_id=i.id
   WHERE i.id=p_item_id AND i.is_active;
 END IF;
 IF v_name IS NULL THEN RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND'; END IF;
 v_stock:=COALESCE(NULLIF(v_stock,''),v_unit);
 v_order:=COALESCE(NULLIF(v_order,''),v_unit);
 v_conv:=COALESCE(v_conv,1);
 INSERT INTO public.inventory_purchase_orders
 (store_id,item_id,manual_item_id,item_name,unit,stock_unit,order_unit,
  conversion_quantity,ordered_quantity,note)
 VALUES(p_store_id,p_item_id,p_manual_item_id,v_name,v_order,v_stock,v_order,
        v_conv,p_quantity,NULLIF(trim(p_note),''))
 RETURNING * INTO r;
 RETURN r;
END $function$;

-- Crucial: receiving a common catalog item must never credit another store's ledger.
CREATE OR REPLACE FUNCTION public.admin_inventory_purchase_receive(
 p_order_id bigint,p_quantity numeric)
RETURNS public.inventory_purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE r public.inventory_purchase_orders;v_remaining numeric;
 v_stock_qty numeric;v_updated bigint;
BEGIN
 SELECT * INTO r FROM public.inventory_purchase_orders WHERE id=p_order_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF NOT public.can_manage_store(r.store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF r.status NOT IN ('ORDERED','PARTIAL') THEN RAISE EXCEPTION 'ORDER_NOT_RECEIVABLE'; END IF;
 v_remaining:=r.ordered_quantity-r.received_quantity;
 IF COALESCE(p_quantity,0)<=0 OR p_quantity>v_remaining
 THEN RAISE EXCEPTION 'INVALID_RECEIVE_QUANTITY'; END IF;
 v_stock_qty:=p_quantity*COALESCE(r.conversion_quantity,1);
 IF r.manual_item_id IS NOT NULL THEN
   UPDATE public.inventory_manual_items SET on_hand=on_hand+v_stock_qty,updated_at=now()
   WHERE id=r.manual_item_id AND store_id=r.store_id RETURNING id INTO v_updated;
   IF v_updated IS NULL THEN RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND'; END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM public.inventory_items WHERE id=r.item_id)
   THEN RAISE EXCEPTION 'INVENTORY_ITEM_NOT_FOUND'; END IF;
   INSERT INTO public.inventory_movements
    (store_id,item_id,business_date,movement_type,quantity,source_type,source_key,note)
   VALUES(r.store_id,r.item_id,(now() at time zone 'Asia/Seoul')::date,
    'RECEIPT',v_stock_qty,'PURCHASE_ORDER',r.id::text,
    '발주 입고 '||p_quantity||' '||COALESCE(r.order_unit,r.unit)||
      CASE WHEN COALESCE(r.conversion_quantity,1)<>1
      THEN ' → '||v_stock_qty||' '||COALESCE(r.stock_unit,r.unit) ELSE '' END);
 END IF;
 UPDATE public.inventory_purchase_orders
 SET received_quantity=received_quantity+p_quantity,
     status=CASE WHEN received_quantity+p_quantity>=ordered_quantity
        THEN 'RECEIVED' ELSE 'PARTIAL' END,
     received_at=CASE WHEN received_quantity+p_quantity>=ordered_quantity
        THEN now() ELSE received_at END,updated_at=now()
 WHERE id=r.id RETURNING * INTO r;
 RETURN r;
END $function$;

REVOKE ALL ON FUNCTION public.admin_store_inventory_overview_v3(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_inventory_items(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_inventory_movements(bigint,bigint,date,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_inventory_unit_config_save(bigint,bigint,text,text,numeric,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_inventory_overview_v3(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_inventory_items(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_inventory_movements(bigint,bigint,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_inventory_unit_config_save(bigint,bigint,text,text,numeric,boolean) TO authenticated;
