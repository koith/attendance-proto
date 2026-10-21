# QA1243 — 독립 Google 계정 설정 / 2026-10-21

**계정 경계:** `webuielf@gmail.com`만 사용. 운영 Google 계정의 OAuth 허용 금지. 인하대점 운영 시트 `2026 근태` 및 운영 Apps Script를 열람·공유·권한 승인·배포·수정하지 않는다. 과거 `1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw` QA 프로젝트는 **운영 계정 소유**이므로 폐기 대상이며 재사용하지 않는다(물리적 삭제는 별도 승인 필요).

## 1. 절대 먼저 수행하지 말 것

- 운영 계정으로 Google OAuth 승인 버튼을 누르지 않는다.
- 운영 Apps Script/Sheet ID를 QA 계정에 공유하지 않는다.
- GitHub `GOOGLE_OAUTH_CLIENT_ID` 등 기존 운영 Secret을 QA workflow에 연결하지 않는다.
- 금요일 신규 지점 실정보·운영 직원·운영 레시피·운영 Sheets를 테스트 데이터로 사용하지 않는다.
- 보안 키 또는 OAuth refresh token을 ChatGPT·Issue·PR 댓글·로그에 게시하지 않는다.

## 2. 사용자 1회 사전 준비 (QA 계정으로만 진행)

