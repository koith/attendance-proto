-- ============================================================================
-- 백억커피 #16 근로계약서 첨부 (schema_v11, 단일 실행)
-- 목적: 관리자가 직원별 계약서 파일 첨부/목록/열람. 교체해도 기존 보존. POS/PIN 불가.
-- 범위: 최소. EmploymentPeriod/Contract/WorkSchedule/멀티스토어/범용DMS/전자서명/OCR 없음.
-- authorization: is_admin() (S1). authenticated != admin. 브라우저 direct table 접근 불가.
-- 실행: SQL Editor 1회, 전체 선택 후 Run. begin~commit (부분성공 방지).
-- 기존 operational data(employees/attendance/payroll/correction) UPDATE/DELETE 없음.
-- ============================================================================

begin;

-- [1] employee_documents (metadata. 파일은 Storage. 교체=새 row, 삭제 없음)
create table if not exists public.employee_documents (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id),
  storage_path  text not null unique,          -- Storage object 경로 (canonical)
  filename      text not null,
  content_type  text,
  byte_size     integer,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now()
);
create index if not exists idx_empdoc_emp on public.employee_documents(employee_id, uploaded_at desc);

-- [2] RLS enable. direct policy 없음 → PostgREST direct 접근 전면 차단.
--     (anon/authenticated/POS/PIN 모두 테이블 직접 SELECT/INSERT 불가)
--     접근은 오직 SECURITY DEFINER RPC(admin_doc_list/add) 경유.
alter table public.employee_documents enable row level security;

-- [3] admin_doc_list: 직원별 계약서 목록 (is_admin gate)
create or replace function public.admin_doc_list(p_employee_id bigint)
 returns table(id bigint, filename text, content_type text, byte_size integer,
               storage_path text, uploaded_by text, uploaded_at timestamptz)
 language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  return query
    select d.id, d.filename, d.content_type, d.byte_size, d.storage_path, d.uploaded_by, d.uploaded_at
    from public.employee_documents d
    where d.employee_id = p_employee_id
    order by d.uploaded_at desc;
end; $function$;

-- [4] admin_doc_add: metadata 등록 (is_admin gate + 검증)
--     검증: employee 존재 / storage_path가 해당 employee_id prefix / 필수값 / 형식·크기
create or replace function public.admin_doc_add(
    p_employee_id bigint, p_storage_path text, p_filename text,
    p_content_type text, p_byte_size integer)
 returns json language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
declare v_id bigint; v_actor text;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  -- employee 실재 확인
  if not exists (select 1 from public.employees e where e.id = p_employee_id) then
    return json_build_object('ok',false,'error','EMPLOYEE_NOT_FOUND');
  end if;
  -- path가 해당 employee_id prefix("{id}/...") 사용하는지 (엉뚱한 직원에 연결 방지)
  if p_storage_path is null
     or split_part(p_storage_path,'/',1) <> p_employee_id::text
     or position('/' in p_storage_path) = 0 then
    return json_build_object('ok',false,'error','PATH_PREFIX_MISMATCH');
  end if;
  -- 필수/형식/크기 검증
  if p_filename is null or length(trim(p_filename))=0 then
    return json_build_object('ok',false,'error','FILENAME_REQUIRED');
  end if;
  if p_content_type not in ('application/pdf','image/jpeg','image/png') then
    return json_build_object('ok',false,'error','UNSUPPORTED_TYPE');
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then  -- 10MB
    return json_build_object('ok',false,'error','SIZE_INVALID');
  end if;
  insert into public.employee_documents(employee_id,storage_path,filename,content_type,byte_size,uploaded_by)
    values (p_employee_id,p_storage_path,p_filename,p_content_type,p_byte_size,v_actor)
    returning id into v_id;
  return json_build_object('ok',true,'id',v_id);
end; $function$;

-- [5] RPC ACL: PUBLIC/anon revoke, authenticated grant (내부 is_admin이 실제 경계)
revoke execute on function public.admin_doc_list(bigint) from public, anon;
grant  execute on function public.admin_doc_list(bigint) to authenticated;
revoke execute on function public.admin_doc_add(bigint,text,text,text,integer) from public, anon;
grant  execute on function public.admin_doc_add(bigint,text,text,text,integer) to authenticated;

-- [6] private bucket employee-docs (public=false, 형식/크기 제한)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-docs','employee-docs', false, 10485760,
        array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- [7] storage.objects policy: employee-docs 대상 SELECT/INSERT만, is_admin() 조건
--     (다운로드=SELECT, 업로드=INSERT). UPDATE/DELETE policy 없음 → 삭제/덮어쓰기 불가.
--     authenticated 전체 허용 아님 — is_admin() 통과자만.
drop policy if exists empdoc_admin_select on storage.objects;
create policy empdoc_admin_select on storage.objects
  for select to authenticated
  using ( bucket_id = 'employee-docs' and public.is_admin() );

drop policy if exists empdoc_admin_insert on storage.objects;
create policy empdoc_admin_insert on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'employee-docs' and public.is_admin() );

commit;
