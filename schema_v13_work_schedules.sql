-- ============================================================================
-- 백억커피 schema_v13: WorkSchedule V1 (계획 데이터. 급여/판정 규칙 없음)
-- additive: 신규 테이블만. 기존 employees/attendance/payroll/correction/문서 무변경.
-- 실행: SQL Editor 1회, 전체 선택 후 Run.
--
-- 설계 결정:
--  · overnight 컬럼 없음 — planned_end < planned_start 로 조회/JS에서 파생(불일치 방지)
--  · 과거 계획 보존 — work_schedules는 현재 유효계획(upsert/delete), 변경/삭제 시
--    이전 값을 work_schedule_history에 트리거로 자동 백업(조용한 덮어쓰기 방지).
--    이력 조회 기능은 이번에 안 만듦(보존만). revision architecture 아님.
--  · WORK/OFF 무결성 DB CHECK로 강제(시각 필수/금지, zero-duration 차단).
-- ============================================================================

begin;

-- [1] work_schedules: 현재 유효 계획. 하루 1건.
create table if not exists public.work_schedules (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id),
  work_date     date not null,
  status        text not null check (status in ('WORK','OFF')),
  planned_start time,   -- WORK만
  planned_end   time,   -- WORK만
  memo          text,
  updated_by_email text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (employee_id, work_date),
  -- WORK이면 start/end 필수 + 서로 달라야(zero-duration 차단). OFF이면 start/end 없어야.
  constraint ws_time_rule check (
    (status='WORK' and planned_start is not null and planned_end is not null and planned_start <> planned_end)
    or
    (status='OFF' and planned_start is null and planned_end is null)
  )
);
create index if not exists idx_ws_date on public.work_schedules(work_date);
alter table public.work_schedules enable row level security;
-- policy 0: direct 접근 차단. is_admin RPC로만.

-- [2] work_schedule_history: 변경/삭제 전 값 자동 백업 (과거 계획 증거 보존)
create table if not exists public.work_schedule_history (
  id            bigint generated always as identity primary key,
  schedule_id   bigint,               -- 원본 work_schedules.id (삭제 후에도 값 남김, FK 안 검)
  employee_id   bigint not null,
  work_date     date not null,
  status        text,
  planned_start time,
  planned_end   time,
  memo          text,
  updated_by_email text,              -- 당시 값
  op            text not null,        -- 'UPDATE' | 'DELETE' (이 이력이 어떤 변경으로 생겼나)
  archived_at   timestamptz not null default now()
);
create index if not exists idx_wsh_emp_date on public.work_schedule_history(employee_id, work_date);
alter table public.work_schedule_history enable row level security;

-- [3] 트리거: UPDATE/DELETE 시 이전(OLD) 값을 history에 적재
create or replace function public.ws_archive() returns trigger
 language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  insert into public.work_schedule_history(schedule_id,employee_id,work_date,status,planned_start,planned_end,memo,updated_by_email,op)
    values (OLD.id,OLD.employee_id,OLD.work_date,OLD.status,OLD.planned_start,OLD.planned_end,OLD.memo,OLD.updated_by_email,TG_OP);
  return OLD;   -- (BEFORE 트리거: UPDATE는 NEW 반환이 관례지만, 여기선 값만 백업. AFTER로 두어 안전하게)
end; $function$;

drop trigger if exists trg_ws_archive_update on public.work_schedules;
create trigger trg_ws_archive_update after update on public.work_schedules
  for each row execute function public.ws_archive();
drop trigger if exists trg_ws_archive_delete on public.work_schedules;
create trigger trg_ws_archive_delete after delete on public.work_schedules
  for each row execute function public.ws_archive();

-- [4] admin_schedule_set: upsert (등록/수정). is_admin gate + 검증. (DB CHECK가 최종 강제)
create or replace function public.admin_schedule_set(
    p_employee_id bigint, p_work_date date, p_status text,
    p_start time, p_end time, p_memo text)
 returns json language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
declare v_actor text; v_start time; v_end time;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  if p_status not in ('WORK','OFF') then return json_build_object('ok',false,'error','BAD_STATUS'); end if;
  if not exists (select 1 from public.employees where id=p_employee_id) then
    return json_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND'); end if;
  if p_status='WORK' then
    if p_start is null or p_end is null then return json_build_object('ok',false,'error','TIME_REQUIRED'); end if;
    if p_start = p_end then return json_build_object('ok',false,'error','ZERO_DURATION'); end if;
    v_start:=p_start; v_end:=p_end;
  else
    v_start:=null; v_end:=null;   -- OFF: 시각 없음 (CHECK도 강제)
  end if;
  insert into public.work_schedules(employee_id,work_date,status,planned_start,planned_end,memo,updated_by_email,updated_at)
    values (p_employee_id,p_work_date,p_status,v_start,v_end,nullif(trim(coalesce(p_memo,'')),''),v_actor,now())
  on conflict (employee_id,work_date) do update set
    status=excluded.status, planned_start=excluded.planned_start, planned_end=excluded.planned_end,
    memo=excluded.memo, updated_by_email=excluded.updated_by_email, updated_at=now();
  return json_build_object('ok',true);
end; $function$;

-- [5] admin_schedule_delete: 등록 취소 → 미등록 복귀 (트리거가 이전 값 history 백업)
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

-- [6] admin_schedule_list: 범위 조회 (관리자 스케줄 화면 + 오늘 근태 결합)
create or replace function public.admin_schedule_list(p_from date, p_to date)
 returns table(id bigint, employee_id bigint, work_date date, status text,
               planned_start time, planned_end time, memo text)
 language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select w.id,w.employee_id,w.work_date,w.status,w.planned_start,w.planned_end,w.memo
    from public.work_schedules w
    where w.work_date >= p_from and w.work_date <= p_to
    order by w.work_date, w.employee_id;
end; $function$;

-- [7] ACL
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
