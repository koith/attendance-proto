-- ============================================================
-- M3 Hardening: 서버측 비밀번호 검증 + 서버시각 + RLS 잠금
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- 이 스크립트 실행 후 앱을 RPC 기반으로 전환하는 2차 배포가 필요합니다.
-- ============================================================

-- 0) pgcrypto (비밀번호 해시/검증용)
create extension if not exists pgcrypto;

-- 1) 비밀번호 컬럼 전환: 기존 pin_hash(클라이언트 PBKDF2) → 서버 bcrypt
--    기존 테스트 데이터는 어차피 폐기 예정이므로 새 컬럼으로 간다.
alter table employees add column if not exists pin_bcrypt text;

-- 2) event_at 기본값을 서버시각으로 (클라이언트가 안 보내면 DB가 채움)
--    표시용 KST는 앱에서 변환. 저장은 timestamptz(UTC) 권장이나
--    기존 스키마가 timestamp라 호환 위해 now() 사용.
alter table attendance_events alter column event_at set default now();
alter table attendance_events alter column server_received_at set default now();
alter table attendance_events add column if not exists client_reported_at timestamp; -- 참고용(신뢰 안 함)

-- ============================================================
-- 3) RPC: 직원 목록 (비밀번호 절대 노출 안 함)
-- ============================================================
create or replace function list_active_employees()
returns table(id bigint, name text)
language sql security definer set search_path=public as $$
  select id, name from employees where is_active = true order by name;
$$;

-- ============================================================
-- 4) RPC: 서버측 타각 (비밀번호 검증 + 서버시각 기록)
--    - 비밀번호는 여기서만 검증, 해시는 절대 밖으로 안 나감
--    - event_at은 서버 now()로 기록 (클라이언트 시각 무시)
--    - IN/OUT은 직전 상태 보고 서버가 판정
--    - 8초 중복 방지도 서버에서
-- ============================================================
create or replace function punch(p_employee_id bigint, p_pin text, p_device text default null)
returns json
language plpgsql security definer set search_path=public as $$
declare
  v_hash text;
  v_last record;
  v_type text;
  v_now timestamp := now();
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then
    return json_build_object('ok',false,'error','NO_EMPLOYEE');
  end if;
  if crypt(p_pin, v_hash) <> v_hash then
    return json_build_object('ok',false,'error','BAD_PIN');
  end if;

  select * into v_last from attendance_events
    where employee_id=p_employee_id order by event_at desc, id desc limit 1;

  -- 8초 중복 방지
  if v_last is not null and extract(epoch from (v_now - v_last.event_at)) < 8 then
    return json_build_object('ok',false,'error','TOO_SOON');
  end if;

  -- IN/OUT 판정: 직전이 IN이면 OUT, 아니면 IN
  if v_last is not null and v_last.event_type='IN' then
    v_type := 'OUT';
  else
    v_type := 'IN';
  end if;

  insert into attendance_events(employee_id, event_type, event_at, server_received_at, device_id)
    values (p_employee_id, v_type, v_now, v_now, coalesce(p_device,'POS'));

  return json_build_object('ok',true,'type',v_type,'at',to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'));
end;
$$;

-- ============================================================
-- 5) RPC: 관리자 직원 등록 (비밀번호를 서버에서 bcrypt 해시)
--    실제 운영에선 관리자 인증(아래 8번) 뒤에만 호출되게 할 것.
-- ============================================================
create or replace function admin_create_employee(p_name text, p_pin text)
returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  insert into employees(name, pin_bcrypt, is_active)
    values (p_name, crypt(p_pin, gen_salt('bf')), true)
    returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 6) RLS: 테이블 직접 접근 전면 차단, RPC로만 우회
-- ============================================================
alter table employees enable row level security;
alter table attendance_events enable row level security;

-- 기존 anon 직접 CRUD 정책이 있다면 제거 (없으면 무시됨)
-- 정책을 아무것도 안 만들면 anon 직접 select/insert/update/delete 전부 거부됨.
-- RPC(security definer)는 소유자 권한으로 돌아 RLS를 우회하므로 앱은 RPC만 쓰면 됨.

-- 관리자 조회용(오늘 근태/급여)은 당장은 RPC 추가로 처리하거나,
-- M3 다음 단계에서 Supabase Auth 도입 후 authenticated 정책으로 연다.

-- ============================================================
-- 7) 실행 함수 권한: anon이 RPC를 호출할 수 있게
-- ============================================================
grant execute on function list_active_employees() to anon;
grant execute on function punch(bigint, text, text) to anon;
-- admin_create_employee는 anon에게 주지 않는다(관리자 인증 뒤 service_role 또는 Auth로).
-- 임시 검증 단계에서만 필요하면 아래 주석 해제:
-- grant execute on function admin_create_employee(text, text) to anon;

-- ============================================================
-- 8) 관리자 인증 (M3 최소): 아래는 방향 안내(구현은 2차)
--    옵션 A) Supabase Auth 이메일 로그인 → authenticated 역할에게만
--            관리자 조회 RPC/정책 부여.
--    옵션 B) 임시: admin 조회도 RPC(security definer)로 만들고
--            RPC 인자에 관리자 비밀번호를 받아 서버에서 검증.
--    실제 직원 데이터 투입 전 반드시 A 또는 B 완료.
-- ============================================================
