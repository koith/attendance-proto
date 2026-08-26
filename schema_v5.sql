-- ============================================================
-- M5: 급여기간 모델 — 직원 영구설정 vs 이번 달 예외 분리
-- 목적: "2026-07만 주휴 3주" 같은 월별 예외가 다음 달을 오염시키지 않게.
-- 직원 영구속성(employees.wage, juhyu_hours...)은 "기본값(default)".
-- payroll_period_employee가 "그 달만의 덮어쓰기(override)".
-- 계산 = 이번 달 override 있으면 그것, 없으면 직원 기본값.
-- Supabase SQL Editor에 전체 붙여넣고 Run.
-- ============================================================

-- 급여기간(월) 단위 상태 — 마감(M8) 대비 미리 상태 컬럼도 둠
create table if not exists payroll_period (
  ym          text primary key,      -- "2026-07"
  status      text not null default 'OPEN' check (status in ('OPEN','CALCULATED','REVIEW','CLOSED')),
  weeks       int,                   -- 그 달 주휴 계산용 주 수(관리자가 확정; null이면 앱 기본 4)
  note        text,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

-- 그 달 × 직원 조정값 (override). 없으면 직원 기본값 사용.
create table if not exists payroll_period_employee (
  ym                text not null,
  employee_id       bigint not null references employees(id),
  wage_override     integer,         -- 이번 달만 시급 다르게(예: 월중 인상 반영)
  juhyu_hours_override numeric,      -- 이번 달 주휴시간 덮어쓰기
  juhyu_weeks_override int,          -- 이번 달 이 직원 주휴 인정주수(예: 1주 제외→3)
  tax_rate_override numeric,
  adjust_amount     integer default 0, -- 임의 가감액(수당/공제 조정, +/-)
  memo              text,            -- 이번 달 사유("15h미만 1주 제외" 등)
  updated_by        text,
  updated_at        timestamptz not null default now(),
  primary key (ym, employee_id)
);

alter table payroll_period enable row level security;
alter table payroll_period_employee enable row level security;

-- ============================================================
-- 관리자: 급여기간 조회(직원 기본값 + 이번 달 override + 주 수)
-- ============================================================
create or replace function admin_payroll_period(p_ym text)
returns json
language sql security definer set search_path=public as $$
  select json_build_object(
    'period', coalesce((select row_to_json(p) from payroll_period p where p.ym=p_ym),
                       json_build_object('ym',p_ym,'status','OPEN','weeks',null)),
    'overrides', coalesce((select json_agg(row_to_json(o)) from payroll_period_employee o where o.ym=p_ym),'[]'::json)
  );
$$;

-- 관리자: 그 달 주 수 설정
create or replace function admin_set_period_weeks(p_ym text, p_weeks int)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  insert into payroll_period(ym, weeks, updated_by, updated_at)
    values (p_ym, p_weeks, coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym) do update set weeks=excluded.weeks, updated_by=excluded.updated_by, updated_at=now();
end;
$$;

-- 관리자: 그 달 × 직원 조정값 upsert
create or replace function admin_set_period_employee(p_ym text, p_employee_id bigint, p_fields json)
returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  insert into payroll_period_employee(ym, employee_id,
      wage_override, juhyu_hours_override, juhyu_weeks_override, tax_rate_override, adjust_amount, memo, updated_by, updated_at)
    values (p_ym, p_employee_id,
      nullif(p_fields->>'wage_override','')::int,
      nullif(p_fields->>'juhyu_hours_override','')::numeric,
      nullif(p_fields->>'juhyu_weeks_override','')::int,
      nullif(p_fields->>'tax_rate_override','')::numeric,
      coalesce(nullif(p_fields->>'adjust_amount','')::int,0),
      nullif(p_fields->>'memo',''),
      coalesce(auth.jwt()->>'email','admin'), now())
  on conflict (ym, employee_id) do update set
      wage_override=excluded.wage_override,
      juhyu_hours_override=excluded.juhyu_hours_override,
      juhyu_weeks_override=excluded.juhyu_weeks_override,
      tax_rate_override=excluded.tax_rate_override,
      adjust_amount=excluded.adjust_amount,
      memo=excluded.memo, updated_by=excluded.updated_by, updated_at=now();
end;
$$;

grant execute on function admin_payroll_period(text) to authenticated;
grant execute on function admin_set_period_weeks(text,int) to authenticated;
grant execute on function admin_set_period_employee(text,bigint,json) to authenticated;
