-- Audited function definitions only; no production row data.
CREATE OR REPLACE FUNCTION public.my_events(p_employee_id bigint, p_pin text, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin,v_hash) IS DISTINCT FROM v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_employee_id and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  return json_build_object('ok',true,'events',
    coalesce((select json_agg(row_to_json(t)) from (
      select ev.id, ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.employee_id=p_employee_id
        and ev.event_at >= ((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at < ((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.event_at
    ) t),'[]'::json),
    'requests', coalesce((select json_agg(row_to_json(r)) from (
      select id, kind, requested_at, requested_type, note, status, created_at
      from correction_requests
      where employee_id=p_employee_id and created_at > now() - interval '60 days' order by created_at desc
    ) r),'[]'::json));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.pos_unlock_store(p_store_id bigint, p_employee_no integer, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_hash text; v_employee_id bigint; v_token text; v_attempts bigint; v_store_attempts bigint;
BEGIN
 IF p_store_id IS NULL OR p_employee_no IS NULL OR p_employee_no < 1 OR p_employee_no > 99999
    OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
   RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pos_unlock:'||p_store_id::text,0));
 SELECT count(*),count(*) FILTER(WHERE employee_no=p_employee_no) INTO v_store_attempts,v_attempts
 FROM pos_private.unlock_attempts
 WHERE store_id=p_store_id AND attempted_at>clock_timestamp()-interval '15 minutes' AND success IS FALSE;
 IF v_attempts>=5 OR v_store_attempts>=100 THEN
   RETURN jsonb_build_object('ok',false,'error','RATE_LIMITED');
 END IF;
 SELECT e.id,e.pin_bcrypt INTO v_employee_id,v_hash
 FROM public.employees e INNER JOIN public.stores s ON s.id=e.store_id
 WHERE e.store_id=p_store_id AND e.employee_no=p_employee_no AND e.is_active
   AND s.is_active AND s.onboarding_status='READY'
 ORDER BY e.id LIMIT 1;
 IF v_hash IS NULL OR extensions.crypt(p_pin,v_hash) IS DISTINCT FROM v_hash THEN
   INSERT INTO pos_private.unlock_attempts(store_id,employee_no,success) VALUES(p_store_id,p_employee_no,false);
   RETURN jsonb_build_object('ok',false,'error','INVALID_CREDENTIALS');
 END IF;
 INSERT INTO pos_private.unlock_attempts(store_id,employee_no,success) VALUES(p_store_id,p_employee_no,true);
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO pos_private.kiosk_sessions(store_id,employee_id,token_digest,expires_at)
 VALUES (p_store_id,v_employee_id,extensions.digest(v_token,'sha256'),clock_timestamp()+interval '8 hours');
 RETURN jsonb_build_object('ok',true,'token',v_token,'valid_for_seconds',28800);
END $function$
;
CREATE OR REPLACE FUNCTION public.punch(p_employee_id bigint, p_pin text, p_device text DEFAULT 'POS'::text, p_substitute_for_employee_id bigint DEFAULT NULL::bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text; v_store_id bigint; v_last_type text; v_type text;
  v_instant timestamptz:=clock_timestamp(); v_now_utc timestamp:=v_instant at time zone 'UTC'; v_now_kst timestamp:=v_instant at time zone 'Asia/Seoul';
  v_sub_name text; v_open_minute integer:=420; v_close_minute integer:=1500; v_reopen_minute integer; v_local_minute integer; v_close_clock_minute integer;
begin
  select pin_bcrypt,store_id into v_hash,v_store_id from public.employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=v_store_id AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if crypt(p_pin,v_hash) IS DISTINCT FROM v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));
  with latest_corr as (
    select distinct on(event_id) event_id,action,new_event_at,new_event_type,created_by,created_at from public.event_corrections
    where event_id is not null and employee_id=p_employee_id order by event_id,created_at desc,id desc
  ),eff as (
    select e.id::numeric ord,case when c.action='EDIT_TYPE' and c.new_event_type is not null then c.new_event_type else e.event_type end typ,
      case when c.action='EDIT_TIME' and c.new_event_at is not null then public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) else e.event_at end at
    from public.attendance_events e left join latest_corr c on c.event_id=e.id
    where e.employee_id=p_employee_id and coalesce(c.action,'')<>'VOID'
    union all
    select 1000000000000000::numeric+c.id,c.new_event_type,public.attendance_correction_effective_utc(c.new_event_at,c.created_by,c.created_at) from public.event_corrections c
    where c.employee_id=p_employee_id and c.action='ADD' and coalesce(c.reason,'') not like '%[VOID_ADD:%' and c.new_event_at is not null and c.new_event_type is not null
  ) select typ into v_last_type from eff where at is not null order by at desc,ord desc limit 1;
  v_type:=case when v_last_type='IN' then 'OUT' else 'IN' end;
  if v_type='IN' then
    select coalesce(open_minute,420),coalesce(close_minute,1500) into v_open_minute,v_close_minute
      from public.store_settings where id=coalesce(v_store_id,1);
    v_reopen_minute:=greatest(v_open_minute-60,0);
    v_local_minute:=extract(hour from v_now_kst)::integer*60+extract(minute from v_now_kst)::integer;
    if v_close_minute>=1440 then
      v_close_clock_minute:=v_close_minute-1440;
      if v_local_minute>=v_close_clock_minute and v_local_minute<v_reopen_minute then
        return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
      end if;
    elsif v_local_minute>=v_close_minute or v_local_minute<v_reopen_minute then
      return json_build_object('ok',false,'error','STORE_CLOSED','open_minute',v_open_minute,'close_minute',v_close_minute,'reopen_minute',v_reopen_minute);
    end if;
  end if;
  if v_type='OUT' then p_substitute_for_employee_id:=null;
  elsif p_substitute_for_employee_id is not null then
    if p_substitute_for_employee_id=p_employee_id then return json_build_object('ok',false,'error','SUBSTITUTE_SELF'); end if;
    select name into v_sub_name from public.employees where id=p_substitute_for_employee_id and is_active=true and store_id=v_store_id;
    if v_sub_name is null then return json_build_object('ok',false,'error','SUBSTITUTE_NOT_ACTIVE'); end if;
  end if;
  insert into public.attendance_events(employee_id,event_type,event_at,server_received_at,device_id,substitute_for_employee_id)
  values(p_employee_id,v_type,v_now_utc,v_now_utc,coalesce(p_device,'POS'),p_substitute_for_employee_id);
  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now_kst,'YYYY-MM-DD"T"HH24:MI:SS'),'name',(select name from public.employees where id=p_employee_id),
    'substitute_for_employee_id',p_substitute_for_employee_id,'substitute_for_name',v_sub_name);
end;$function$
;
CREATE OR REPLACE FUNCTION public.request_correction(p_employee_id bigint, p_pin text, p_kind text, p_event_id bigint, p_requested_at timestamp without time zone, p_requested_type text, p_note text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text; v_id bigint;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin,v_hash) IS DISTINCT FROM v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_employee_id and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if p_event_id is not null and not exists(select 1 from public.attendance_events ev where ev.id=p_event_id and ev.employee_id=p_employee_id) then return json_build_object('ok',false,'error','EVENT_EMPLOYEE_MISMATCH'); end if;
  insert into correction_requests(employee_id,event_id,kind,requested_at,requested_type,note)
    values (p_employee_id,p_event_id,p_kind,p_requested_at,p_requested_type,p_note) returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.staff_actual_attendance(p_employee_id bigint, p_pin text, p_from timestamp without time zone, p_to timestamp without time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_hash text; v_emp json;
begin
  select pin_bcrypt, json_build_object('id',id,'name',name,'employee_no',employee_no,'store_id',store_id)
    into v_hash,v_emp from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if not exists(select 1 from public.stores s where s.id=(v_emp->>'store_id')::bigint AND s.is_active AND s.onboarding_status='READY')
  then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;
  if crypt(p_pin,v_hash) IS DISTINCT FROM v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  return json_build_object(
    'ok',true,'employee',v_emp,
    'events',coalesce((select json_agg(row_to_json(t)) from (
      select ev.id,ev.employee_id,ev.event_type,
        (ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' as event_at
      from attendance_events ev
      where ev.employee_id=p_employee_id
        and ev.event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
        and ev.event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
      order by ev.event_at
    ) t),'[]'::json),
    'corrections',coalesce((select json_agg(row_to_json(c)) from (
      select ec.id,ec.event_id,ec.employee_id,ec.action,
        case when ec.new_event_at is null then null else public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at) end as new_event_at,
        ec.new_event_type,ec.reason,ec.created_by,ec.created_at
      from event_corrections ec
      where ec.employee_id=p_employee_id
        and (ec.new_event_at is null or (public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)>=p_from and public.attendance_correction_effective_kst(ec.new_event_at,ec.created_by,ec.created_at)<p_to))
      order by ec.created_at
    ) c),'[]'::json)
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_recipe_list(p_employee_id bigint, p_pin text, p_store_id bigint)
 RETURNS TABLE(product_id bigint, recipe_version_id bigint, menu_key text, menu_name text, category text, thumbnail_url text, instructions jsonb, components jsonb, assignment_status text, retirement_requested_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
begin
 if not exists(select 1 from public.stores s where s.id=p_store_id and s.is_active and s.onboarding_status='READY') then raise exception 'STORE_NOT_READY'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_stocktake_catalog(p_store_id bigint, p_employee_id bigint, p_pin text)
 RETURNS TABLE(id bigint, name text, unit text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
 PERFORM public.staff_stocktake_verify(p_store_id,p_employee_id,p_pin);
 RETURN QUERY SELECT i.id,i.name,i.unit FROM public.inventory_items i
 WHERE i.is_active AND NOT i.is_demo
   AND NOT EXISTS (SELECT 1 FROM public.inventory_movements m
    WHERE m.item_id=i.id AND (m.store_id=p_store_id OR (p_store_id=1 AND m.store_id IS NULL))
      AND m.is_demo)
 ORDER BY i.name,i.id LIMIT 500;
END $function$
;
CREATE OR REPLACE FUNCTION public.staff_stocktake_submit(p_store_id bigint, p_employee_id bigint, p_pin text, p_lines jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.staff_stocktake_verify(p_store_id bigint, p_employee_id bigint, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.substitution_candidate_availability(p_requester bigint, p_pin text, p_start timestamp without time zone, p_end timestamp without time zone)
 RETURNS TABLE(employee_id bigint, available boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; begin select pin_bcrypt into h from employees where id=p_requester and is_active=true; if h is null or crypt(p_pin,h) IS DISTINCT FROM h or p_end<=p_start then return; end if; if not exists(select 1 from public.employees req join public.stores st on st.id=req.store_id where req.id=p_requester and st.is_active and st.onboarding_status='READY') then return; end if; return query select e.id, not substitution_is_working(e.id) and not substitution_schedule_conflict(e.id,p_start,p_end) and not exists(select 1 from substitution_requests r where r.substitute_employee_id=e.id and r.status in ('ACCEPTED','IN_PROGRESS') and r.work_start<p_end and r.work_end>p_start), case when substitution_is_working(e.id) then 'CURRENTLY_WORKING' when substitution_schedule_conflict(e.id,p_start,p_end) then 'WORK_SCHEDULE' when exists(select 1 from substitution_requests r where r.substitute_employee_id=e.id and r.status in ('ACCEPTED','IN_PROGRESS') and r.work_start<p_end and r.work_end>p_start) then 'SUBSTITUTION_RESERVED' else null end from employees e where e.is_active=true and e.id<>p_requester and e.store_id=(select req.store_id from public.employees req where req.id=p_requester); end $function$
;
CREATE OR REPLACE FUNCTION public.substitution_clock_in(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h text;r public.substitution_requests%rowtype;now_kst timestamp:=clock_timestamp() at time zone 'Asia/Seoul';now_utc timestamp:=clock_timestamp() at time zone 'UTC';last_type text;
begin
 select pin_bcrypt into h from employees where id=p_employee and is_active=true;
 if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if;
 select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee for update;
 if not found or r.status<>'ACCEPTED' then return json_build_object('ok',false,'error','NOT_ACCEPTED'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if;
 if now_kst < r.work_start-interval '60 minutes' then return json_build_object('ok',false,'error','TOO_EARLY'); end if;
 if now_kst >= r.work_end then return json_build_object('ok',false,'error','SHIFT_ENDED'); end if;
 perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee::text));
 with latest as(
  select distinct on(event_id) event_id,action,new_event_type,new_event_at,created_by,created_at
  from event_corrections where event_id is not null and employee_id=p_employee order by event_id,created_at desc,id desc
 ),eff as(
  select e.id::numeric ord,
   case when l.action='EDIT_TYPE' and l.new_event_type is not null then l.new_event_type else e.event_type end typ,
   case when l.action='EDIT_TIME' and l.new_event_at is not null then
     public.attendance_correction_effective_kst(l.new_event_at,l.created_by,l.created_at)
   else e.event_at+interval '9 hours' end at_kst
  from attendance_events e left join latest l on l.event_id=e.id
  where e.employee_id=p_employee and coalesce(l.action,'')<>'VOID'
  union all
  select 1000000000000000::numeric+c.id,c.new_event_type,
   public.attendance_correction_effective_kst(c.new_event_at,c.created_by,c.created_at)
  from event_corrections c where c.employee_id=p_employee and c.action='ADD' and c.new_event_at is not null and c.new_event_type is not null and coalesce(c.reason,'') not like '%[VOID_ADD:%'
 )
 select typ into last_type from eff where at_kst is not null order by at_kst desc,ord desc limit 1;
 if last_type='IN' then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if;
 insert into attendance_events(employee_id,event_type,event_at,server_received_at,device_id) values(p_employee,'IN',now_utc,now_utc,'SUBSTITUTE:'||p_request);
 update substitution_requests set status='IN_PROGRESS' where id=p_request;
 return json_build_object('ok',true,'type','IN','at',to_char(now_kst,'YYYY-MM-DD"T"HH24:MI:SS'));
end $function$
;
CREATE OR REPLACE FUNCTION public.substitution_request_cancel(p_request bigint, p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; begin select pin_bcrypt into h from employees where id=p_employee and is_active=true; if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if; if not exists(select 1 from public.employees e join public.stores st on st.id=e.store_id where e.id=p_employee and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if; update substitution_requests set status='CANCELLED',resolved_at=now() where id=p_request and requester_employee_id=p_employee and status in('REQUESTED','ACCEPTED'); if not found then return json_build_object('ok',false,'error','NOT_CANCELLABLE'); end if; return json_build_object('ok',true); end $function$
;
CREATE OR REPLACE FUNCTION public.substitution_request_create(p_requester bigint, p_pin text, p_substitute bigint, p_start timestamp without time zone, p_end timestamp without time zone, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; rid bigint; begin select pin_bcrypt into h from employees where id=p_requester and is_active=true; if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if; if not exists(select 1 from public.employees e join public.stores s on s.id=e.store_id where e.id=p_requester and s.is_active and s.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if; if p_requester=p_substitute or p_end<=p_start or not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id where sub.id=p_substitute and sub.is_active=true and req.id=p_requester) then return json_build_object('ok',false,'error','INVALID_REQUEST'); end if; perform pg_advisory_xact_lock(hashtext('substitution_reservation_'||p_substitute::text)); if substitution_is_working(p_substitute) then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if; if substitution_schedule_conflict(p_substitute,p_start,p_end) then return json_build_object('ok',false,'error','WORK_SCHEDULE_CONFLICT'); end if; if exists(select 1 from substitution_requests x where x.substitute_employee_id=p_substitute and x.status in ('ACCEPTED','IN_PROGRESS') and x.work_start<p_end and x.work_end>p_start) then return json_build_object('ok',false,'error','SUBSTITUTION_CONFLICT'); end if; insert into substitution_requests(requester_employee_id,substitute_employee_id,work_start,work_end,note) values(p_requester,p_substitute,p_start,p_end,left(nullif(trim(p_note),''),200)) returning id into rid; return json_build_object('ok',true,'id',rid); end $function$
;
CREATE OR REPLACE FUNCTION public.substitution_request_list(p_employee bigint, p_pin text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h text;q record;
begin
  select pin_bcrypt into h from employees where id=p_employee and is_active=true;
  if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  if not exists(select 1 from public.employees e join public.stores st on st.id=e.store_id where e.id=p_employee and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY'); end if;

  perform substitution_enforce_due();
  for q in select id from substitution_requests
    where p_employee in(requester_employee_id,substitute_employee_id)
      and status in('ACCEPTED','IN_PROGRESS')
  loop
    perform substitution_refresh_one(q.id);
  end loop;

  return json_build_object('ok',true,'requests',(
    select coalesce(json_agg(x order by x.work_start desc),'[]'::json)
    from (
      select r.id,r.requester_employee_id,r.substitute_employee_id,a.name requester_name,b.name substitute_name,
             r.work_start,r.work_end,r.status,r.requested_at,r.accepted_at,r.resolved_at,r.note,r.actual_minutes
      from substitution_requests r
      join employees a on a.id=r.requester_employee_id
      join employees b on b.id=r.substitute_employee_id
      where p_employee in(r.requester_employee_id,r.substitute_employee_id) and a.store_id=b.store_id
    ) x
  ));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.substitution_request_respond(p_request bigint, p_employee bigint, p_pin text, p_accept boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$ declare h text; r substitution_requests%rowtype; begin select pin_bcrypt into h from employees where id=p_employee and is_active=true; if h is null or crypt(p_pin,h) IS DISTINCT FROM h then return json_build_object('ok',false,'error','BAD_PIN'); end if; select * into r from substitution_requests where id=p_request and substitute_employee_id=p_employee and status='REQUESTED' for update; if not found then return json_build_object('ok',false,'error','NOT_PENDING'); end if; if not exists(select 1 from public.employees sub join public.employees req on req.store_id=sub.store_id join public.stores st on st.id=sub.store_id where sub.id=p_employee and req.id=r.requester_employee_id and st.is_active and st.onboarding_status='READY') then return json_build_object('ok',false,'error','STORE_NOT_READY_OR_MISMATCH'); end if; if p_accept then perform pg_advisory_xact_lock(hashtext('substitution_reservation_'||p_employee::text)); if substitution_is_working(p_employee) then return json_build_object('ok',false,'error','ALREADY_WORKING'); end if; if substitution_schedule_conflict(p_employee,r.work_start,r.work_end) then return json_build_object('ok',false,'error','WORK_SCHEDULE_CONFLICT'); end if; if exists(select 1 from substitution_requests x where x.id<>r.id and x.substitute_employee_id=p_employee and x.status in ('ACCEPTED','IN_PROGRESS') and x.work_start<r.work_end and x.work_end>r.work_start) then return json_build_object('ok',false,'error','SUBSTITUTION_CONFLICT'); end if; end if; update substitution_requests set status=case when p_accept then 'ACCEPTED' else 'REJECTED' end,accepted_at=case when p_accept then now() else null end,resolved_at=case when p_accept then null else now() end where id=r.id; return json_build_object('ok',true); end $function$
;
REVOKE ALL ON FUNCTION public.staff_stocktake_verify(bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
