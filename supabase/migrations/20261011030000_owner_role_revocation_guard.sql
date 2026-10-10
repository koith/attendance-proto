-- Prevent generic HQ revoke from bypassing ready-store owner protection.
CREATE OR REPLACE FUNCTION public.admin_grant(p_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid; v_cnt int; v_norm text;
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  perform pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  v_norm := lower(trim(p_email));
  select count(*) into v_cnt from auth.users where lower(trim(email))=v_norm;
  if v_cnt = 0 then return json_build_object('ok',false,'error','AUTH_USER_NOT_FOUND'); end if;
  if v_cnt > 1 then return json_build_object('ok',false,'error','AUTH_USER_AMBIGUOUS'); end if;
  select id into v_uid from auth.users where lower(trim(email))=v_norm;
  -- 이미 관리자면 명시적으로 알림 (앱 결과 정확성)
  if exists (select 1 from public.admin_users where user_id=v_uid) then
    return json_build_object('ok',false,'error','ALREADY_ADMIN','user_id',v_uid);
  end if;
  insert into public.admin_users(user_id,email,note)
    values (v_uid, v_norm, 'granted by '||coalesce(auth.jwt()->>'email','admin'));
  return json_build_object('ok',true,'user_id',v_uid);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_revoke(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_total int; v_deleted int;
begin
  IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  -- 1) 자기 자신 해제 금지
  if p_user_id = auth.uid() then
    return json_build_object('ok',false,'error','CANNOT_REVOKE_SELF');
  end if;
  -- 2) grant와 동일 키로 직렬화 (count/delete race 방지)
  perform pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
  -- 3) 대상이 실제 관리자인지 확인
  if not exists (select 1 from public.admin_users where user_id=p_user_id) then
    return json_build_object('ok',false,'error','ADMIN_NOT_FOUND');
  end if;
  -- Store managers are managed only through hq_store_manager_revoke,
  -- which protects the last owner of an active store.
  if exists(select 1 from public.admin_users where user_id=p_user_id and admin_role='STORE_MANAGER') then
    return json_build_object('ok',false,'error','USE_STORE_MANAGER_REVOKE');
  end if;
  -- 4) 마지막 관리자 lockout 방지
  select count(*) into v_total from public.admin_users where admin_role='HQ';
  if v_total <= 1 then
    return json_build_object('ok',false,'error','CANNOT_REMOVE_LAST_ADMIN');
  end if;
  -- 5) 실제 삭제 + 삭제 행 수 검증
  delete from public.admin_users where user_id=p_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    -- 락 안에서 존재확인했으므로 정상적으론 도달 불가. 방어적 처리.
    raise exception 'REVOKE_UNEXPECTED_ROWCOUNT: %', v_deleted;
  end if;
  return json_build_object('ok',true,'removed',p_user_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.hq_store_manager_assign(p_email text, p_store_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid;v_existing_role text;v_existing_store bigint;v_email text;
BEGIN
 IF NOT public.is_hq_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
 v_email:=lower(btrim(coalesce(p_email,'')));
 IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR length(v_email)>254
 THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND onboarding_status<>'SUSPENDED')
 THEN RAISE EXCEPTION 'STORE_NOT_ELIGIBLE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_users_mutation',0));
 SELECT u.id INTO v_uid FROM auth.users u
 WHERE lower(btrim(u.email))=v_email AND u.email_confirmed_at IS NOT NULL;
 IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','AUTH_USER_NOT_FOUND'); END IF;
 SELECT a.admin_role,a.store_id INTO v_existing_role,v_existing_store
 FROM public.admin_users a WHERE a.user_id=v_uid;
 IF v_existing_role='HQ' THEN RAISE EXCEPTION 'CANNOT_DOWNGRADE_HQ'; END IF;
 IF v_existing_role IS NOT NULL AND
    (v_existing_role<>'STORE_MANAGER' OR v_existing_store IS DISTINCT FROM p_store_id)
 THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_ASSIGNED'; END IF;
 IF v_existing_role IS NULL THEN
  INSERT INTO public.admin_users(user_id,email,note,admin_role,store_id)
  VALUES(v_uid,v_email,'Store manager assigned by HQ','STORE_MANAGER',p_store_id);
 END IF;
 RETURN jsonb_build_object('ok',true,'user_id',v_uid,'store_id',p_store_id,'role','STORE_MANAGER',
                           'already_assigned',v_existing_role='STORE_MANAGER');
END $function$;

