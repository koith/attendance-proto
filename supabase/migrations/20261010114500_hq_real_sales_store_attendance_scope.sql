-- HQ dashboard: only attributable non-demo transactions; never multiply a shared demo store.
CREATE OR REPLACE FUNCTION public.hq_store_dashboard()
RETURNS TABLE(store_id bigint,store_name text,store_code text,source_store_key text,region_group text,
 sales_total numeric,sales_7d numeric,tx_count bigint,trend jsonb,menu_trend jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY
 WITH keys AS (
   SELECT s.source_store_key FROM public.stores s WHERE s.is_active AND s.source_store_key IS NOT NULL
   GROUP BY s.source_store_key HAVING count(*)=1
 ), base AS (
   SELECT s.id,s.name,s.code,s.source_store_key,s.region_group
   FROM public.stores s JOIN keys k ON k.source_store_key=s.source_store_key WHERE s.is_active
 ), totals AS (
   SELECT t.source_store_key,
      coalesce(sum(t.total_amount),0)::numeric total,
      coalesce(sum(t.total_amount) FILTER (WHERE t.business_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-6)),0)::numeric d7,
      count(*)::bigint n
   FROM public.operations_transactions t
   WHERE t.transaction_type='SALE' AND t.is_demo IS FALSE
   GROUP BY t.source_store_key
 ), daily AS (
   SELECT t.source_store_key,t.business_date,sum(t.total_amount)::numeric sales
   FROM public.operations_transactions t
   WHERE t.transaction_type='SALE' AND t.is_demo IS FALSE
     AND t.business_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-13)
   GROUP BY t.source_store_key,t.business_date
 ), menus AS (
   SELECT t.source_store_key,coalesce(nullif(t.counterparty,''),'기타') menu,
          sum(t.total_amount)::numeric sales,count(*)::bigint orders
   FROM public.operations_transactions t
   WHERE t.transaction_type='SALE' AND t.is_demo IS FALSE
     AND t.business_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-6)
   GROUP BY t.source_store_key,coalesce(nullif(t.counterparty,''),'기타')
 )
 SELECT s.id,s.name,s.code,s.source_store_key,s.region_group,
        coalesce(t.total,0),coalesce(t.d7,0),coalesce(t.n,0),
        coalesce((SELECT jsonb_agg(jsonb_build_object('date',d.business_date,'sales',d.sales) ORDER BY d.business_date)
                  FROM daily d WHERE d.source_store_key=s.source_store_key),'[]'::jsonb),
        coalesce((SELECT jsonb_agg(jsonb_build_object('name',m.menu,'sales',m.sales,'orders',m.orders,
                                      'channels','{}'::jsonb) ORDER BY m.sales DESC)
                  FROM menus m WHERE m.source_store_key=s.source_store_key),'[]'::jsonb)
 FROM public.stores s
 LEFT JOIN keys k ON k.source_store_key=s.source_store_key
 LEFT JOIN totals t ON t.source_store_key=s.source_store_key AND k.source_store_key IS NOT NULL
 WHERE s.is_active ORDER BY s.region_group,s.name;
END $fn$;
-- Scoped read RPC: no unrelated-store attendance or correction data.
CREATE OR REPLACE FUNCTION public.admin_store_events(
 p_store_id bigint,p_from timestamp without time zone,p_to timestamp without time zone)
RETURNS SETOF public.attendance_events
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>=p_to OR p_to-p_from>INTERVAL '400 days'
 THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
 RETURN QUERY SELECT ev.id,ev.employee_id,ev.event_type,
  (ev.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul',
  (ev.server_received_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul',
  ev.device_id,ev.created_at,ev.client_reported_at
 FROM public.attendance_events ev JOIN public.employees e ON e.id=ev.employee_id
 WHERE e.store_id=p_store_id
   AND ev.event_at>=((p_from AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')
   AND ev.event_at<((p_to AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')
 ORDER BY ev.employee_id,ev.event_at;
END $fn$;
CREATE OR REPLACE FUNCTION public.admin_store_events_with_corrections(
 p_store_id bigint,p_from timestamp without time zone,p_to timestamp without time zone)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>=p_to OR p_to-p_from>INTERVAL '400 days'
 THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
 RETURN jsonb_build_object(
   'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.employee_id,x.event_at,x.id)
     FROM (SELECT ev.id,ev.employee_id,ev.event_type,
       (ev.event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' event_at
       FROM public.attendance_events ev JOIN public.employees e ON e.id=ev.employee_id
       WHERE e.store_id=p_store_id
         AND ev.event_at>=((p_from AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')
         AND ev.event_at<((p_to AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC')) x),'[]'::jsonb),
   'corrections',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id)
     FROM (SELECT ec.id,ec.event_id,ec.employee_id,ec.action,
         CASE WHEN ec.new_event_at IS NULL THEN NULL ELSE
           (ec.new_event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' END new_event_at,
         ec.new_event_type,ec.reason,ec.created_by,ec.created_at
       FROM public.event_corrections ec JOIN public.employees e ON e.id=ec.employee_id
       WHERE e.store_id=p_store_id
         AND ec.created_at>=(p_from AT TIME ZONE 'Asia/Seoul')-INTERVAL '90 days'
         AND NOT(ec.action='ADD' AND ec.reason LIKE '%[VOID_ADD:%')
         AND ec.action<>'VOID_ADD') c),'[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.admin_store_events(bigint,timestamp without time zone,timestamp without time zone) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_events_with_corrections(bigint,timestamp without time zone,timestamp without time zone) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_events(bigint,timestamp without time zone,timestamp without time zone) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_store_events_with_corrections(bigint,timestamp without time zone,timestamp without time zone) TO authenticated,service_role;
