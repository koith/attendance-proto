-- Read-only metric correction: preserve demo transactions and all live source records;
-- exclude only is_demo=true/NULL from ALL HQ/store business performance aggregates.
-- Derived from currently deployed, separately authorized SECURITY DEFINER RPC bodies.
-- Existing store/HQ authorization, GRANTs, reconciliation and inventory behavior remain intact.
-- Do not alter historical operational rows or recipe, payroll, attendance, accounts, Sheets.

-- admin_operations_analytics: real financial metrics only; authorized original signature unchanged.
CREATE OR REPLACE FUNCTION public.admin_operations_analytics(p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v json;
begin
 if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 select json_build_object(
 'by_channel',coalesce((select json_agg(x) from(select coalesce(channel,'기타') channel,sum(total_amount) amount,count(*) transactions from public.operations_transactions where business_date between p_from and p_to AND is_demo IS FALSE and transaction_type='SALE' and status='CONFIRMED' group by 1 order by 2 desc)x),'[]'::json),
 'daily',coalesce((select json_agg(x) from(select business_date,sum(case when transaction_type='SALE' then total_amount when transaction_type='REFUND' then -total_amount else 0 end) sales,sum(case when transaction_type='PURCHASE' then total_amount else 0 end) purchases from public.operations_transactions where business_date between p_from and p_to AND is_demo IS FALSE and status='CONFIRMED' group by business_date order by business_date)x),'[]'::json),
 'open_reconciliation',(select count(*) from public.operations_reconciliation_issues where business_date between p_from and p_to and status='OPEN'),
 'low_stock',(select count(*) from (select i.id from public.inventory_items i left join public.inventory_movements m on m.item_id=i.id where i.is_active and i.reorder_level is not null group by i.id having coalesce(sum(m.quantity),0)<=i.reorder_level)s)
 ) into v; return v;
end $function$;

-- admin_operations_summary: real financial metrics only; authorized original signature unchanged.
CREATE OR REPLACE FUNCTION public.admin_operations_summary(p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_sales bigint; v_purchases bigint; v_refunds bigint; v_tx bigint; v_items bigint; v_imports bigint;
begin
 if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_RANGE'; end if;
 select coalesce(sum(case when transaction_type='SALE' and status='CONFIRMED' then total_amount else 0 end),0),
        coalesce(sum(case when transaction_type='PURCHASE' and status='CONFIRMED' then total_amount else 0 end),0),
        coalesce(sum(case when transaction_type='REFUND' and status='CONFIRMED' then total_amount else 0 end),0),
        count(*) into v_sales,v_purchases,v_refunds,v_tx
 from public.operations_transactions where business_date between p_from and p_to AND is_demo IS FALSE;
 select count(*) into v_items from public.inventory_items where is_active;
 select count(*) into v_imports from public.operations_import_batches where created_at::date between p_from and p_to;
 return json_build_object('sales',v_sales,'purchases',v_purchases,'refunds',v_refunds,'transaction_count',v_tx,'active_items',v_items,'import_count',v_imports);
end $function$;

-- admin_operations_trend: real financial metrics only; authorized original signature unchanged.
CREATE OR REPLACE FUNCTION public.admin_operations_trend(p_window text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_start timestamptz; v_bucket text; v json;
begin
 if not public.is_hq_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 case p_window
 when '1h' then v_start=now()-interval '1 hour'; v_bucket='minute';
 when '24h' then v_start=now()-interval '24 hours'; v_bucket='hour';
 when '7d' then v_start=now()-interval '7 days'; v_bucket='day';
 when '1m' then v_start=now()-interval '1 month'; v_bucket='day';
 when '6m' then v_start=now()-interval '6 months'; v_bucket='week';
 when '1y' then v_start=now()-interval '1 year'; v_bucket='month';
 else raise exception 'INVALID_WINDOW';
 end case;
 with base as(
  select date_trunc(v_bucket,transacted_at) bucket,transaction_type,coalesce(counterparty,'미분류') menu,total_amount
  from public.operations_transactions where transacted_at>=v_start AND is_demo IS FALSE and status='CONFIRMED'
 ), totals as(
  select bucket,sum(case when transaction_type='SALE' then total_amount when transaction_type='REFUND' then -total_amount else 0 end) sales,
  sum(case when transaction_type='PURCHASE' then total_amount else 0 end) purchases from base group by bucket
 ), menus as(
  select bucket,menu,sum(case when transaction_type='SALE' then total_amount when transaction_type='REFUND' then -total_amount else 0 end) amount
  from base where transaction_type in('SALE','REFUND') group by bucket,menu
 ), topmenus as(select menu,sum(amount) amount from menus group by menu order by amount desc limit 8)
 select json_build_object(
  'window',p_window,'bucket',v_bucket,
  'totals',coalesce((select json_agg(t order by bucket) from totals t),'[]'::json),
  'menus',coalesce((select json_agg(m order by bucket,menu) from menus m join topmenus tm using(menu)),'[]'::json),
  'menu_names',coalesce((select json_agg(menu order by amount desc) from topmenus),'[]'::json)
 ) into v; return v;
end $function$;

-- admin_store_operations_analytics: real financial metrics only; authorized original signature unchanged.
CREATE OR REPLACE FUNCTION public.admin_store_operations_analytics(p_store_id bigint, p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v json;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 SELECT json_build_object(
  'by_channel',coalesce((SELECT json_agg(x) FROM
    (SELECT coalesce(t.channel,'기타') channel,sum(t.total_amount) amount,count(*) transactions
     FROM public.operations_transactions t
     WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to AND t.is_demo IS FALSE
      AND t.transaction_type='SALE' AND t.status='CONFIRMED'
     GROUP BY 1 ORDER BY 2 DESC) x),'[]'::json),
  'daily',coalesce((SELECT json_agg(x) FROM
    (SELECT t.business_date,
      sum(CASE WHEN t.transaction_type='SALE' THEN t.total_amount
               WHEN t.transaction_type='REFUND' THEN -t.total_amount ELSE 0 END) sales,
      sum(CASE WHEN t.transaction_type='PURCHASE' THEN t.total_amount ELSE 0 END) purchases
     FROM public.operations_transactions t
     WHERE t.store_id=p_store_id AND t.business_date BETWEEN p_from AND p_to AND t.is_demo IS FALSE
       AND t.status='CONFIRMED'
     GROUP BY t.business_date ORDER BY t.business_date) x),'[]'::json),
  'open_reconciliation',public.admin_store_reconciliation_count(p_store_id,p_from,p_to),
  'low_stock',(SELECT count(*) FROM public.admin_store_inventory_overview_v3(p_store_id)
               WHERE is_active AND low_stock)
 ) INTO v;
 RETURN v;
END $function$;

-- admin_store_operations_summary: real financial metrics only; authorized original signature unchanged.
CREATE OR REPLACE FUNCTION public.admin_store_operations_summary(p_store_id bigint, p_from date, p_to date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sales bigint;v_purchases bigint;v_refunds bigint;v_tx bigint;v_items bigint;v_imports bigint;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 SELECT coalesce(sum(CASE WHEN transaction_type='SALE' AND status='CONFIRMED' THEN total_amount ELSE 0 END),0),
        coalesce(sum(CASE WHEN transaction_type='PURCHASE' AND status='CONFIRMED' THEN total_amount ELSE 0 END),0),
        coalesce(sum(CASE WHEN transaction_type='REFUND' AND status='CONFIRMED' THEN total_amount ELSE 0 END),0),
        count(*) INTO v_sales,v_purchases,v_refunds,v_tx
 FROM public.operations_transactions
 WHERE store_id=p_store_id AND business_date BETWEEN p_from AND p_to AND is_demo IS FALSE;
 SELECT count(*) INTO v_items FROM public.admin_store_inventory_overview_v3(p_store_id) WHERE is_active;
 SELECT count(*) INTO v_imports FROM public.operations_import_batches
 WHERE store_id=p_store_id AND created_at::date BETWEEN p_from AND p_to;
 RETURN json_build_object('sales',v_sales,'purchases',v_purchases,
   'refunds',v_refunds,'transaction_count',v_tx,'active_items',v_items,'import_count',v_imports);
END $function$;

-- admin_store_operations_trend: real financial metrics only; authorized original signature unchanged.
CREATE OR REPLACE FUNCTION public.admin_store_operations_trend(p_store_id bigint, p_window text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_start timestamptz;v_bucket text;v json;
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 CASE p_window
 WHEN '1h' THEN v_start=now()-interval '1 hour';v_bucket='minute';
 WHEN '24h' THEN v_start=now()-interval '24 hours';v_bucket='hour';
 WHEN '7d' THEN v_start=now()-interval '7 days';v_bucket='day';
 WHEN '1m' THEN v_start=now()-interval '1 month';v_bucket='day';
 WHEN '6m' THEN v_start=now()-interval '6 months';v_bucket='week';
 WHEN '1y' THEN v_start=now()-interval '1 year';v_bucket='month';
 ELSE RAISE EXCEPTION 'INVALID_WINDOW'; END CASE;
 WITH base AS (
   SELECT date_trunc(v_bucket,t.transacted_at) bucket,
     t.transaction_type,coalesce(t.counterparty,'미분류') menu,t.total_amount
   FROM public.operations_transactions t
   WHERE t.store_id=p_store_id AND t.transacted_at>=v_start AND t.is_demo IS FALSE AND t.status='CONFIRMED'
 ), totals AS (
   SELECT bucket,sum(CASE WHEN transaction_type='SALE' THEN total_amount
                          WHEN transaction_type='REFUND' THEN -total_amount ELSE 0 END) sales,
      sum(CASE WHEN transaction_type='PURCHASE' THEN total_amount ELSE 0 END) purchases
   FROM base GROUP BY bucket
 ), menus AS (
   SELECT bucket,menu,sum(CASE WHEN transaction_type='SALE' THEN total_amount
                               WHEN transaction_type='REFUND' THEN -total_amount ELSE 0 END) amount
   FROM base WHERE transaction_type IN('SALE','REFUND') GROUP BY bucket,menu
 ), topmenus AS (SELECT menu,sum(amount) amount FROM menus GROUP BY menu ORDER BY amount DESC LIMIT 8)
 SELECT json_build_object('window',p_window,'bucket',v_bucket,
   'totals',coalesce((SELECT json_agg(t ORDER BY bucket) FROM totals t),'[]'::json),
   'menus',coalesce((SELECT json_agg(m ORDER BY bucket,menu) FROM menus m
                    JOIN topmenus tm USING(menu)),'[]'::json),
   'menu_names',coalesce((SELECT json_agg(menu ORDER BY amount DESC) FROM topmenus),'[]'::json)
 ) INTO v;
 RETURN v;
END $function$;

