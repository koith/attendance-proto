-- ============================================================================
-- 백억커피 schema_v13: WorkSchedule V1 (계획 데이터. 급여/판정 규칙 없음)
-- additive: 신규 테이블만. 기존 employees/attendance/payroll/correction/문서 무변경.
-- 실행: SQL Editor 1회, 전체 선택 후 Run.
-- ============================================================================

begin;

-- [1] work_schedules (계획 데이터. 하루 1건. row없음=미등록, status=OFF=명시적 비근무)
create table if not exists public.work_schedules (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id),
  work_date     date not null,
  status        text not null check (status in ('WORK','OFF')),
  planned_start time,       -- WORK만
  planned_end   time,       -- WORK만
  overnight     boolean not null default false,  -- planned_end < planned_start = 익일
  memo          text,
  updated_by_email text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (employee_id, work_date)   -- 직원×날짜 1건
);
create index if not exists idx_ws_date on public.work_schedules(work_date);
alter table public.work_schedules enable row level security;
-- policy 0: direct 접근 차단. is_admin RPC로만.

-- [2] admin_schedule_set: upsert (등록/수정). is_admin gate + 검증.
create or replace function public.admin_schedule_set(
    p_employee_id bigint, p_work_date date, p_status text,
    p_start time, p_end time, p_memo text)
 returns json language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
declare v_actor text; v_overnight boolean := false; v_start time; v_end time;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if p_status not in ('WORK','OFF') then return json_build_object('ok',false,'error','BAD_STATUS'); end if;
  if not exists (select 1 from public.employees where id=p_employee_id) then
    return json_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if;
  if p_status='WORK' then
    if p_start is null or p_end is null then return json_build_object('ok',false,'error','TIME_REQUIRED'); end if;
    v_start:=p_start; v_end:=p_end;
    -- overnight: end < start = 익일. (같으면 0시간 → 거부)
    if v_end = v_start then return json_build_object('ok',false,'error','ZERO_DURATION'); end if;
    v_overnight := (v_end < v_start);
    -- V1 최대 예정근무 길이: 자정 1회 넘김만, 24h 미만 (overnight면 자동 <24h 보장됨)
  else
    v_start:=null; v_end:=null; v_overnight:=false;
  end if;
  insert into public.work_schedules(employee_id,work_date,status,planned_start,planned_end,overnight,memo,updated_by_email,updated_at)
    values (p_employee_id,p_work_date,p_status,v_start,v_end,v_overnight,nullif(trim(coalesce(p_memo,'')),''),v_actor,now())
  on conflict (employee_id,work_date) do update set
    status=excluded.status, planned_start=excluded.planned_start, planned_end=excluded.planned_end,
    overnight=excluded.overnight, memo=excluded.memo, updated_by_email=excluded.updated_by_email, updated_at=now();
  return json_build_object('ok',true);
end; $function$;

-- [3] admin_schedule_delete: 등록 취소 → 미등록 복귀 (계획 데이터라 hard-delete 허용)
create or replace function public.admin_schedule_delete(p_employee_id bigint, p_work_date date)
 returns json language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
declare v_del int;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  delete from public.work_schedules where employee_id=p_employee_id and work_date=p_work_date;
  get diagnostics v_del = row_count;
  return json_build_object('ok',true,'deleted',v_del);
end; $function$;

-- [4] admin_schedule_list: 날짜 범위 조회 (관리자 스케줄 화면 + 오늘 근태 결합용)
create or replace function public.admin_schedule_list(p_from date, p_to date)
 returns table(id bigint, employee_id bigint, work_date date, status text,
               planned_start time, planned_end time, overnight boolean, memo text)
 language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select w.id,w.employee_id,w.work_date,w.status,w.planned_start,w.planned_end,w.overnight,w.memo
    from public.work_schedules w
    where w.work_date >= p_from and w.work_date <= p_to
    order by w.work_date, w.employee_id;
end; $function$;

-- [5] ACL
do $$ declare fn text; begin
  foreach fn in array array[
    'admin_schedule_set(bigint,date,text,time,time,text)',
    'admin_schedule_delete(bigint,date)',
    'admin_schedule_list(date,date)'
  ] loop
    execute format('revoke execute on function public.%s from anon, public;', fn);
    execute format('grant  execute on function public.%s to authenticated;', fn);
  end loop;
end $$;

commit;
