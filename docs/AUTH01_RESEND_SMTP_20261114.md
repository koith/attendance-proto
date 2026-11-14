# AUTH-01 — Resend SMTP 운영 연결 준비 (2026-11-14)

**상태: 안전 자동설정 코드와 격리 QA 완료. 운영 Resend 발송 도메인 인증·자격증명·Hosted Auth 설정 적용·실수신 미완료.**

## 도메인과 권한

공식 브랜드 홈페이지는 `10billioncoffee.co.kr`이며 페이지 운영사 표시는 (주)오가다. 이 사실은 현재 사용자의 DNS 편집 권한을 증명하지 않는다. **공식 도메인의 DNS 소유자 승인 없이는** 해당 도메인에 인증용 하위 도메인 또는 DNS 레코드를 만들지 않는다. 사용자가 직접 통제하는 별도의 도메인이 있다면 이를 대신 사용할 수 있다. GitHub Pages의 `github.io` 하위 주소는 사용자 소유 DNS 존이 아니므로 회사 발신 도메인 대용으로 임의 인증할 수 없다.

권한이 확인되면 Resend → Domains에서 **인증메일 전용 하위 도메인**(예: `auth.10billioncoffee.co.kr`, *후보 예시*)을 추가한다. Resend가 **실제로 표시하는** DKIM, SPF, 필요시 MX/TXT 레코드의 정확한 name/type/value를 관리 중인 DNS 존에 등록한다. 기존 회사 홈페이지 A/CNAME·기존 메일 MX·SPF를 지우거나 네임서버를 갈아엎지 않는다. DNS 공급자가 Domain Connect를 지원하면 Resend 원클릭 등록도 가능하다. Resend 상태 `verified` 및 sending `enabled` 확인 전에는 운영 Auth를 변경하지 않는다.

## 운영 연결

공식 Supabase 파트너 통합을 쓰는 경우 https://supabase.com/partners/resend 를 통해 Resend 계정 연결 및 SMTP 자격증명 생성과 입력을 진행할 수 있다. 프로젝트는 `waluhdgqhwjjwmflhrle`. 이 방법이 가능한 환경에서는 비밀키를 GitHub에 복제할 필요가 없다.

이미 GitHub Actions 환경에서 자동 설정을 선택하는 경우 기존 `production` 환경의 Secrets에 `RESEND_API_KEY` (Resend 계정의 도메인 조회 + 발송이 가능한 API Key), `SUPABASE_AUTH_WRITE_TOKEN` 또는 `SUPABASE_ACCESS_TOKEN` (Supabase Management API Auth config 읽기/쓰기)을 등록한다. 채팅·소스·이슈·GitHub Actions 입력값에 키를 넣지 않는다. `.github/workflows/auth-resend-smtp.yml`을 GitHub Actions에서 manual `workflow_dispatch`로 `review` 실행한 뒤, verified 도메인과 기존 비-Resend SMTP 부재를 확인하고 `apply`를 실행한다. sending_domain 입력은 도메인(예: `auth.example.com`)이며, `no-reply@` 발신 주소는 스크립트가 구성한다. GitHub `production` 보호 설정은 우회하지 않는다.

Resend SMTP 값: host `smtp.resend.com`, port `465`, user `resend`, password Resend API key, From `no-reply@<verified domain>`, sender `백억커피`. 스크립트는 LIVE Auth의 SMTP 값과 기존 한글 초대 템플릿만 변경하며 운영 데이터·계정·초대 발송·사이트 URL·리다이렉트·다른 메일 템플릿·Auth 정책은 변경하지 않는다. 기존 비-Resend SMTP가 있다면 덮어쓰기 대신 차단한다. SMTP 설정 변경 후 원격 GET으로 메타데이터를, 한국어 초대 템플릿 PATCH 후 GET으로 제목/본문을 확인한다. 원격에서 SMTP 비밀번호가 읽히지 않을 수 있으므로 완전 연결 증거는 **실제 이메일 발송·수신**이 필요하다.

## 실제 발송 검증과 완료 기준

신규 테스트 수신 주소로 실제 초대를 **한 번** 발송하고 Resend 발송 이벤트 `delivered` 확인, 테스트 수신함에서 한글 제목/HTML 표시 및 초대 링크 수락·비밀번호 설정·최초 로그인까지 확인한다. 중복 관리자 계정, 운영 지점 직원/급여 데이터, 실제 점주 메일 주소는 테스트에 재사용하지 않는다. Google/Naver 스팸함도 확인한다. 리디렉션 `site_url`/callback 설정이 불일치하면 변경 전 별도 승인·백업을 거친다. 성공 전 원장 AUTH-01은 OPEN 유지.

공식 문서: https://supabase.com/docs/guides/auth/auth-smtp · https://resend.com/changelog/smtp-service