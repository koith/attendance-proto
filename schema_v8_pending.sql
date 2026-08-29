-- ============================================================
-- P0-2: 정정요청 승인 화면 개선
-- admin_pending_requests가 "수정 전" 원본 이벤트 시각/타입도 반환하도록 확장.
-- (기존 반환 컬럼 + orig_event_at, orig_event_type 추가 → DROP 후 재생성)
-- Supabase SQL Editor에서 실행 (Run without RLS 눌러도 됨).
-- ============================================================

drop function if exists admin_pending_requests();

create function admin_pending_requests()
returns table(id bigint, employee_id bigint, employee_name text, kind text,
              requested_at timestamp, requested_type text, note text, event_id bigint,
              orig_event_at timestamp, orig_event_type text, created_at timestamptz)
language sql security definer set search_path=public as $$
  select r.id, r.employee_id, e.name, r.kind, r.requested_at, r.requested_type, r.note, r.event_id,
         ev.event_at as orig_event_at, ev.event_type as orig_event_type, r.created_at
  from correction_requests r
  join employees e on e.id=r.employee_id
  left join attendance_events ev on ev.id=r.event_id
  where r.status='PENDING' order by r.created_at;
$$;

grant execute on function admin_pending_requests() to authenticated;
