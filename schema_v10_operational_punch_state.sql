-- ============================================================================
-- 백억커피 S2 Operational Punch State resolver (단일 실행)
-- 목적: punch()와 list_employees_state()가 흩어진 "마지막 raw event" 판단을
--       공통 resolver 하나로 통일. 실동작 무변경(현재와 동일 결과).
--       향후 operational adjustment는 이 resolver 한 곳에만 확장(extension point).
-- 원칙: correction/session decision은 아직 반영 안 함 (S2 범위 밖, S6에서).
--       PIN/is_active eligibility/advisory lock/server timestamp 전부 보존.
-- 실행: SQL Editor 1회, 전체 선택 후 Run.
-- ============================================================================

begin;

-- [1] Operational Punch State resolver (SECURITY DEFINER)
--     현재 규칙: 직원의 마지막 raw attendance_event가 IN이면 다음은 OUT, 아니면 IN.
--     반환: next_type(다음 punch가 될 타입), working(현재 근무중=마지막이 IN), since(IN 시각)
--     ⚠ EXTENSION POINT: 향후 "현재 열린 punch chain 정상화용 operational adjustment"가
--       생기면, 오직 이 함수에서만 raw 마지막 event에 그 adjustment를 얹어 계산한다.
--       payroll correction/session decision은 여기 반영하지 않는다(operational ≠ effective).
create or replace function public.operational_punch_state(p_employee_id bigint)
 returns table(next_type text, working boolean, since timestamp without time zone)
 language sql
 security definer
 set search_path to 'public','pg_temp'
 stable
as $function$
  with last_ev as (
    select ev.event_type, ev.event_at
    from attendance_events ev
    where ev.employee_id = p_employee_id
    order by ev.id desc
    limit 1
  )
  select
    case when (select event_type from last_ev) = 'IN' then 'OUT' else 'IN' end as next_type,
    coalesce((select event_type from last_ev) = 'IN', false)                   as working,
    case when (select event_type from last_ev) = 'IN'
         then (select event_at from last_ev) else null end                      as since;
$function$;

-- [2] punch(): 다음 타입 결정을 resolver로. 나머지(PIN/is_active/lock/insert/timestamp) 원본 보존.
create or replace function public.punch(p_employee_id bigint, p_pin text, p_device text default 'POS')
 returns json language plpgsql security definer
 set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_hash text;
  v_type text;
  v_now timestamp := now();
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));

  -- 다음 타입 = 공통 resolver (lock 안에서 호출 → race 안전)
  select next_type into v_type from public.operational_punch_state(p_employee_id);

  insert into attendance_events(employee_id, event_type, event_at, server_received_at, device_id)
  values (p_employee_id, v_type, v_now, v_now, coalesce(p_device,'POS'));

  return json_build_object('ok', true, 'type', v_type,
    'at', to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name', (select name from employees where id=p_employee_id));
end; $function$;

-- [3] list_employees_state(): working 판정을 resolver로. is_active 필터/정렬 원본 보존.
create or replace function public.list_employees_state()
 returns table(id bigint, name text, working boolean, working_since timestamp without time zone)
 language sql
 security definer
 set search_path to 'public','extensions','pg_temp'
as $function$
  select e.id, e.name, s.working, s.since as working_since
  from employees e
  cross join lateral public.operational_punch_state(e.id) s
  where e.is_active = true
  order by s.working desc, e.name;
$function$;

-- [4] EXECUTE: resolver는 내부용(함수에서만 호출). 명시적으로 authenticated/anon 부여 안 함.
--     punch/list_employees_state는 기존 anon 권한 유지 (S1에서 grant됨, 변경 없음).
--     operational_punch_state는 SECURITY DEFINER 함수 내부에서 호출되므로 별도 grant 불필요.
--     안전을 위해 public/anon direct EXECUTE는 회수 (직접 호출 차단).
revoke execute on function public.operational_punch_state(bigint) from public, anon;

commit;

-- 검증 (선택): 활성 직원들의 현재 operational state 확인
-- select e.id, e.name, s.* from employees e
--   cross join lateral public.operational_punch_state(e.id) s where e.is_active=true;
