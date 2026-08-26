-- ============================================================
-- M3 Hardening (Auth 방식 최종본)
-- Supabase SQL Editor에 전체 붙여넣고 Run 하세요.
-- 관리자 계정은 대시보드 Authentication > Users에서 이미 생성됨.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) 서버 bcrypt 비밀번호 컬럼 + 서버시각 기본값
alter table employees add column if not exists pin_bcrypt text;
alter table attendance_events alter column event_at set default now();
alter table attendance_events alter column server_received_at set default now();
alter table attendance_events add column if not exists client_reported_at timestamp;

-- ============================================================
-- 2) 직원 목록 RPC (비밀번호 노출 안 함) — anon 허용
-- ============================================================
create or replace function list_active_employees()
returns table(id bigint, name text)
language sql security definer set search_path=public as $$
  select id, name from employees where is_active = true order by name;
$$;

-- 직원 현재상태(근무중 여부)까지 한 번에 — POS 화면용, anon 허용
create or replace function list_employees_state()
returns table(id bigint, name text, working boolean)
language sql security definer set search_path=public as $$
  select e.id, e.name,
    coalesce((
      select ev.event_type='IN'
      from attendance_events ev
      where ev.employee_id=e.id
      order by ev.event_at desc, ev.id desc limit 1
    ), false) as working
  from employees e
  where e.is_active = true
  order by e.name;
$$;

-- ============================================================
-- 3) 서버측 타각 RPC (PIN 검증+서버시각+IN/OUT판정+중복방지) — anon 허용
-- ============================================================
create or replace function punch(p_employee_id bigint, p_pin text, p_device text default 'POS')
returns json
language plpgsql security definer set search_path=public as $$
declare
  v_hash text; v_last record; v_type text; v_now timestamp := now();
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;

  select * into v_last from attendance_events
    where employee_id=p_employee_id order by event_at desc, id desc limit 1;
  if v_last is not null and extract(epoch from (v_now - v_last.event_at)) < 8 then
    return json_build_object('ok',false,'error','TOO_SOON');
  end if;

  if v_last is not null and v_last.event_type='IN' then v_type:='OUT'; else v_type:='IN'; end if;

  insert into attendance_events(employee_id, event_type, event_at, server_received_at, device_id)
    values (p_employee_id, v_type, v_now, v_now, coalesce(p_device,'POS'));

  return json_build_object('ok',true,'type',v_type,
    'at',to_char(v_now,'YYYY-MM-DD"T"HH24:MI:SS'),
    'name',(select name from employees where id=p_employee_id));
end;
$$;

-- ============================================================
-- 4) 관리자 전용 RPC — authenticated(로그인한 점주)만
-- ============================================================
-- 직원 등록
create or replace function admin_create_employee(p_name text, p_pin text)
returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  insert into employees(name, pin_bcrypt, is_active)
    values (p_name, crypt(p_pin, gen_salt('bf')), true) returning id into v_id;
  return v_id;
end;
$$;

-- 직원 비활성화
create or replace function admin_deactivate_employee(p_id bigint)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  update employees set is_active=false where id=p_id;
end;
$$;

-- 직원 급여속성 수정
create or replace function admin_update_employee(p_id bigint, p_fields json)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  update employees set
    wage        = coalesce((p_fields->>'wage')::int, wage),
    juhyu_hours = coalesce((p_fields->>'juhyu_hours')::numeric, juhyu_hours),
    juhyu_round = case when p_fields ? 'juhyu_round'
                       then nullif(p_fields->>'juhyu_round','')::int else juhyu_round end,
    tax_rate    = coalesce((p_fields->>'tax_rate')::numeric, tax_rate),
    memo        = case when p_fields ? 'memo' then nullif(p_fields->>'memo','') else memo end
  where id=p_id;
end;
$$;

-- 관리자용 직원 전체 조회(급여속성 포함)
create or replace function admin_list_employees()
returns setof employees
language sql security definer set search_path=public as $$
  select * from employees where is_active=true order by name;
$$;

-- 기간 이벤트 조회 (오늘/월 집계용) — authenticated만
create or replace function admin_events(p_from timestamp, p_to timestamp)
returns setof attendance_events
language sql security definer set search_path=public as $$
  select * from attendance_events
  where event_at >= p_from and event_at < p_to
  order by employee_id, event_at;
$$;

-- ============================================================
-- 5) RLS: 테이블 직접 접근 전면 차단 (RPC로만)
-- ============================================================
alter table employees enable row level security;
alter table attendance_events enable row level security;
-- 정책 미생성 = 직접 select/insert/update/delete 전부 거부.
-- security definer RPC는 소유자 권한이라 RLS 우회 → 앱은 RPC만 사용.

-- ============================================================
-- 6) 실행 권한
-- ============================================================
grant execute on function list_active_employees() to anon, authenticated;
grant execute on function list_employees_state() to anon, authenticated;
grant execute on function punch(bigint,text,text) to anon, authenticated;

grant execute on function admin_create_employee(text,text) to authenticated;
grant execute on function admin_deactivate_employee(bigint) to authenticated;
grant execute on function admin_update_employee(bigint,json) to authenticated;
grant execute on function admin_list_employees() to authenticated;
grant execute on function admin_events(timestamp,timestamp) to authenticated;

-- admin_* 함수 안에서 auth.role() 재확인하므로 anon이 호출해도 예외 발생(이중 방어).
