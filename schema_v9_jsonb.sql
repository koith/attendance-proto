-- ============================================================
-- P0-13 버그 수정: 직원 급여설정 저장 실패 (42883)
-- 원인: admin_update_employee(p_fields json)에서 json에 없는 '?' 연산자 사용.
--       ('?'는 jsonb 전용 → operator does not exist: json ? unknown)
-- 해결: 파라미터 타입을 jsonb로 변경. 로직 동일.
-- 기존 json 시그니처 함수는 DROP (오버로드 충돌 방지).
-- Supabase SQL Editor에서 실행 (Run without RLS 눌러도 됨).
-- ============================================================

drop function if exists admin_update_employee(bigint, json);

create or replace function admin_update_employee(p_id bigint, p_fields jsonb)
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

grant execute on function admin_update_employee(bigint, jsonb) to authenticated;

-- ============================================================
-- [적용 후 검증] 아래를 실행해 jsonb 함수 하나만 남았는지 확인:
--   select proname, pg_get_function_arguments(oid) as args
--   from pg_proc where proname='admin_update_employee';
-- 기대: 1행, args = "p_id bigint, p_fields jsonb"
-- 만약 2행(json+jsonb)이면 아래 한 번 더 실행:
--   drop function admin_update_employee(bigint, json);
-- ============================================================
