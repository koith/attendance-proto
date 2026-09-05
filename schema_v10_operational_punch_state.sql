-- ============================================================================
-- 백억커피 S2 Operational Punch State resolver (schema_v10, 단일 실행)
-- 목적: punch()와 list_employees_state()의 "마지막 raw event(ORDER BY id DESC로
--       결정되는 단일 최종 row)" 판단을 공통 resolver로 통일. 실동작 무변경.
--       향후 operational adjustment는 이 resolver 한 곳에만 확장(extension point).
--
-- timestamp semantics: ⚠ 이번 S2에서 의도적으로 기존 동작 보존.
--   event_at = server_received_at = now()(= transaction_timestamp, advisory lock 대기 전
--   평가). lock 대기 후 실제 기록시각과 차이날 수 있는 확인된 이슈이나, resolver 리팩터와
--   timestamp semantics 변경을 한 migration에 섞지 않기 위해 S2에서는 변경하지 않는다.
--   → 다음 P0(Overnight/Session Duration) root-cause에서 event_at/server_received_at/
--     client_reported_at/now()·clock_timestamp()·pairEvents ordering까지 함께 검토 후 결정.
--
-- ACL: 최종 상태를 migration이 명시적으로 보장(기존 상태 보존 의존 아님).
-- 실행: SQL Editor 1회, 전체 선택 후 Run. begin~commit 보호(실패 시 부분 적용 없음).
-- 데이터 mutation 없음(UPDATE/DELETE/fixture insert 없음).
-- ============================================================================

begin;

-- [1] Operational Punch State resolver
--     마지막 raw event = ORDER BY id DESC LIMIT 1 (id는 PK라 유일 → 단일 최종 row 결정)
--     ⚠ EXTENSION POINT: 향후 "현재 열린 punch chain 정상화용 operational adjustment"는
--       오직 이 함수에서만 raw 최종 event에 얹는다.
--       payroll correction / session recognition decision은 여기 반영하지 않는다.
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

-- [2] punch(): 다음 타입 결정만 resolver로. PIN/is_active/advisory lock/insert/timestamp 보존.
--     timestamp는 위 주석대로 기존 now() 동작 보존(변경하지 않음).
create or replace function public.punch(p_employee_id bigint, p_pin text, p_device text default 'POS')
 returns json language plpgsql security definer
 set search_path to 'public','extensions','pg_temp'
as $function$
declare
  v_hash text;
  v_type text;
  v_now timestamp := now();   -- 기존 동작 보존 (transaction_timestamp). P0에서 재검토.
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));

  select next_type into v_type from public.operational_punch_state(p_employee_id);

  insert into attendance_events(employee_id, event_type, event_at, server_received_at, device_id)
  values (p_employee_id, v_type, v_now, v_now, coalesce(p_device,'POS'));

  return json_build_object('ok', true, 'type', v_type,
    'at', to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name', (select name from employees where id=p_employee_id));
end; $function$;

-- [3] list_employees_state(): working 판정을 resolver로. is_active 필터/정렬 보존.
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

-- ────────────────────────────────────────────────────────────────────
-- [4] ACL 최종 상태 명시 보장 (기존 상태 보존 의존 아님)
--     PUBLIC ≠ anon. PUBLIC revoke 후 필요한 role에만 명시 grant.
--     resolver EXECUTE는 SECURITY DEFINER 소유자 권한으로 검사되므로,
--     전부 revoke해도 punch/list 내부 호출은 정상 동작(자체검토 확인).
--     service_role: 기존 explicit 상태 유지. 새 grant 추가 안 함(S2 호출 불필요).
-- ────────────────────────────────────────────────────────────────────

-- resolver: 내부 전용 → PUBLIC/anon/authenticated direct EXECUTE 전면 금지
revoke execute on function public.operational_punch_state(bigint) from public;
revoke execute on function public.operational_punch_state(bigint) from anon;
revoke execute on function public.operational_punch_state(bigint) from authenticated;

-- punch: POS/employee PIN 경로 → PUBLIC generic 의존 제거, anon/authenticated 명시 grant
revoke execute on function public.punch(bigint,text,text) from public;
grant  execute on function public.punch(bigint,text,text) to anon, authenticated;

-- list_employees_state: POS public read → PUBLIC generic 의존 제거, anon/authenticated 명시 grant
revoke execute on function public.list_employees_state() from public;
grant  execute on function public.list_employees_state() to anon, authenticated;

commit;
