# QA1243 — iPhone Safari 모바일 OAuth 승인

## 채택한 방법

**Google Identity Services(Web Token Model) → Safari 클립보드 1회 복사 → GitHub 공식 Actions Secrets 등록**. 웹 페이지는 Google/GitHub 토큰을 서버에서 수집하지 않고, 클라이언트 측 로그인 및 계정 확인만 수행합니다. 기존 [Windows OAuth 도우미](QA1243_QA_GOOGLE_BOOTSTRAP.md)와 PR #1298~1299는 그대로 보존합니다.

- TV/Device Authorization은 필수 Apps Script 프로젝트/배포 API OAuth 권한을 지원하지 않으므로 사용할 수 없음.
- Desktop OAuth는 Windows의 127.0.0.1 listener가 필요하여 iPhone Safari만으로는 불가.
- Google Web authorization-code flow는 HTTPS redirect 및 비밀키가 있는 서버가 필요. 이 프로젝트에는 해당 비밀키와 GitHub Secrets 관리 권한이 연결되지 않아 공개 HTML에 심는 것은 금지.
- Google GIS token popup은 **QA 계정 Web OAuth Client ID(공개값)** 만 사용하고 단기 access token을 발급. Refresh Token은 발급하지 않음.

## 모바일 URL

Supabase QA 전용 정적 함수가 실제 배포·HTTP 확인된 뒤 사용:

`https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/qa1243-mobile-auth`

이 페이지는 서버로 OAuth 토큰이나 관리자 자격증명을 전송하지 않습니다. POST 요청은 405로 거부합니다. 방문 시마다 새 CSP nonce, 10분 내 1회 복사 제한, 정확한 QA 이메일/5개 권한/30분 이상 토큰 유효기간 확인, 저장소·로그·URL 쿼리·웹 저장소에 토큰 보관 금지. 단, **클립보드와 GitHub 공식 Secret 입력란**에는 잠시 토큰이 존재합니다. 1회 복사는 UI 범위의 제한이며 Google bearer token 자체를 암호학적으로 1회용으로 바꾸지는 못합니다.

## iPhone Safari 조작

1. 먼저 QA Google 계정 `webuielf@gmail.com`으로 로그인하여 [Google Cloud QA1243 Clients](https://console.cloud.google.com/auth/clients?project=qa1243-isolated)에서 **Web application OAuth client** 하나를 준비합니다. Authorized JavaScript origins는 `https://waluhdgqhwjjwmflhrle.supabase.co` (경로 없음). [Audience](https://console.cloud.google.com/auth/audience?project=qa1243-isolated)가 Testing이면 QA 이메일을 Test user에 포함해야 합니다. 기존 QA Desktop Client는 웹 페이지에서 사용할 수 없습니다. **Web Client ID만 복사하고 Client Secret은 절대 입력/전달하지 않습니다.**
2. Safari에서 위 QA1243 URL을 열고 Web Client ID 입력 → **1. QA Google 로그인·동의**. 계정 `webuielf@gmail.com`과 정확한 5개 권한을 확인합니다: userinfo.email, script.projects, script.deployments, drive.metadata.readonly, spreadsheets.readonly. Drive/Sheets 전체 수정·삭제 권한은 동의하지 않습니다.
3. **2. 인증 토큰 복사(한 번)** → **3. GitHub 공식 Secret 등록 화면**으로 이동. Secret 이름은 `QA1243_GOOGLE_OAUTH_ACCESS_TOKEN`; Secret 값에는 Safari 클립보드 내용을 붙여넣고 GitHub에서 저장합니다. 다른 사람·채팅·GitHub Issue·URL 쿼리에 붙이지 않습니다.
4. Secret 저장 완료를 개발 대화에서 알려주면 GitHub 연결 도구로 기존 **trusted main push 실패 QA job**만 재실행합니다. 모바일 Access Token은 짧은 수명(보통 약 1시간)이므로 바로 실 E2E를 실행해야 합니다. QA GAS 자체 Sheets/script.storage 동의가 추가 필요하면 **QA 소유 스크립트**에서만 승인합니다. 운영 계정에 대한 OAuth 승인은 금지합니다.

## 보안/검증 경계

- 공개 함수는 **GET HTML 전용**, HTTP POST 405, URL query 400. 외부 API 요청은 Safari에서 Google 사용자 정보에 대한 Bearer 헤더뿐이며 권한 등록은 GitHub **공식** UI에서 처리합니다. Google 계정 일치/신규 Scope 이외 승인 시 fail-closed. 사용자 확인은 page 및 이어지는 trusted GitHub QA에서 다시 진행.
- 기존 trusted GitHub E2E는 `QA1243_GOOGLE_OAUTH_ACCESS_TOKEN` Secret이 존재할 때 별도 mobile authentication branch로 실행할 수 있으며, 기존 Windows Client ID/Secret/Refresh Token이 모두 있는 경우 Windows refresh 경로를 우선 사용. iOS 임시 토큰을 URL query가 아닌 Google tokeninfo POST 본문으로 검증하도록 runner를 변경.
- GitHub repo Secrets API를 자동 호출하기 위한 **GitHub 관리자 자격증명을 자체 공개 웹페이지에서 수집하는 설계는 채택하지 않음**. 따라서 GitHub 공식 Secret 신규 등록이라는 **최소 1개 수동 작업**이 남습니다. 모바일 완전 자동이 아닌 **안전한 모바일 보조 인증 경로**입니다.
- iPhone Safari 실기기 팝업·Google 동의·GitHub Secret 저장·Edge→QA GAS→Sheets E2E는 사용자의 별도 실제 승인 증거 이전까지 성공 주장 금지. 앱 v0.353, Friday **NO_GO**, 백로그 **38/19/19** 유지.

## 공식 참고

- Google TV Device Authorization 제한: https://developers.google.com/identity/protocols/oauth2/limited-input-device
- Google Desktop loopback 제한: https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration
- Google Identity Services token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- GitHub Actions secrets: https://docs.github.com/en/rest/actions/secrets
