-- ============================================================
-- M4: 종이 없애기 — 수정이력(감사로그) + 직원 정정요청 + 관리자 승인
-- 원칙: attendance_events(원본)는 절대 수정/삭제하지 않는다.
--       보정은 event_corrections에 누적, 계산은 원본+최신보정 반영.
-- Supabase SQL Editor에 전체 붙여넣고 Run.
-- ============================================================

-- 1) 이벤트 보정 이력 (관리자 수정의 감사로그)
--    한 이벤트에 여러 번 보정 가능, 최신 것이 유효. 원본은 그대로 보존.
create table if not exists event_corrections (
  id             bigint generated always as identity primary key,
  event_id       bigint references attendance_events(id),  -- 기존 이벤트 보정 시
  employee_id    bigint not null references employees(id),
  action         text not null check (action in ('EDIT_TIME','EDIT_TYPE','VOID','ADD')),
  -- EDIT_TIME: 시각 변경, EDIT_TYPE: IN/OUT 변경, VOID: 무효화, ADD: 누락분 신규 추가
  new_event_at   timestamp,        -- EDIT_TIME/ADD일 때
  new_event_type text check (new_event_type in ('IN','OUT')),  -- EDIT_TYPE/ADD일 때
  reason         text,             -- 사유
  created_by     text,             -- 수정자(관리자 이메일 등)
  created_at     timestamptz not null default now()
);
create index if not exists idx_corr_emp on event_corrections(employee_id, created_at);
create index if not exists idx_corr_event on event_corrections(event_id);

-- 2) 직원 정정요청
create table if not exists correction_requests (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references employees(id),
  event_id       bigint references attendance_events(id),  -- 기존 기록 정정이면
  kind           text not null check (kind in ('MISSING_OUT','MISSING_IN','WRONG_TIME','OTHER')),
  requested_at   timestamp,        -- 직원이 주장하는 올바른 시각
  requested_type text check (requested_type in ('IN','OUT')),
  note           text,             -- 직원 사유
  status         text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  resolved_by    text,
  resolved_at    timestamptz,
  reject_reason  text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_req_status on correction_requests(status, created_at);
create index if not exists idx_req_emp on correction_requests(employee_id);

alter table event_corrections enable row level security;
alter table correction_requests enable row level security;

-- ============================================================
-- 3) 직원(POS, anon): 본인 기록 조회 — 비밀번호로 본인 확인
-- ============================================================
create or replace function my_events(p_employee_id bigint, p_pin text, p_from timestamp, p_to timestamp)
returns json
language plpgsql security definer set search_path=public as $$
declare v_hash text;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  return json_build_object('ok',true,'events',
    coalesce((select json_agg(row_to_json(t)) from (
      select e.id, e.event_type, e.event_at
      from attendance_events e
      where e.employee_id=p_employee_id and e.event_at>=p_from and e.event_at<p_to
      order by e.event_at
    ) t),'[]'::json),
    'requests',
    coalesce((select json_agg(row_to_json(r)) from (
      select id, kind, requested_at, requested_type, note, status, created_at
      from correction_requests
      where employee_id=p_employee_id and created_at > now() - interval '60 days'
      order by created_at desc
    ) r),'[]'::json)
  );
end;
$$;

-- ============================================================
-- 4) 직원(POS, anon): 정정요청 제출 — 비밀번호로 본인 확인
-- ============================================================
create or replace function request_correction(
  p_employee_id bigint, p_pin text, p_kind text,
  p_event_id bigint, p_requested_at timestamp, p_requested_type text, p_note text)
returns json
language plpgsql security definer set search_path=public as $$
declare v_hash text; v_id bigint;
begin
  select pin_bcrypt into v_hash from employees where id=p_employee_id and is_active=true;
  if v_hash is null then return json_build_object('ok',false,'error','NO_EMPLOYEE'); end if;
  if crypt(p_pin, v_hash) <> v_hash then return json_build_object('ok',false,'error','BAD_PIN'); end if;
  insert into correction_requests(employee_id,event_id,kind,requested_at,requested_type,note)
    values (p_employee_id,p_event_id,p_kind,p_requested_at,p_requested_type,p_note)
    returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end;
$$;

