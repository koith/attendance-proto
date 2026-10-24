# QA1243 — 기존 Google MailApp 기반 Supabase Send Email Hook (격리 PoC)

**상태: CODE_VERIFIED 후보 / 운영 Auth Hook OFF / 실제 발송 미검증 / 신규 지점 개통 NO_GO.**

## 구조
- Supabase Send Email Hook → 전용 `qa1243-google-mail-bridge` Edge (표준 웹훅 서명·5분 유효기간 검증) → HMAC 서명된 최소 전송 정보 → 별도 Google Apps Script 웹앱 (`gas/qa1243-auth-mail/Code.gs`) → `MailApp.sendEmail`.
- 운영 `apps_script.gs`(근태·급여·시트 동기화), 운영 시트·권한·데이터는 **수정하거나 재사용하지 않는다**. Supabase Send Email Hook을 활성화하면 기본 SMTP 대신 이 경로로 *모든* Auth 메일이 전송되므로 가입·재설정·매직링크·이메일 변경도 검증해야 한다.
- 초대 HTML은 정본 `supabase/email-templates/invite.html`을 복제한 `invite_template.mjs`; 테스트가 원본과 정확한 동일성을 검증한다. 초대 링크 1개만 서버에서 채운다.
- 위조 요청·5분 이후 재사용·잘못된 이동 URL·토큰·이메일 형태를 거부한다. GAS는 HMAC·메일 쿼터·스크립트 잠금·10분 캐시 중복 방어를 사용한다. 캐시는 best-effort이므로 정확히 한 번 배달 보장은 아니다.

## 합성 QA
`node --test qa/qa1243_google_mail_bridge.test.mjs`

## 운영 활성화 전 안전 게이트
1. **기존 Sheets 프로젝트와 분리된** 새로운 Google Apps Script 프로젝트에 `gas/qa1243-auth-mail/Code.gs` 및 `appsscript.json`을 등록한다. 발신 Google 계정의 `script.send_mail` OAuth 동의와 개인 메일주소 노출 여부 확인이 필요하다. 메일을 임의 사용자에게 발송하지 않는다.
2. 별도 GAS 스크립트 속성 `QA1243_GMAIL_BRIDGE_SECRET` (최소 32자 랜덤)을 설정하고 Edge 비밀 환경변수에 같은 값을 저장한다. GitHub/채팅/로그에는 비밀번호·secret을 보관하지 않는다.
3. 해당 GAS를 `executeAs=USER_DEPLOYING`, `access=ANYONE_ANONYMOUS`으로 배포한다. URL은 `https://script.google.com/macros/s/<ID>/exec`만 허용하며, HMAC이 일치하지 않으면 발송하지 않는다. 발신자/수신 테스트 동의 후 격리 수신자에게 우선 테스트.
4. Edge Function `qa1243-google-mail-bridge`를 배포한다. 필요한 환경변수: `QA1243_SEND_EMAIL_HOOK_SECRET` (Supabase의 `v1,whsec_...`), `QA1243_GMAIL_BRIDGE_SECRET`, `QA1243_GMAIL_BRIDGE_URL`, `QA1243_GMAIL_BRIDGE_ENABLED=true`. 토큰 없이 기본적으로 비활성화. Supabase HTTP hook 호출은 JWT가 아니라 웹훅 서명 검증이므로 **이 함수에 한해** verify_jwt=false를 사용한다. Edge 배포만으로 운영 Auth hook은 켜지지 않는다.
5. 충분한 QA 및 **운영 변경 승인** 후에만 Supabase Auth Hooks → Send Email에서 이 Edge를 활성화한다. 기본 이메일 경로를 즉시 대체하므로 이메일 변경(현재·새 계정 둘 다), 초대·비밀번호 재설정·로그인과 실수신을 모두 점검한다. 문제 발생 시 Hook OFF가 긴급 복구이나 기본 SMTP의 제한 때문에 운영 개통 성공을 의미하지 않는다.
6. 링크는 `https://waluhdgqhwjjwmflhrle.supabase.co/auth/v1/verify?token=...&type=invite&redirect_to=...`이며 리다이렉트는 앱 루트와 `owner_activation.html`만 허용한다. 새 리다이렉트를 임의 허용하지 않는다.
7. 실운영 대표·보조 초대/수락/비밀번호/로그인/권한·재전송, 실제 수신자 승인, 운영 데이터 불변 및 개통 최종 게이트 검증까지 **NO_GO 유지**.

공식 문서: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook · https://developers.google.com/apps-script/reference/mail/mail-app .

## 2026-10-24 독립 GAS 자동 프로비저닝 단계

