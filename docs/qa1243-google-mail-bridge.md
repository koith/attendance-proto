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
