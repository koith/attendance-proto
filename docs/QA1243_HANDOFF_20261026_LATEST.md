# 백억커피 업무자동화 — QA1243 최신 개발 인수인계 (2026-10-26 KST)

> 원칙: 이 문서는 직전 개발 대화의 실제 결과를 다음 담당자에게 전달한다. 최신 GitHub main / Supabase 운영 DB / CI / Auth 로그를 **항상 다시 조회**하며, 정본 업무원장 `PROJECT_BACKLOG_20261017.md`를 보존한다.

## 최우선 사실

- **현재 운영:** 웹앱 `v0.362`, main `6838edb805ad3133e559a94e45d34c776ff77e54`. [PR #1387](https://github.com/koith/attendance-proto/pull/1387) (merge `98576d01`, v0.361)과 [PR #1389](https://github.com/koith/attendance-proto/pull/1389) (merge `6838edb`, v0.362) 병합 완료. Pages deploy 및 P0 gate SUCCESS, Supabase `server-sync-sheet` Edge **v71 ACTIVE**.
- **1호점 개통은 여전히 미완료:** Supabase 프로젝트 `waluhdgqhwjjwmflhrle`, store **80** / code `REAL_1` / 이름 `1호점`, `STAGED`, `is_active=false`. 기존 Auth 이메일 `webuielf@gmail.com`, UID `488139db-b765-4843-922d-481f7ca0bd3e`, 이메일 인증 상태 유지. 현재 `admin_users` 매핑 없음, `store_primary_owners` 지정 없음. **Auth 사용자/직원/근태/급여/레시피 원본을 삭제하지 않았다.**
- 기존 점주 재개통 대기 `public.store_owner_temp_first_logins` 1건 확인. 최근 조회 만료 `2026-10-27 10:01:25 UTC` = **10/27 19:01:25 KST**. 변경될 수 있으므로 다시 조회.
- **최신 메일 요청 근거:** v0.362 공개 앱 검증 후 [Actions #40319147638](https://github.com/koith/attendance-proto/actions/runs/40319147638)에서 `/auth/v1/recover` **HTTP 200**. Supabase `auth_logs`: **2026-10-26 11:59:48 UTC / `mail.send`**. 이것이 **20:59 KST 발송 처리** 근거다. *실제 Gmail 도착·링크 성공·비밀번호 저장은 아직 미확인*.
- 이전 실제 사용자가 보여준 이메일은 공식 영어 `Reset your password`; 링크를 누르면 `Email link is invalid or has expired` 화면 발생. auth_logs: **20:06 KST** `email link has expired`, **20:18 KST** `One-time token not found` (/verify 303). 동일한 낡은 링크, 메일 보안 스캐너의 GET 선방문, 여러 재발송 간 토큰 무효화 등은 가설일 뿐 **원인 확정 아님**.

## 사용자 실제 요구

본사는 **지점명과 점주 이메일만 입력**. 시스템이 정식 점주 개통 메일을 자동 발송하고, 점주는 링크에서 **본인 비밀번호를 설정**. 서버 검증 뒤 해당 지점에만 대표 권한을 부여. 기존 가입 이메일도 동일하게 재개통. 만료·재발송·중복·취소를 자동 처리. 지점마다 Resend 가입/SMTP 수동 설정/비밀번호 전달 요구 금지. 개통 이후 대표→보조 관리자 초대, 직원·근태·급여·Google Sheets 및 레시피 지점 격리 실증.

## 실제 구현·보존할 파일

- `index.html`: 운영 v0.362, HQ 캐시 `hq_store_onboarding_ui.js?v=20261026v362`.
- `hq_store_onboarding_ui.js`: 점주 초대 mode `issue_store_owner_temporary_password`, 결과 `AUTH_INVITE_ACCEPTED` (신규) / `AUTH_RECOVERY_ACCEPTED` (기존) 구분.
- `supabase/functions/server-sync-sheet/index.ts`와 `edge-release/supabase/functions/server-sync-sheet/index.ts`: 운영 Edge v71. 기존 사용자 공식 GoTrue recovery, 신규 사용자는 기본 `inviteUserByEmail`; 별도 Resend는 선택적 `OWNER_INVITE_USE_RESEND=true`.
- `owner_activation.html/.js`: 메일 콜백 및 **만료 링크에서 새 공식 인증 메일 재요청** 폼. `owner_temp_activation.html/.js`: 기존 사용자 본인확인→새 비밀번호 설정→`store_owner_temp_complete`→새 비밀번호 재로그인·`admin_context` 확인. 사용자 암호·인증 토큰을 로그/채팅에서 수집하지 말 것.
- 운영 적용된 SQL: `supabase/migrations/20261026094500_qa1243_owner_temp_first_login.sql` (`store_owner_temp_first_logins`, `service_store_owner_temp_issue`, `service_store_owner_temp_existing_lookup`, `store_owner_temp_preflight`, `store_owner_temp_complete`); `supabase/migrations/20261026115000_qa1243_native_owner_invite_after_password.sql` (`service_native_owner_invitation_issue`, `native_owner_invitation_preflight`, `native_owner_invitation_complete`).
- 신규 이메일은 Supabase 기본 Auth 초대: 처음엔 계정에 관리자 권한을 넣지 않고 pending intent만 만든 뒤, 이메일 본인 확인/비밀번호 확인 후 비로소 admin/owner 매핑. 기존 이메일은 Auth user 삭제·재생성하지 않고 recovery.
- 발송 일회성 워크플로 `.github/workflows/qa1243-owner-recovery-after-v0362-pages.yml`: v0.362 배포 검증 후 한 번만 작동. 다른 main 푸시로 이메일 무한 재발송 금지.

## QA 판독 (완료와 미완료 분리)

- v0.362 운영 Pages [#40318712330](https://github.com/koith/attendance-proto/actions/runs/40318712330): **Deploy GitHub Pages SUCCESS, P0 deployment gate SUCCESS**. 운영 Edge v71 ACTIVE 및 native deploy attest SUCCESS.
- 최신 main `6838edb`의 check runs **93건 = success 70 / skipped 15 / failure 8 / pending 0** (실조회 시점). 별개 실패 유형: `prelaunch-readiness` (여러 건), `verify-and-notify`, `Hosted Auth GET using existing repository credential`, `Trusted production Edge to a new independent GAS project and Sheets`, `Supabase shared-domain HTML rewrite diagnostic GET POST query`. P0/Pages/Edge PASS를 전체 CI PASS라고 보고하지 말고 장애 원인 분리·보완.
- `webuielf@gmail.com` Auth 계정의 **실제 개인 비밀번호 설정, 대표 관리자 로그인, 관리자/대표 매핑 및 READY 지점 개통은 여전히 미검증**. 영문 기본 인증 메일을 한국어 브랜드 메일로 변경하는 `AUTH-01`도 남음.

## 다음 개발자가 실제 수행할 순서

1. 최신 main, Issue [#1243](https://github.com/koith/attendance-proto/issues/1243), `PROJECT_BACKLOG_20261017.md`, PR #1387/#1389, Actions, 운영 Pages/Edge와 DB를 새로 조회. 이미 성공한 OAuth/Google E2E·메일 수신 UI 테스트를 무의미하게 반복하지 않는다.
2. store80/기존 Auth UID/대표·관리자 매핑/보존된 24시간 claim을 **읽기 전용**으로 확인. 20:59 이후의 가장 최신 공식 이메일이 Gmail에 도착해 링크가 정상 작동하는지 검증. **오래된 일회용 링크를 반복 클릭하거나 복구 메일을 연속 발송하지 않는다.**
3. 링크가 또 무효면 `auth_logs`의 /verify 오류와 재발송 시점, URL 리다이렉트, iPhone Safari와 Gmail 프리뷰 등 원인을 재현. 필요하면 Supabase 공식 `token_hash` + 사용자의 명시적 POST `verifyOtp` 또는 공식 OTP 패턴 검토. 인증 우회/직접 Auth DB 암호 수정 금지.
4. 점주 본인이 새 암호를 등록한 후 `store_owner_temp_complete` 성공, Auth 재로그인, `admin_context(role=STORE_MANAGER,store_id=80)`, `store_primary_owners` 및 `admin_users` DB 확인. **대표 권한 활성화와 지점 READY 개통은 별개**임에 유의, HQ 승인/정식 경로로 `STAGED→READY`까지 검증.
5. 신규 지점 가상/승인된 실계정에서 신규·기존 이메일, 중복/취소/만료/재초대, 권한 미승격, 보조 관리자, 직원·근태/급여/시트·레시피 격리 E2E. 데이터 오염 없이 자동 QA 실시.
6. main의 독립 실패 CI 8건 원인 확인→수정/QA. 외부 서비스 차단은 정확한 근거를 이슈에 남기고 다음 미완료 개발 업무 처리. 부분 성공을 전체 완료로 표시하지 않는다.
7. 통합 원장 마지막 명시 집계 **총38 / 완료19 / 잔여19**를 최신 검증 결과로 다시 분류. 원장 최근 분류: 개통 전 7(`QA-04/05/06/07, SEC-01, AUTH-01, MTG-03`), 실제 본인확인·현장승인 2(`FIELD-01, MTG-04`), 개통 이후 10(`FIELD-02/03, MTG-05/06/07/08/11/12/13/16`). 개발 미완료와 실인원/실자료 검증대기를 절대 혼동하지 않는다.

## 보고/안전/완료 정의

**개통 완료라 보고할 조건:** 실제 메일 수신→유효한 링크→개인 비밀번호 설정→동일 계정 재로그인→서버 STORE_MANAGER/해당 store_id 증명→대표 매핑 확인→READY 전환/로그인 검증. 사용자 직접 승인이 필요한 마지막 단계만 요청한다.

운영 인하대점/HQ 3계정/기존 근태·급여·레시피·Google Sheets 및 백억커피 운영 데이터 삭제/변조 금지. 배포 전에는 P0 QA, 병합 후 동일 SHA의 Pages·Edge 검증, 실제 역할·매장 격리 readback 필수. 비밀키, 인증 토큰, 비밀번호는 절대 문서·로그에 기록하지 않는다.

**최종 판정: 코드 v0.362 및 Edge v71 배포 완료 / Auth 메일 발송 처리 성공 / 1호점 실인증·실개통 미완료.**
