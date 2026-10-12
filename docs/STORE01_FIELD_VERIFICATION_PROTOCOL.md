# STORE-01 — 전국 지점 개통 실증 프로토콜

기준 2026-10-13, 운영 인하대학교점 보존. 기존 283개 지점 중 운영 1 / 준비 282. 새로운 실점주 계정과 공식 사업장 확인자료는 현재 0건이므로 임의 개통하지 않는다.

## A. 점주가 없어도 가능한 개발 단계 검증 — 자동 (구현·실행 가능)

1. `.github/workflows/hq-store-onboarding-postgres-integration.yml`에서 **실제 `hq_store_onboarding_set` 본문을 disposable PostgreSQL에 설치**한다. 별도 Auth 모의 사용자와 283개 합성 지점을 만들고 다음 시나리오를 실행한다.
   - HQ 아닌 사용자의 활성화 거부, 잘못된 상태 거부, 존재하지 않는 지점 거부
   - 공식 지점 증빙 미승인/반려 시 READY 거부
   - 샘플·데모 직원이 있는 지점의 READY 거부
   - 이메일 미확인·차단·삭제·익명 점주의 READY 거부
   - 올바른 실재확인·본인 이메일 인증·데모 0건일 때만 READY 성공
   - 타 지점 상태 불변, 인하대학교점 중지 거부, 중지 후 재활성화 조건 재검증
   - 283개 전체에서 자동으로 운영 활성화되는 지점 0곳
2. `qa_browser_app_smoke.mjs`의 모의 본사/점주 계정으로 모바일·데스크톱 전용 화면을 탐색한다. STAGED 경로 접근 거절, 이미 초대했지만 이메일 미확정 상태의 활성화 거부, 지점 변경/다른 지점 데이터 탐색 금지를 확인한다.
3. `node qa_hq_store_readiness_export_v1.mjs`로 모든 지점 준비 현황 CSV 및 공식 증빙, 이메일 인증 점주 수, 데모 직원 차단 원인을 확인한다. CSV 수식 주입도 거부한다.

**합성 QA가 통과하면 구현/격리 검증은 통과**지만, 합성 점주를 실제 운영 점주로 간주하지 않는다.

## B. 실제 운영의 비파괴 점검 — SQL 읽기 전용

실운영에서는 SELECT 이외 변경을 하지 않는다.

```sql
SELECT count(*) AS all_stores,
       count(*) FILTER (WHERE onboarding_status='READY') AS ready,
       count(*) FILTER (WHERE onboarding_status='STAGED') AS staged,
       count(*) FILTER (WHERE (onboarding_status='READY') IS DISTINCT FROM is_active) AS state_mismatches
FROM public.stores;
SELECT count(*) AS confirmed_manager_roles
FROM public.admin_users WHERE admin_role='STORE_MANAGER';
SELECT count(*) AS provenance_review_records
FROM public.store_provenance_reviews;

BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT count(*) AS visible_ready_stores FROM public.list_stores();
SELECT count(*) AS staged_employee_rows FROM public.list_employees_state(2);
SELECT has_function_privilege('anon','public.hq_store_onboarding_set(bigint,text)','EXECUTE') AS unauthenticated_can_activate;
ROLLBACK;
```

2026-10-13 운영 직접 확인: 전체 283 / READY 1 / STAGED 282 / 점주 0 / 검증 기록 0, anon 공개 READY 목록 1 / STAGED 2번 지점 직원 0 / 익명 개통 RPC 실행 권한 없음. 인증된 실점주 운영 접근 성공은 아직 확인할 수 없다.

## C. 실개통 확인 — 실제 지점 관리자에게 확인받을 단 하나의 표준 절차

1. 본사 HQ가 공식 지점 자료 URL/출처·담당 점주 이메일을 확인하고, 증빙을 `hq_store_provenance_review`로 기록한다. 증빙 없는 VERIFIED 입력 금지.
2. 점주에게 초대 메일을 발송하거나 기존 인증 Auth 계정을 연결한다. 이메일 인증이 끝나야 한다. Supabase Auth Redirect URL에 `https://koith.github.io/attendance-proto/owner_activation.html`이 허용됐는지 확인한다.
3. **검증된 실제 점주가 직접 로그인**하여 자기 지점의 직원·근태·급여·레시피·재고를 조회하고, 다른 지점 주소·RPC는 허가되지 않음을 확인한다.
4. 샘플 직원 0, 실제 자료 검증 완료, 점주 1명 이상임을 확인해 READY를 활성화한다. 샘플 데이터는 무단 삭제하거나 운영자료로 이름만 바꿔서는 안 된다.
5. 인하대학교점 원본·자동 시트·실급여는 건드리지 않고, 실제 두 번째 지점 이상에서 POS/출퇴근/급여 격리를 검증한 다음 개통 대상을 확대한다.

**판정:** 현재 A의 합성 자동 검증 및 B의 읽기 전용 운영 경계 검증을 수행할 수 있다. C의 실제 점주 로그인·인증과 사업장 자료 확인은 실제 확인자 없이는 대신할 수 없으며 이를 성공으로 조작하지 않는다.
