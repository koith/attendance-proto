-- ============================================================================
-- 백억커피 schema_v12: 계약서 오첨부 정정용 삭제 (제한적)
-- 정책: 오첨부 즉시 정정만 허용 — "본인이 최근 24시간 내 올린 것"만 삭제 가능.
--       예전 계약서/타인 업로드는 삭제 불가(보존 원칙 유지).
-- 실행: SQL Editor 1회, 전체 선택 후 Run. begin~commit.
-- 기존 operational data(employees/attendance/payroll/correction) 변경 없음.
-- ============================================================================

begin;

-- [1] admin_doc_delete: metadata 삭제 (is_admin + 최근24h 본인 업로드만)
--     반환된 storage_path로 앱이 Storage object를 삭제(2단계). RPC는 metadata만.
create or replace function public.admin_doc_delete(p_document_id bigint)
 returns json language plpgsql security definer
 set search_path to 'public','pg_temp'
as $function$
declare v_row public.employee_documents%rowtype; v_actor text;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  v_actor := coalesce(auth.jwt()->>'email','admin');
  select * into v_row from public.employee_documents where id = p_document_id;
  if not found then return json_build_object('ok',false,'error','DOC_NOT_FOUND'); end if;
  -- 오첨부 정정 제한: 본인 업로드 + 최근 24시간
  if v_row.uploaded_by_email is distinct from v_actor then
    return json_build_object('ok',false,'error','NOT_OWN_UPLOAD');
  end if;
  if v_row.uploaded_at < now() - interval '24 hours' then
    return json_build_object('ok',false,'error','TOO_OLD_TO_DELETE');
  end if;
  delete from public.employee_documents where id = p_document_id;
  -- 앱이 이 path로 Storage object 삭제
  return json_build_object('ok',true,'storage_path',v_row.storage_path);
end; $function$;

revoke execute on function public.admin_doc_delete(bigint) from public, anon;
grant  execute on function public.admin_doc_delete(bigint) to authenticated;

-- [2] Storage objects DELETE policy: employee-docs, is_admin()만.
--     (schema_v11에선 delete policy 없어 삭제 불가였음 → 오첨부 정정 위해 admin-only 추가)
drop policy if exists empdoc_admin_delete on storage.objects;
create policy empdoc_admin_delete on storage.objects
  for delete to authenticated
  using ( bucket_id = 'employee-docs' and public.is_admin() );

commit;
