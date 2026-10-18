-- #1152 MTG-09: PIN-authenticated staff count proposals, manager-only approval.
-- Additive and fail-closed. Merely submitting/accepting NEVER changes inventory.
-- Manager must separately POST the preexisting stocktake draft after inspecting it.
CREATE TABLE IF NOT EXISTS public.store_staff_stocktake_proposals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 store_id bigint NOT NULL REFERENCES public.stores(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 counted_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
 lines jsonb NOT NULL,
 note text,
 status text NOT NULL DEFAULT 'SUBMITTED'
   CHECK (status IN ('SUBMITTED','ACCEPTED','REJECTED')),
 accepted_stocktake_id bigint REFERENCES public.store_inventory_stocktakes(id),
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT proposal_lines_array CHECK (jsonb_typeof(lines)='array')
);
CREATE INDEX IF NOT EXISTS staff_stocktake_store_status_idx
 ON public.store_staff_stocktake_proposals(store_id,status,id DESC);
CREATE INDEX IF NOT EXISTS staff_stocktake_employee_day_idx
 ON public.store_staff_stocktake_proposals(employee_id,counted_on);
ALTER TABLE public.store_staff_stocktake_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_staff_stocktake_proposals FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_stocktake_verify(
 p_store_id bigint,p_employee_id bigint,p_pin text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,extensions,pg_temp AS $$
BEGIN
 IF p_store_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.is_active AND s.onboarding_status='READY'
 ) THEN RAISE EXCEPTION 'STORE_NOT_READY'; END IF;
 IF p_employee_id IS NULL OR p_pin IS NULL OR length(p_pin) NOT BETWEEN 4 AND 20 OR
    NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id
     AND e.store_id=p_store_id AND e.is_active AND
     e.pin_bcrypt IS NOT NULL AND e.pin_bcrypt=crypt(p_pin,e.pin_bcrypt))
 THEN RAISE EXCEPTION 'STAFF_PIN_REQUIRED'; END IF;
 IF NOT public.substitution_is_working(p_employee_id)
 THEN RAISE EXCEPTION 'STAFF_NOT_CLOCKED_IN'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.staff_stocktake_verify(bigint,bigint,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.staff_stocktake_catalog(
 p_store_id bigint,p_employee_id bigint,p_pin text
) RETURNS TABLE(id bigint,name text,unit text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,extensions,pg_temp AS $$
BEGIN
 PERFORM public.staff_stocktake_verify(p_store_id,p_employee_id,p_pin);
 RETURN QUERY SELECT i.id,i.name,i.unit FROM public.inventory_items i
 WHERE i.is_active AND NOT i.is_demo
   AND NOT EXISTS (SELECT 1 FROM public.inventory_movements m
    WHERE m.item_id=i.id AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
      AND m.is_demo)
 ORDER BY i.name,i.id LIMIT 500;
END $$;

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
     'counted_quantity',(x.value->>'counted_quantity')::numeric)) FROM jsonb_array_elements(p_lines)x),
   nullif(btrim(p_note),''))
 RETURNING id INTO saved;
 RETURN jsonb_build_object('id',saved,'status','SUBMITTED','stock_changed',false);
END $$;

CREATE OR REPLACE FUNCTION public.admin_store_staff_stocktake_list(p_store_id bigint)
RETURNS TABLE(id bigint,employee_name text,counted_on date,status text,note text,
 lines jsonb,accepted_stocktake_id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $$
BEGIN
 IF NOT public.can_manage_store(p_store_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 RETURN QUERY SELECT p.id,e.name,p.counted_on,p.status,p.note,
   (SELECT jsonb_agg(jsonb_build_object('item_id',(l.value->>'item_id')::bigint,
       'item_name',i.name,'unit',i.unit,
       'counted_quantity',(l.value->>'counted_quantity')::numeric)
      ORDER BY i.name)
    FROM jsonb_array_elements(p.lines) l
    JOIN public.inventory_items i ON i.id=(l.value->>'item_id')::bigint),
   p.accepted_stocktake_id
 FROM public.store_staff_stocktake_proposals p
 JOIN public.employees e ON e.id=p.employee_id
 WHERE p.store_id=p_store_id
 ORDER BY p.id DESC LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.admin_store_staff_stocktake_decide(
 p_store_id bigint,p_proposal_id bigint,p_accept boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public,pg_temp AS $$
DECLARE p public.store_staff_stocktake_proposals%ROWTYPE; draft jsonb;
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

REVOKE ALL ON FUNCTION public.staff_stocktake_catalog(bigint,bigint,text) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.staff_stocktake_submit(bigint,bigint,text,jsonb,text) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_stocktake_catalog(bigint,bigint,text) TO anon;
GRANT EXECUTE ON FUNCTION public.staff_stocktake_submit(bigint,bigint,text,jsonb,text) TO anon;
REVOKE ALL ON FUNCTION public.admin_store_staff_stocktake_list(bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_store_staff_stocktake_decide(bigint,bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_store_staff_stocktake_list(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_store_staff_stocktake_decide(bigint,bigint,boolean) TO authenticated;
