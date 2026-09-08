-- WorkSchedule Monthly V1 batch save RPC
-- Planning data only. Does not read/write attendance, corrections, payroll, or documents.
-- One RPC call is one PostgreSQL transaction: validation runs before any write.

create or replace function public.admin_schedule_batch(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor text;
  v_item jsonb;
  v_op text;
  v_status text;
  v_employee_id bigint;
  v_work_date date;
  v_start time;
  v_end time;
  v_memo text;
  v_rowcount integer;
  v_applied integer := 0;
  v_set_count integer := 0;
  v_delete_count integer := 0;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    return jsonb_build_object('ok',false,'error','BAD_PAYLOAD');
  end if;
  if jsonb_array_length(p_changes) > 500 then
    return jsonb_build_object('ok',false,'error','TOO_MANY_CHANGES');
  end if;

  -- Pass 1: validate the complete batch before any write.
  for v_item in select value from jsonb_array_elements(p_changes)
  loop
    begin
      v_op := upper(coalesce(v_item->>'op','SET'));
      v_employee_id := nullif(v_item->>'employee_id','')::bigint;
      v_work_date := nullif(v_item->>'work_date','')::date;
    exception when others then
      return jsonb_build_object('ok',false,'error','BAD_ITEM','item',v_item);
    end;

    if v_employee_id is null or v_work_date is null then
      return jsonb_build_object('ok',false,'error','EMPLOYEE_DATE_REQUIRED','item',v_item);
    end if;
    if not exists (select 1 from public.employees where id=v_employee_id) then
      return jsonb_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND','employee_id',v_employee_id);
    end if;

    if v_op = 'DELETE' then
      continue;
    elsif v_op <> 'SET' then
      return jsonb_build_object('ok',false,'error','BAD_OP','item',v_item);
    end if;

    v_status := upper(coalesce(v_item->>'status',''));
    if v_status not in ('WORK','OFF') then
      return jsonb_build_object('ok',false,'error','BAD_STATUS','item',v_item);
    end if;

    if v_status = 'WORK' then
      begin
        v_start := nullif(v_item->>'planned_start','')::time;
        v_end := nullif(v_item->>'planned_end','')::time;
      exception when others then
        return jsonb_build_object('ok',false,'error','BAD_TIME','item',v_item);
      end;
      if v_start is null or v_end is null then
        return jsonb_build_object('ok',false,'error','TIME_REQUIRED','item',v_item);
      end if;
      if v_start = v_end then
        return jsonb_build_object('ok',false,'error','ZERO_DURATION','item',v_item);
      end if;
    end if;
  end loop;

  -- Pass 2: apply only after the whole batch has passed validation.
  v_actor := coalesce(auth.jwt()->>'email','admin');
  for v_item in select value from jsonb_array_elements(p_changes)
  loop
    v_op := upper(coalesce(v_item->>'op','SET'));
    v_employee_id := (v_item->>'employee_id')::bigint;
    v_work_date := (v_item->>'work_date')::date;

    if v_op = 'DELETE' then
      delete from public.work_schedules
      where employee_id=v_employee_id and work_date=v_work_date;
      get diagnostics v_rowcount = row_count;
      v_delete_count := v_delete_count + v_rowcount;
      v_applied := v_applied + v_rowcount;
      continue;
    end if;

    v_status := upper(v_item->>'status');
    v_memo := nullif(trim(coalesce(v_item->>'memo','')),'');
    if v_status = 'WORK' then
      v_start := (v_item->>'planned_start')::time;
      v_end := (v_item->>'planned_end')::time;
    else
      v_start := null;
      v_end := null;
    end if;

    insert into public.work_schedules(
      employee_id,work_date,status,planned_start,planned_end,memo,updated_by_email,updated_at
    ) values (
      v_employee_id,v_work_date,v_status,v_start,v_end,v_memo,v_actor,now()
    )
    on conflict (employee_id,work_date) do update set
      status=excluded.status,
      planned_start=excluded.planned_start,
      planned_end=excluded.planned_end,
      memo=excluded.memo,
      updated_by_email=excluded.updated_by_email,
      updated_at=now()
    where (work_schedules.status,work_schedules.planned_start,work_schedules.planned_end,work_schedules.memo)
      is distinct from
      (excluded.status,excluded.planned_start,excluded.planned_end,excluded.memo);

    get diagnostics v_rowcount = row_count;
    v_set_count := v_set_count + v_rowcount;
    v_applied := v_applied + v_rowcount;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'requested',jsonb_array_length(p_changes),
    'applied',v_applied,
    'set_count',v_set_count,
    'delete_count',v_delete_count
  );
end;
$function$;
