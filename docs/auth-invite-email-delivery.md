# 백억커피 운영 Supabase 초대 메일 — 한글 템플릿 및 도달률 (#918)

## 기존 문제와 검증된 근거

2026-10-14 13:42 KST, 인하대학교점 `dokodemoitsh@naver.com` 에 대한 Supabase Auth 기본 초대 메일의 영문 제목은 `You've been invited`이며, 영문 본문에 `Accept invitation` 링크가 표시되었다. 첨부 화면의 네이버 메일 스팸 사유는 **언어별 스팸 분류 설정(영어)**이다.

문구의 한국어 변경은 해당 영어 분류 사유를 줄이는 조치이다. 그러나 **받은편지함 도달 보장은 아니다**. 발신자 평판, 수신자 필터, 도메인 인증은 별도 문제다.

## 구현 산출물

- [한글·반응형 HTML](../supabase/email-templates/invite.html): 이메일 본문(메일 클라이언트 호환 인라인 CSS, 외부 이미지·스크립트 없음).
- 제목: `[백억커피] 매장 관리자 계정 초대 안내`
- Supabase 원래 사용 링크 `{{ .ConfirmationURL }}` 단 하나만 그대로 사용, 인증/로그인 우회 금지.
- 미인증 관리자·대표 관리자 구분: **초대 링크 확인 및 비밀번호 설정 후**, 필요시 **본사 담당자가 대표 별도 지정**. 초대=자동 대표 승격이 아님.
- [배포 스크립트](../scripts/apply_supabase_invite_email.mjs)와 [워크플로](../.github/workflows/auth-invitation-template.yml): `SUPABASE_ACCESS_TOKEN` 이 GitHub Actions secrets에 있을 때만 운영 Auth 설정을 PATCH하고 GET으로 원격 본문·제목을 대조.

## 실제 운영 Auth 이메일에 적용하는 방법

`supabase/email-templates/invite.html`을 GitHub Pages에 공개하거나 Supabase DB에서 수정하는 것 **만으로는** 초대 메일이 바뀌지 않는다. Hosted Auth mailer 설정에 별도로 저장해야 한다.

**자동 경로**: GitHub Actions secret `SUPABASE_ACCESS_TOKEN`을 프로젝트 운영 설정 쓰기 권한(`auth_config_write`, `project_admin_write` 등 유효한 관리 권한)이 있는 Supabase Management API 계정 토큰으로 설정하면, main 브랜치 메일 템플릿 변경 시 `auth-invitation-template.yml`가 `/v1/projects/waluhdgqhwjjwmflhrle/config/auth`에 *제목+본문만* 적용한다. 토큰은 커밋·로그·본문에 넣지 않는다. 토큰이 없으면 워크플로가 `PENDING_AUTH_WRITE_ACCESS`를 명시하고 실제 적용을 주장하지 않는다.

**대시보드 경로(토큰이 없어도 가능)**: [운영 Supabase Auth Templates](https://supabase.com/dashboard/project/waluhdgqhwjjwmflhrle/auth/templates) → **Invite User** → **Subject**에 위 제목 → **Message body**에 위 HTML → Save. 저장 후 실제 새 테스트 초대 메일이 한글로 오는지 확인. SMTP 발신자 변경은 이메일 템플릿 저장만으로 일어나지 않는다.

배포/검증은 **운영 Supabase에서 GET으로 설정을 확인한 후** 테스트 수신까지 확인해야 완료로 판정한다. 스크립트의 `--dry-run`은 로컬 구문·링크 규칙만 확인한다.

## 스팸 분류 개선 — 별도 설정 필요

현재 스크린샷의 `Supabase Auth <noreply@mail.app.supabase...>` 는 Supabase 기본 발신자다. 실제 브랜드 발신 주소(예: 소유한 도메인의 전용 `no-reply@...`)가 필요하면 도메인 관리자 및 SMTP 제공자 정보를 확보한 후 Supabase [Custom SMTP](https://supabase.com/dashboard/project/waluhdgqhwjjwmflhrle/auth/smtp)에 등록한다. SPF·DKIM·DMARC DNS 인증과 네이버/타 메일 수신 테스트를 진행한다. 도메인 소유권이나 SMTP 자격증명 없이 임의의 브랜드 발신 주소를 지정하거나 발송을 가장하지 않는다. 새 공급자/요금제 계약은 사전 확인한다.

네이버 스팸함의 '이미지·링크 표시' 알림은 수신 메일 보호 기능이므로 실제 사용자는 발신자 확인 후 초대 링크를 열어야 한다. 관리자는 처음부터 초대 링크의 출처를 확인시켜 피싱 오해를 방지한다.