1. Chrome 우측 상단 프로필 → **QA 전용 Chrome 프로필** 사용. [Google 계정](https://myaccount.google.com/) 우측 상단 프로필 확인: `webuielf@gmail.com`.
2. [Google Cloud Console](https://console.cloud.google.com/) → 상단 프로젝트 선택 → **새 프로젝트** `QA1243-Isolated` → 만들기. 상단에 해당 프로젝트와 QA 계정 표시 확인.
3. **API 및 서비스 → 라이브러리**에서 **Apps Script API**, **Google Sheets API**, **Google Drive API**를 찾아 각각 **사용**. 별도 운영 프로젝트는 변경하지 않는다.
4. **Google Auth Platform → 브랜딩** (화면에 따라 *OAuth 동의 화면*) 앱 이름 `QA1243 Isolated`, 지원 이메일 QA 계정. **대상(Audience)** 에서 외부(External)·테스트(Testing) 선택, **테스트 사용자**에 QA 계정만 추가한다. 다른 계정 접근 없음. **데이터 액세스**에 아래 최소 권한만 등록.
5. **Google Auth Platform → 클라이언트** → **클라이언트 만들기** → *웹 애플리케이션* → 이름 `QA1243 CI` → **승인된 리디렉션 URI**에 `https://developers.google.com/oauthplayground` 추가 → 만들기. OAuth Playground를 사용하는 경우 웹 앱용 Redirect URI 등록이 필수다. Client ID/Client Secret은 **QA 전용**으로 관리한다.
6. [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)를 QA Chrome 프로필에서 연다. 톱니바퀴(설정) → **Use your own OAuth credentials** 체크 → 위 QA 프로젝트의 client ID/secret만 입력 → Access type **Offline**, 승인 동의가 있다면 **Prompt for consent**. 다음 범위를 추가하여 Authorize APIs:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/script.projects`
   - `https://www.googleapis.com/auth/script.deployments`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   **Drive 전체 수정/삭제, Sheets 전체 수정/삭제 및 external_request는 CI OAuth에서 요청하면 안 됨.**
7. 동의 화면이 **QA 계정**인지 확인한 뒤, 최소 범위만 동의한다. OAuth Playground에서 **Exchange authorization code for tokens** 클릭 → 발급된 **refresh token**은 다른 곳에 공유하지 않는다.
8. [GitHub 저장소 → Settings → Secrets and variables → Actions](https://github.com/koith/attendance-proto/settings/secrets/actions) → **New repository secret** 세 건 생성 (현재 운영 비밀값은 유지):
   - `QA1243_GOOGLE_OAUTH_CLIENT_ID` = 새 QA Cloud OAuth client ID
   - `QA1243_GOOGLE_OAUTH_CLIENT_SECRET` = 새 QA client secret
   - `QA1243_GOOGLE_OAUTH_REFRESH_TOKEN` = QA refresh token
9. QA Chrome 프로필로 [Apps Script 시작](https://script.google.com/home/projects/create) → 새 프로젝트 → 왼쪽 위 제목을 **`QA1243 isolated Edge GAS 2026-10-21 QA-only`**로 변경. **이 단계에서는 운영 스크립트 코드를 복사해 붙여넣지 않으며, OAuth를 승인하지 않는다.**
10. Apps Script 프로젝트 설정(톱니바퀴) → **스크립트 ID 복사**. [GitHub Settings → Secrets and variables → Actions → Variables](https://github.com/koith/attendance-proto/settings/variables/actions) → **New repository variable** → 이름 `QA1243_GAS_SCRIPT_ID`, 값 새 QA 스크립트 ID. **기존 운영 계정 소유 스크립트 ID는 입력 금지.**

## 3. 최소권한 구조와 검증

- **GitHub Actions OAuth (QA 계정):** userinfo.email, script.projects, script.deployments, drive.metadata.readonly, spreadsheets.readonly만 허용. 서버는 Google userinfo에서 QA 이메일을 확인하고 실제 토큰 범위 5개가 정확히 일치하는지 검사한다. 운영 근태 시트 및 기존 운영 계정 소유 QA 스크립트의 Drive 메타데이터 조회가 403/404인지 검사한다. QA Script 프로젝트의 파일 소유자 이메일을 Drive 메타데이터로 재검증한 후에만 업데이트한다. 운영 계정 자격증명은 환경변수에서 사용하지 않는다.
- **새 QA Apps Script 자체:** 명시적 OAuth scope는 **`spreadsheets`와 `script.storage` 두 개**. DriveApp / UrlFetchApp / executionApi 없고, QA 키/시트명만 허용하며, 기존 시트 탭을 삭제하거나 기존 파일을 이동·이름 변경하는 코드를 생성하지 않는다.
- **배포 증명:** Google `projects.getContent` 최신 소스와 `versions.getContent(versionNumber)`를 GitHub 생성 소스·manifest와 바이트 단위 비교. 서버가 돌려준 배포 versionNumber도 일치해야 한다. 정확한 소스+manifest SHA-256만 로그로 공개하며 secret 평문은 절대 로그에 내지 않는다.
- **QA 실 Sheet 생성:** 격리된 웹앱에 올바른 QA secret과 `QA1243_SBX_...` store 키를 보낼 때 `SpreadsheetApp.create('QA1243 ... 근태')`로 생성. QA 계정의 새 파일만 쓰고, 인하대 원본 시트 ID 접근은 계정 및 코드 2중 차단.

## 4. QA 코드 배포와 QA 계정 OAuth 승인

새 QA 자격증명과 스크립트 ID를 등록한 뒤, GitHub Actions의 `QA1243 isolated live production Edge GAS Sheets E2E`를 실행한다. **운영 시트·운영 앱을 갱신하는 별도 Actions job의 실행 여부를 먼저 검사**하고, 운영 Sheet write가 유발되는 main push는 사용하지 않는다. 이 조건을 충족하는 안전한 실행 경로가 확인되지 않았다면 QA 실행도 보류한다.

GitHub 로그에 `QA1243_REMOTE_SOURCE_ATTESTED`가 기록되고, 실제 QA Apps Script 소스/manifest가 검증된 이후:
1. QA 계정으로 [Apps Script](https://script.google.com/home) → 방금 만든 QA 프로젝트만 연다.
2. 좌측 **프로젝트 설정 → 'appsscript.json' 매니페스트 파일 표시**를 켜고 **편집기 → appsscript.json**의 `oauthScopes`가 `spreadsheets`, `script.storage` 두 개뿐인지 확인.
3. 편집기 상단 함수 선택에서 `qa1243AuthorizeServices` → **실행**.
4. 동의 팝업에 표시되는 계정이 `webuielf@gmail.com`인지 확인. Drive 전체 수정·삭제, 외부 웹 콘텐츠 실행이 표시되면 **취소하고 중단**. Sheets 수정 권한은 **QA 계정 파일만 접근 가능한 상태**라는 재검증을 마친 뒤에만 QA 계정에서 승인.
5. GitHub QA E2E 다시 실행하여 외부 잘못된 secret POST가 JSON `UNAUTHORIZED`인지 먼저 확인. 여전히 403 HTML이면 웹앱 배포의 액세스/정책 설정을 확인하고 Sheet 쓰기를 중단한다.

## 5. 완료 판정 (아직 미충족)

- QA Google token identity, OAuth 5 scopes, 운영 파일 접근 거부, QA 스크립트 소유주 인증, 활성 배포 코드·manifest digest 일치
- QA 웹앱 잘못된 secret → `UNAUTHORIZED`, 익명 GET 공개 probe 성공 (403 아님)
- 운영 production Edge의 **trusted OIDC** → QA 웹앱 → QA Google Sheet A/B 생성
- Google Sheets 실제 읽기·중복 방지·정정·타 지점 격리, 신규 Sheet의 소유자 QA 계정 증명
- 운영 Supabase DB 및 HQ/INHA read-only 전후 불변, 기존 운영 구글 시트 자체 전체 셀 불변은 읽기 증거 없으면 주장하지 않음
- 모든 실증 로그를 Issue #1243에 기록 후에만 QA-05 부분 게이트 PASS. HOSTED AUTH/실 사용자 세션 별도, 금요일 전체 게이트 NO_GO 유지.

**주요 주의:** 현재 `p0-pages-deploy.yml`은 main **모든 push**에 트리거되며 성공 시 기존 운영 근태 Sheet를 재동기화하는 단계가 있다. 따라서 QA 보안용 PR을 단순 병합하는 것은 사용자 '운영 시트 변경 금지'와 충돌한다. 메인 병합 전 별도 승인 없는 운영 write가 일어나지 않도록 CI 트리거 격리/배포 수동 방식을 검증해야 한다.
