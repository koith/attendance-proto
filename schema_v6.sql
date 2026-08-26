-- ============================================================
-- M8: 월마감 + snapshot
-- 마감 시 그 달 전 직원의 계산결과(근태시간·시급·주휴·조정·최종급여)를
-- payroll_snapshot에 통째로 고정. 이후 근태 변경 시 재계산 필요 감지.
-- Supabase SQL Editor에 붙여넣고 Run.
-- ============================================================

create table if not exists payroll_snapshot (
  id           bigint generated always as identity primary key,
  ym           text not null,
  employee_id  bigint not null references employees(id),
  employee_name text not null,
  -- 계산 결과 스냅샷 (마감 당시 값)
  hours        numeric,        -- 실근무 시간(소수)
  wage         integer,
  weeks        int,
  base_pay     integer,
  juhyu_pay    integer,
  adjust       integer,
  gross_pay    integer,
  tax_rate     numeric,
  net_pay      integer,
  memo         text,           -- 이달 사유 등
  -- 재계산 감지용: 마감 당시 그 달 근태의 지문(이벤트+보정 최신시각/개수)
  source_fingerprint text,
  closed_by    text,
  closed_at    timestamptz not null default now()
);
create unique index if not exists uq_snapshot_ym_emp on payroll_snapshot(ym, employee_id);

alter table payroll_snapshot enable row level security;

-- ============================================================
-- 마감: 앱이 계산한 결과 배열을 받아 snapshot 저장 + period 상태 CLOSED
--   p_rows: [{employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo}]
--   p_fingerprint: 그 달 근태 지문(앱이 계산)
-- ============================================================
create or replace function admin_close_payroll(p_ym text, p_rows json, p_fingerprint text)
returns json
language plpgsql security definer set search_path=public as $$
declare v_actor text; r json; n int := 0;
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');

  -- 기존 스냅샷 제거 후 재작성 (재마감 대비)
  delete from payroll_snapshot where ym=p_ym;

  for r in select * from json_array_elements(p_rows) loop
    insert into payroll_snapshot(ym,employee_id,employee_name,hours,wage,weeks,
      base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_by)
    values (p_ym,
      (r->>'employee_id')::bigint, r->>'employee_name',
      nullif(r->>'hours','')::numeric, nullif(r->>'wage','')::int, nullif(r->>'weeks','')::int,
      nullif(r->>'base_pay','')::int, nullif(r->>'juhyu_pay','')::int, coalesce(nullif(r->>'adjust','')::int,0),
      nullif(r->>'gross_pay','')::int, nullif(r->>'tax_rate','')::numeric, nullif(r->>'net_pay','')::int,
      r->>'memo', p_fingerprint, v_actor);
    n := n + 1;
  end loop;

  insert into payroll_period(ym,status,updated_by,updated_at)
    values (p_ym,'CLOSED',v_actor,now())
  on conflict (ym) do update set status='CLOSED', updated_by=v_actor, updated_at=now();

  return json_build_object('ok',true,'count',n);
end;
$$;

-- 마감 해제 (재계산 위해)
create or replace function admin_reopen_payroll(p_ym text)
returns json
language plpgsql security definer set search_path=public as $$
declare v_actor text;
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  update payroll_period set status='OPEN', updated_by=v_actor, updated_at=now() where ym=p_ym;
  return json_build_object('ok',true);
end;
$$;

-- 스냅샷 + 현재 지문 조회 (마감 상태/변경 감지용)
create or replace function admin_snapshot(p_ym text)
returns json
language sql security definer set search_path=public as $$
  select json_build_object(
    'status', coalesce((select status from payroll_period where ym=p_ym),'OPEN'),
    'fingerprint', (select source_fingerprint from payroll_snapshot where ym=p_ym limit 1),
    'rows', coalesce((select json_agg(row_to_json(s)) from (
      select employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,closed_by,closed_at
      from payroll_snapshot where ym=p_ym order by employee_name) s),'[]'::json)
  );
$$;

grant execute on function admin_close_payroll(text,json,text) to authenticated;
grant execute on function admin_reopen_payroll(text) to authenticated;
grant execute on function admin_snapshot(text) to authenticated;