-- ============================================================
-- 5) 관리자(authenticated): 대기 중 정정요청 목록
-- ============================================================
create or replace function admin_pending_requests()
returns table(id bigint, employee_id bigint, employee_name text, kind text,
              requested_at timestamp, requested_type text, note text, event_id bigint, created_at timestamptz)
language sql security definer set search_path=public as $$
  select r.id, r.employee_id, e.name, r.kind, r.requested_at, r.requested_type, r.note, r.event_id, r.created_at
  from correction_requests r join employees e on e.id=r.employee_id
  where r.status='PENDING' order by r.created_at;
$$;

-- ============================================================
-- 6) 관리자(authenticated): 근태 직접 수정/추가/무효 — 원본 보존, 보정 누적
-- ============================================================
create or replace function admin_correct_event(
  p_action text, p_event_id bigint, p_employee_id bigint,
  p_new_at timestamp, p_new_type text, p_reason text)
returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_actor text;
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
    values (p_event_id,p_employee_id,p_action,p_new_at,p_new_type,p_reason,v_actor)
    returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- 7) 관리자(authenticated): 정정요청 승인/반려
--    승인 시 event_corrections에 보정 생성(원본 불변)
-- ============================================================
create or replace function admin_resolve_request(p_request_id bigint, p_approve boolean, p_reject_reason text)
returns json
language plpgsql security definer set search_path=public as $$
declare r correction_requests%rowtype; v_actor text; v_action text;
begin
  if auth.role() <> 'authenticated' then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  select * into r from correction_requests where id=p_request_id and status='PENDING';
  if not found then return json_build_object('ok',false,'error','NOT_FOUND_OR_RESOLVED'); end if;

  if p_approve then
    -- 요청 종류 → 보정 액션 매핑
    if r.kind='MISSING_OUT' or r.kind='MISSING_IN' then v_action:='ADD';
    elsif r.kind='WRONG_TIME' then v_action:='EDIT_TIME';
    else v_action:='EDIT_TIME'; end if;
    insert into event_corrections(event_id,employee_id,action,new_event_at,new_event_type,reason,created_by)
      values (r.event_id, r.employee_id, v_action, r.requested_at,
              coalesce(r.requested_type, case when r.kind='MISSING_OUT' then 'OUT' when r.kind='MISSING_IN' then 'IN' else null end),
              '직원 정정요청 승인: '||coalesce(r.note,''), v_actor);
    update correction_requests set status='APPROVED', resolved_by=v_actor, resolved_at=now() where id=p_request_id;
    return json_build_object('ok',true,'status','APPROVED');
  else
    update correction_requests set status='REJECTED', resolved_by=v_actor, resolved_at=now(), reject_reason=p_reject_reason where id=p_request_id;
    return json_build_object('ok',true,'status','REJECTED');
  end if;
end;
$$;

-- ============================================================
-- 8) 관리자(authenticated): 기간 이벤트 + 보정 함께 조회
--    앱이 원본+보정을 합쳐 유효값을 계산
-- ============================================================
create or replace function admin_events_with_corrections(p_from timestamp, p_to timestamp)
returns json
language sql security definer set search_path=public as $$
  select json_build_object(
    'events', coalesce((select json_agg(row_to_json(e)) from (
      select id, employee_id, event_type, event_at from attendance_events
      where event_at>=p_from and event_at<p_to order by employee_id, event_at) e),'[]'::json),
    'corrections', coalesce((select json_agg(row_to_json(c)) from (
      select id, event_id, employee_id, action, new_event_at, new_event_type, reason, created_by, created_at
      from event_corrections
      where created_at >= p_from - interval '90 days') c),'[]'::json)
  );
$$;

-- ============================================================
-- 9) 권한
-- ============================================================
grant execute on function my_events(bigint,text,timestamp,timestamp) to anon, authenticated;
grant execute on function request_correction(bigint,text,text,bigint,timestamp,text,text) to anon, authenticated;
grant execute on function admin_pending_requests() to authenticated;
grant execute on function admin_correct_event(text,bigint,bigint,timestamp,text,text) to authenticated;
grant execute on function admin_resolve_request(bigint,boolean,text) to authenticated;
grant execute on function admin_events_with_corrections(timestamp,timestamp) to authenticated;
