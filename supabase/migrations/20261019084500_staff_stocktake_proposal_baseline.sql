-- #1162 MTG-09: immutable ledger baseline captured at staff submission and
-- compared before manager approval; rejects older proposals without baselines.
-- No updates to existing stocktake proposals, stock quantities or recipes.
CREATE OR REPLACE FUNCTION public.staff_stocktake_submit(
 p_store_id bigint,p_employee_id bigint,p_pin text,p_lines jsonb,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,extensions,pg_temp AS $$
DECLARE r jsonb; i bigint; q numeric; n int; saved bigint;
BEGIN
 PERFORM public.staff_stocktake_verify(p_store_id,p_employee_id,p_pin);
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR
    jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'STOCKTAKE_LINES_INVALID'; END IF;
 IF length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION 'STOCKTAKE_NOTE_TOO_LONG'; END IF;
 -- Prevent unlimited submitted proposals from a stolen valid staff PIN.
 PERFORM pg_advisory_xact_lock(hashtext('staff_stocktake_'||p_employee_id::text));
 -- Serialize evidence capture with the existing manager stocktake POST lock.
 PERFORM pg_advisory_xact_lock(hashtext('stocktake_store_'||p_store_id::text));
 IF (SELECT COUNT(*) FROM public.store_staff_stocktake_proposals
   WHERE employee_id=p_employee_id AND counted_on=(now() AT TIME ZONE 'Asia/Seoul')::date)>=5
 THEN RAISE EXCEPTION 'STOCKTAKE_DAILY_LIMIT'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(r)<>'object' OR coalesce(r->>'item_id','') !~ '^[1-9][0-9]*$'
     OR jsonb_typeof(r->'counted_quantity') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'STOCKTAKE_ITEM_INVALID'; END IF;
  i:=(r->>'item_id')::bigint;q:=(r->>'counted_quantity')::numeric;
  IF q<0 OR q>1000000000 OR scale(q)>3 THEN RAISE EXCEPTION 'STOCKTAKE_QTY_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_items t WHERE t.id=i AND t.is_active AND NOT t.is_demo)
     OR EXISTS (SELECT 1 FROM public.inventory_movements m WHERE m.item_id=i
       AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL)) AND m.is_demo)
  THEN RAISE EXCEPTION 'REAL_STOCKTAKE_ITEM_REQUIRED'; END IF;
  IF (SELECT COUNT(*) FROM jsonb_array_elements(p_lines) x
        WHERE x.value->>'item_id'=i::text)<>1
  THEN RAISE EXCEPTION 'DUPLICATE_STOCKTAKE_ITEM'; END IF;
 END LOOP;
 -- Only validated item and quantity keys are retained; never store staff PIN.
 INSERT INTO public.store_staff_stocktake_proposals(store_id,employee_id,lines,note)
 VALUES(p_store_id,p_employee_id,
   (SELECT jsonb_agg(jsonb_build_object('item_id',(x.value->>'item_id')::bigint,
     'counted_quantity',(x.value->>'counted_quantity')::numeric,
     'expected_quantity',COALESCE((
       SELECT SUM(m.quantity) FROM public.inventory_movements m
       WHERE m.item_id=(x.value->>'item_id')::bigint AND NOT m.is_demo
         AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
      ),0)::numeric)) FROM jsonb_array_elements(p_lines)x),
   nullif(btrim(p_note),''))
 RETURNING id INTO saved;
 RETURN jsonb_build_object('id',saved,'status','SUBMITTED','stock_changed',false);
END $$;


CREATE OR REPLACE FUNCTION public.admin_store_staff_stocktake_decide(
 p_store_id bigint,p_proposal_id bigint,p_accept boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,pg_temp AS $$
DECLARE p public.store_staff_stocktake_proposals%ROWTYPE; draft jsonb; v_line jsonb; v_baseline numeric; v_current numeric; v_id bigint;
BEGIN
 IF NOT public.can_manage_store(p_store_id) OR auth.uid() IS NULL
 THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'DECISION_REQUIRED'; END IF;
 SELECT * INTO p FROM public.store_staff_stocktake_proposals
 WHERE id=p_proposal_id AND store_id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STOCKTAKE_PROPOSAL_NOT_FOUND'; END IF;
 IF p.status<>'SUBMITTED' THEN
  -- Never replay a POSTED stock count or switch earlier manager decisions.
  IF p.status='ACCEPTED' AND p_accept
  THEN RETURN jsonb_build_object('status','ACCEPTED',
      'draft_id',p.accepted_stocktake_id,'already_reviewed',true);
  END IF;
  RAISE EXCEPTION 'STOCKTAKE_ALREADY_REVIEWED';
 END IF;
 IF p.counted_on<>(now() AT TIME ZONE 'Asia/Seoul')::date
 THEN RAISE EXCEPTION 'STALE_STOCKTAKE_RECOUNT'; END IF;
 IF p_accept THEN
  -- Employees may have counted BEFORE a sale, inbound delivery or another
  -- count was posted. Reject stale evidence instead of correcting the stock
  -- using a physical count from a different ledger state.
  PERFORM pg_advisory_xact_lock(hashtext('stocktake_store_'||p_store_id::text));
  FOR v_line IN SELECT value FROM jsonb_array_elements(p.lines) LOOP
   IF jsonb_typeof(v_line->'expected_quantity') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'STAFF_STOCKTAKE_BASELINE_MISSING'; END IF;
   v_baseline:=(v_line->>'expected_quantity')::numeric;
   v_id:=(v_line->>'item_id')::bigint;
   SELECT COALESCE(SUM(m.quantity),0)::numeric INTO v_current
   FROM public.inventory_movements m
   WHERE m.item_id=v_id AND NOT m.is_demo
     AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL));
   IF v_current IS DISTINCT FROM v_baseline
   THEN RAISE EXCEPTION 'STOCK_CHANGED_RECOUNT'; END IF;
  END LOOP;
  draft:=public.admin_store_stocktake_draft(p_store_id,p.lines,
    '직원 실사 제안 #'||p.id||CASE WHEN p.note IS NOT NULL THEN ': '||left(p.note,400) ELSE '' END);
  UPDATE public.store_staff_stocktake_proposals SET
   status='ACCEPTED',accepted_stocktake_id=(draft->>'id')::bigint,
   reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p.id;
  RETURN jsonb_build_object('status','ACCEPTED','draft_id',draft->'id',
    'stock_changed',false);
 END IF;
 UPDATE public.store_staff_stocktake_proposals SET
  status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p.id;
 RETURN jsonb_build_object('status','REJECTED','stock_changed',false);
END $$;


-- Existing RPC signatures/grants preserved by CREATE OR REPLACE.
