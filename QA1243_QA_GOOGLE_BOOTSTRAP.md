# QA1243 — QA Google 계정 OAuth 1회 설정 / 2026-10-21

## 결론: 사용자가 직접 입력하는 Secret은 0개

- **허용 계정:** `webuielf@gmail.com`만. 운영 계정의 Google 연결(현재 ChatGPT Drive `dokodemoitsho@gmail.com`)을 사용하지 않음.
- **전제 완료:** QA 계정/독립 Google Cloud `QA1243-Isolated` (ID `qa1243-isolated`), Script/Sheets/Drive API, QA 계정 Apps Script API 허용, QA Script `QA1243 isolated Edge GAS 2026-10-21 QA-only` 생성 완료.
- **사용자 추가 화면 조작:** QA Cloud OAuth 동의 화면의 테스트 사용자 및 Desktop OAuth 클라이언트 **최초 1회** 설정/JSON 다운로드 (아직 미설정일 때만), Windows 동봉 도우미 `QA1243_OAuth_Start.cmd` 실행 및 Google·GitHub 브라우저 로그인/동의.
- **자동:** OAuth local callback + PKCE → 정확한 scope/QA 계정 확인 → Refresh Token 발급/재발급 검증 → GitHub Actions Secret 3개 등록 → 기존 main push QA만 자동 재실행. QA Script ID 자동 검색/업로드/배포 및 QA Sheet A/B 생성은 기존 trusted CI가 수행.
- **일회성 문서/스크립트 및 근거:** `scripts/qa1243_oauth_bootstrap.mjs` / `scripts/qa1243_oauth_scopes.mjs` / `scripts/qa1243_oauth_bootstrap.test.mjs`. Google 공식 [Desktop OAuth 문서](https://developers.google.com/identity/protocols/oauth2/native-app)·[Testing 사용자](https://support.google.com/cloud/answer/15549945)·[GitHub CLI stdin Secret](https://cli.github.com/manual/gh_secret_set).
- **운영 환경 절대 보호:** 인하대점 `2026 근태`, 실제 운영 Apps Script/Google OAuth, 기존 운영 Supabase 매장/직원/급여/레시피에 쓰기 없음. QA-only 작업용 `[QA1243-NO-OPERATING-WRITE]` main merge는 운영 Pages 빌드/배포·Google Sheets 갱신을 생략.

## A. 구글 클라우드에서 딱 한 번 — QA 계정일 때만

이미 설정했다면 다시 생성하거나 변경할 필요가 없습니다.

1. **QA 계정만 활성화한 Chrome 프로필**에서 [Google Cloud → QA1243-Isolated OAuth Audience](https://console.cloud.google.com/auth/audience?project=qa1243-isolated)를 열어 External(외부) / Testing(테스트), 테스트 사용자 `webuielf@gmail.com` 한 명 등록을 확인. 다른 계정 및 운영 계정을 테스트 사용자에 등록하지 않습니다.
2. 같은 프로젝트 [Data Access](https://console.cloud.google.com/auth/scopes?project=qa1243-isolated)에 필요 시 **아래 5개 scope만** 등록/동의 검토:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/script.projects`
   - `https://www.googleapis.com/auth/script.deployments`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
3. [OAuth Clients](https://console.cloud.google.com/auth/clients?project=qa1243-isolated) → **Create client → Desktop app(데스크톱 앱)** → 이름 `QA1243 local once` → JSON 다운로드. 파일 이름은 보통 `client_secret_*.json`입니다. **Downloads 폴더에 보관**하면 도우미가 자동 탐색합니다. Desktop app에는 OAuth Playground redirect URI를 추가할 필요가 없습니다.
4. 기존에 QA Cloud 프로젝트의 **Desktop OAuth 클라이언트가 이미 있다면 새로 만들지 말고** 해당 JSON만 다운로드하면 됩니다. 운영 Cloud OAuth 클라이언트, Web application type, 서비스 계정 JSON, API key는 도우미가 거부합니다.

## B. Windows에서 한 번 — Secret 3개 자동 등록

1. [GitHub Actions → QA1243 OAuth one-click Windows package](https://github.com/koith/attendance-proto/actions/workflows/qa1243-bootstrap-package.yml)의 최신 **main 성공 실행**을 열어 아래 **Artifacts → QA1243-OAuth-OneClick**을 다운로드한 뒤 **한 번만 압축 해제**합니다. 저장소에서 검증한 `QA1243_OAuth_Start.cmd`와 `scripts/*.mjs`·설명서만 포함하며, OAuth Secret/JSON은 포함하지 않습니다. 파일을 PC의 개인 폴더에 보관하고 운영 자료 폴더에 넣지 않습니다.
2. `QA1243_OAuth_Start.cmd` **더블클릭**. Node.js 및 GitHub CLI가 없다면 공식 Windows Package Manager(winget)로 설치를 시도합니다. GitHub 로그인 이력이 없을 경우 **GitHub 로그인 승인**이 한 번 필요하며, 대상 저장소 관리자 권한도 자동 확인합니다. 방금 다운로드한 QA Desktop OAuth JSON을 Downloads에서 자동 탐색합니다.
3. 자동으로 열린 Google 브라우저에서 **`webuielf@gmail.com`을 선택**하고 위 5개 읽기·스크립트 관리 범위를 검토 후 **동의**합니다. `Drive 전체 수정/삭제`, `Google Sheets 전체 수정/삭제`, `외부 요청` 범위가 표시되면 허용하지 않고 중단합니다.
4. **나머지는 자동**: PKCE code 교환, Refresh Token 발급/검증, 실제 소유 계정 email 검증, GitHub에 `QA1243_GOOGLE_OAUTH_CLIENT_ID`, `QA1243_GOOGLE_OAUTH_CLIENT_SECRET`, `QA1243_GOOGLE_OAUTH_REFRESH_TOKEN`을 암호화 전송, Secret 이름만 재확인, 가장 최근 검증된 main **push 이벤트** QA 작업 실패 job 재실행 요청. Script ID를 복사하거나 GitHub 화면에서 Secrets 3개를 각각 등록할 필요가 없습니다.
5. 실행 결과에는 `QA1243_THREE_GITHUB_ACTIONS_SECRETS_UPLOADED`, `QA1243_TRUSTED_MAIN_PUSH_E2E_RERUN_REQUESTED` 같은 **상태 코드만** 나타납니다. Refresh Token/Client Secret/토큰 교환 HTTP 본문·인증코드는 **표시·파일 저장하지 않습니다**. 만약 Downloads에 QA Desktop JSON이 여러 종류라면, 새로 받은 JSON 파일 경로를 지정해 `QA1243_OAuth_Start.cmd --credentials "C:\\Users\\...\\Downloads\\client_secret_...json"`로 재실행할 수 있습니다.

**GitHub 자동화 방식:** 로컬 [GitHub CLI `gh secret set -f -`](https://cli.github.com/manual/gh_secret_set)로 내용은 표준입력에서만 전달하고 GitHub에 보내기 전에 로컬 암호화합니다. GitHub Secret 3개 원문은 커밋/Issue/채팅/명령줄 인수로 옮기지 않습니다. GitHub CLI 자체의 정상 로그인 자격증명 보관은 사용자의 PC에서 처리됩니다.

**Google OAuth Desktop 근거:** [Google 가이드](https://developers.google.com/identity/protocols/oauth2/native-app)는 Desktop에서 `127.0.0.1` 임시 로컬 리디렉션/PKCE를 지원하고, `access_type=offline` + `prompt=consent`로 Refresh Token 발급을 지원합니다. **OOB 코드 복사 방식은 사용하지 않습니다.** 이 도우미는 로컬에서만 콜백을 받고 아무 외부 콜백 서버도 사용하지 않습니다.

## C. 자동 QA 배포 뒤 필요한 1회 QA Script 소유자 동의 (조건부)

- **필요할 때만**: [GitHub QA E2E](https://github.com/koith/attendance-proto/actions/workflows/qa1243-live-e2e.yml)에서 `QA1243_REMOTE_SOURCE_ATTESTED`가 출력된 뒤 `QA1243_GAS_OWNER_CONSENT_REQUIRED` 또는 실행 403이 나오는 경우.
- `webuielf@gmail.com`으로 [Apps Script](https://script.google.com/home)에서 기존 QA1243 프로젝트만 열고, 상단 함수 선택 `qa1243AuthorizeServices` → **실행 → Sheets 및 Script properties 권한 동의**. 이 권한은 **독립 QA 계정의 GAS 런타임**이 신규 QA 시트를 만들고 쓰기 위해 필요합니다. CI OAuth와는 별개이며 CI에 Sheets 전체 수정 권한을 부여하는 일이 아닙니다.
- 동의 후 GitHub의 동일 QA E2E main push **실패 작업 재실행**. 해당 대화가 진행 중이고 도구 접근이 가능하면 개발 담당자가 GitHub 연결로 재실행할 수 있습니다. 승인 외의 화면 복잡한 설정/코드 붙여넣기 금지.

## D. 범위, 만료, 완료조건

| 작업 | OAuth scope | 목적 |
| --- | --- | --- |
| GitHub CI OAuth (Desktop) | 위 정확히 5개 | Apps Script 코드/배포, Drive 파일명·소유권 확인, 기존/신규 Sheets 읽기 검증 |
| QA Apps Script 런타임 | `spreadsheets`, `script.storage` | QA 전용 새 Sheets A/B 만들기/기록·스크립트 자체 속성 저장 |
| 운영 Google OAuth | **미사용** | 운영 리소스 보존 |

- Google Cloud **External / Testing**에서 위와 같은 일반 이메일 이외 범위가 포함되면 Refresh Token은 **7일 후 만료**되는 것이 기본입니다. [Google 공식 설정 안내](https://support.google.com/cloud/answer/15549945). 금요일 개통 QA는 이 안에 수행하고, 7일 이후 같은 흐름이 필요하다면 별도 안전한 재승인이 필요합니다. 장기 서비스 계정 대체 설계 없이 임의로 Production publishing으로 전환하지 않습니다.
- GitHub Secret 등록/QA runner 시작만으로 PASS 아님. **실제 owner 검증, 운영 자료 접근 거부, 소스/버전 readback, 익명 GAS 잘못된 secret에 JSON `UNAUTHORIZED`, 실제 Edge→GAS→QA Sheets 읽기/중복방지/정정/지점 A-B 격리**가 검증되어야 QA-05 통과.
- Hosted Auth 한국어 초대 실메일, 보조 관리자 구세션 회수, 현장 증거, 실제 신규 지점 승인 등은 별도 미완료. **금요일 개통 게이트는 실제 검증 전까지 NO_GO**. 정본 업무원장 38/19/19.
