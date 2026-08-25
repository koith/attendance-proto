-- 백억커피 근태 V0.1 · Supabase(Postgres) 스키마
-- Supabase 대시보드 → SQL Editor에 붙여넣고 실행하세요.

create table if not exists employees (
  id          bigint generated always as identity primary key,
  name        text not null,
  pin_hash    text not null,               -- pbkdf2_sha256$salt$digest (평문 저장 안 함)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists attendance_events (
  id                 bigint generated always as identity primary key,
  employee_id        bigint not null references employees(id),
  event_type         text not null check (event_type in ('IN','OUT')),
  event_at           timestamp not null,    -- KST 벽시계(타임존 없이 저장; 앱이 KST로 기록)
  server_received_at timestamp not null,
  device_id          text not null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_att_emp_time on attendance_events(employee_id, event_at);

-- V0.1은 익명 anon 키로 접근. 실매장 도입 전 RLS/권한을 반드시 강화하세요.
-- (개인정보인 주민번호·계좌는 이 스키마에 의도적으로 없음 — 급여계산에 불필요)