- `.github/workflows/qa1243-google-mail-bridge.yml`은 PR에서 기존 합성 QA만 실행한다. 운영 전환 작업을 포함하지 않는다.
- 해당 워크플로가 main에 `[QA1243-NO-OPERATING-WRITE]` 및 `[QA1243-MAIL-GAS-DEPLOY]` 표시로 병합된 경우에만, 합성 QA 성공 후 **독립 Google Apps Script 소스 생성·읽기 검증·버전 배포** 작업을 시도한다.
- 기존 격리 Google OAuth GitHub Secrets 3종을 재사용한다. 발신 계정은 `webuielf@gmail.com`으로 고정하며, OAuth scope는 기존 읽기·Apps Script 관리 5종에서 확대하지 않는다.
- 독립 프로젝트 이름은 `QA1243 isolated Auth MailApp 2026-10-24`이다. 같은 이름을 먼저 검색하여 1개면 소유자/원격 소스 확인 후 재사용하고, 2개 이상이거나 코드가 다르면 중단한다. 운영 Sheets/GAS 프로젝트는 절대 수정하지 않는다.
- 배포 결과에는 스크립트 ID·배포 ID·소스 SHA256·웹앱 배포 메타데이터만 기록한다. 비밀키·OAuth 액세스 토큰·메일 수신자·본문은 로그에 기록하지 않는다.
- **이 단계는 실제 메일 발송이 아니다.** GAS `QA1243_GMAIL_BRIDGE_SECRET` Script Properties 설정과 MailApp 소유자 동의, Edge Secrets/URL 설정, 격리 메일 E2E 및 Auth Hook 전환은 완료라고 판정하지 않는다.
- 실발송 성공·운영 Auth Hook 전환은 별도의 안전 승인/검증 게이트다. 운영 Auth Hook은 계속 OFF, 신규 지점 개통은 NO_GO로 유지한다.


## 2026-10-24 비발송 연결 검증 구현 (PR #1361 후속)

- 기존 Script/Deployment/공유 키는 그대로 유지한다. `data.operation=connectivity` 한 필드만 허용하고 기존 HMAC·5분 유효기간·잠금·10분 캐시를 적용한다. MailApp와 쿼터에는 접근하지 않는다. `mailSent:false`는 비발송 처리의 영수증이며 실제 메일 성공 증거가 아니다.
- 격리 Edge `/connectivity`는 GitHub OIDC의 서명/issuer/audience/repository/정확한 workflow/main 또는 승인된 PR1361을 검증한다. 수신자나 메일 본문을 입력받지 않으며 기존 Edge Secret을 내부에서만 사용한다. Auth Hook 활성화 플래그와 독립된 QA 경로이고 운영 Hook은 OFF를 유지한다.
- 실제 순서: 잘못된 JSON → BAD_JSON, 잘못된 HMAC → UNAUTHORIZED, 정상 비발송 서명 → 최초 처리, 같은 서명 재전송 → 중복 처리 차단. 하나라도 실패하면 중단하고 FAIL이다. 실서버 성공을 합성 테스트로 대체하지 않는다.
- ContentService의 302/303은 지정된 `script.googleusercontent.com/macros/echo`로 GET한다. 서명 POST·인증 헤더는 넘기지 않고 리디렉션 query는 출력하지 않는다. 다른 host/경로 및 307/308은 거부한다.
- 관측된 실서버 응답: 첫 `script.google.com` 요청에서 HTTP403, HTML `Access Denied`/`You need access`, 리디렉션0. 코드 런타임 전 Google 접근 거절이며 SMTP/HMAC/JSON 파서 장애로 단정하지 않는다. 소유자 OAuth 미승인과의 인과 확정은 승인 후 실통신 성공까지 필요하다.
- API 재사용 시도: 기존 provision job 재실행 #40049753672, job120794530695는 `QA1243_MAIL_GAS_EPHEMERAL_TOKEN_EXPIRED_OR_INVALID`로 원격 변경 전에 실패. QA client ID/secret/refresh 3종이 해당 job에 없었다. 공유 HMAC 키는 재생성하거나 출력하지 않았다.
- 현재 코드 QA 통과와 실제 배포·GAS 통신 PASS는 별개다. PR1361의 실서버 체크가 실패한 동안 병합/1번 일감 완료를 선언하지 않는다.


### 기존 배포 갱신 실행 경로

`qa1243_repair_mail_gas.mjs`는 승인된 기존 소스 SHA256 `79ff2a94ddc61cb1c21b48961a4e739df2a768989d305138ed3430f57dcf1fc7` 또는 현재 대상 소스만 수용한다. owner·Script ID·Deployment ID·URL·익명/실행주체·현재 버전 소스를 모두 읽은 뒤에만 QA 소스를 PUT한다. 새 버전의 소스와 기존 배포 PUT 결과를 다시 읽는다. Script Properties/공유 키와 운영 GAS/Sheets는 접근하지 않는다. 소스·권한 drift 또는 쓰기/재조회 실패 시 성공을 보고하거나 같은 쓰기를 자동 반복하지 않는다.

유효한 기존 QA 관리 인증이 연결된 후 실행할 명령은 `gh workflow run qa1243-google-mail-bridge.yml --ref qa1243/probe-pr-merge-gate -f provision=true --repo koith/attendance-proto`이다. 승인된 기존 PR 브랜치의 명시적 수동 실행만 추가 허용하며, PR 이벤트가 OAuth 비밀을 사용하는 배포를 자동 실행하지 않는다. 인증정보 원문을 채팅/로그로 전달하지 않는다. 이후 PR1361의 실패한 통신 job만 다시 실행하여 실제 GAS/Edge 경로를 확인한다.

독립 코드 QA: 기존 메일+비발송 회귀17 / 연결·OIDC·리디렉션8 / 기존 배포 갱신·drift·실패7 = **32/32 PASS**. 원격 API/메일 성공과 구분한다. [첫 후속 CI40070409616](https://github.com/koith/attendance-proto/actions/runs/40070409616)는 합성 job PASS, 실제 GAS POST job FAIL이다.
