-- ============================================================
-- M8.5B: 동시성 방어 — punch race condition 차단
-- 문제: 두 요청이 커밋 전 동시에 직전이벤트를 읽으면 둘 다 같은 판정 → 중복 IN.
-- 해결: 직원별 advisory lock으로 같은 직원의 punch를 서버에서 직렬화.
-- Supabase SQL Editor에서 실행 ("Run without RLS" 눌러도 됨).
-- ============================================================

create or replace function punch(p_employee_id bigint, p_pin text, p_device text default 'POS')
returns json language plpgsql security definer set search_path=public,extensions as $$
declare
  v_hash text;
  v_last_type text;
  v_type text;
  v_now timestamp := now();
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  -- ★ 직원별 트랜잭션 advisory lock: 같은 직원의 동시 punch를 직렬화.
  --   같은 트랜잭션 종료까지 다른 punch(같은 직원)는 여기서 대기 → race 차단.
  perform pg_advisory_xact_lock(hashtext('punch_emp_'||p_employee_id::text));

  -- 락 획득 후 직전 이벤트 조회 (이 시점엔 앞선 요청이 이미 커밋됨)
  select event_type into v_last_type
  from attendance_events
  where employee_id = p_employee_id
  order by id desc
  limit 1;

  if v_last_type is not null and v_last_type = 'IN' then
    v_type := 'OUT';
  else
    v_type := 'IN';
  end if;

  insert into attendance_events(employee_id, event_type, event_at, server_received_at, device_id)
  values (p_employee_id, v_type, v_now, v_now, coalesce(p_device,'POS'));

  return json_build_object('ok', true, 'type', v_type,
    'at', to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name', (select name from employees where id=p_employee_id));
end; $$;

grant execute on function punch(bigint,text,text) to anon, authenticated;

-- 검증용: 같은 직원 동시 호출해도 IN/OUT 교대가 보장되는지는
-- 실제 동시 세션 2개로 테스트해야 정확하나, advisory lock으로 논리적 직렬화 보장됨.
