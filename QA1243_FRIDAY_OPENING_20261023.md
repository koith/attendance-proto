# 백억커피 2026-10-23 금요일 아침 신규 지점 개통 — 사전 검증 게이트

- 목표: **10월 22일(목) 업무 종료 전 개통 준비 PASS/FAIL**, **10월 23일(금) 아침 실개통**.
- **본사 3계정, 인하대점 직원 10명, 운영 244지점, 기존 Google Sheet·근태·급여·레시피 절대 무단 변경 금지.**
- 실제 신규 지점명 및 대표 이메일은 **금요일 개통 시작 시 사용자 명시 승인 후에만 사용**한다. 그전에는 요청·추측·임의 치환하지 않는다.
- 정본: `PROJECT_BACKLOG_20261017.md`, 업무 Issue #1243. 가상 QA PASS, 배포 API 메타데이터 SUCCESS, Pages 배포 SUCCESS는 실제 hosted Auth/GAS/Sheets 성공의 대체 증거가 아니다.

## 1. 10/23 개통 한시적 P0 우선순위

원장 내 해당 ID의 원래 장기 범위와 구분해 금요일 개통에 필요한 **P0 부분 게이트**를 먼저 검증한다. P0 부분 QA를 통과해도 원래 ID의 전체 완료 조건을 충족하지 않으면 체크박스 [ ] 유지.

| P0 ID | 필수 사전 증명 |
|---|---|
| QA-04 | 격리 GoTrue + Mailpit 실제 API/SMTP와 운영 Hosted 테스트 수신의 엄격한 구분·후자 안전한 테스트 가능 |
| QA-05 | 운영 Edge → QA 전용 GAS → QA Sheet 실제 쓰기·재조회·정정·멱등성·지점격리 |
| QA-06 | 지점 등록/READY, 관리자 세션, 근태·급여 예외, 월말·휴게·수기 변경 시나리오 |
| QA-07 | 신규 지점 권한·직원·레시피·재고/매출 진입 최소 스모크(장기 POS/공급사 통합은 별도) |
| SEC-01 | 해임·권한 변경 뒤 기존 세션의 관리 RPC 거부와 직원/익명 경로 무회귀, 과도한 단일 기기 차단 회귀 금지 |
| AUTH-01 | 운영 Auth 초대 한국어 템플릿/SMTP 검증·격리 테스트 이메일 실제 도달성 |
| FIELD-01 | 실제 사용자 입력이 필요한 대표·보조 계정과 권한 확인은 금요일 사후 최종 단계로 분리 |
| MTG-03 | 새 지점 예상 급여·주휴·휴게·정정 원천 검산의 안전한 승인·표시 |
| MTG-04 | 지점별 대표 관리자 개통·시트 연결 절차 (회의상 특정 두 지점의 정체는 실제 금요일 지점과 동일하다고 추정하지 않음) |

**임시 후순위 10개:** FIELD-02, FIELD-03, MTG-05, MTG-06, MTG-07, MTG-08, MTG-11, MTG-12, MTG-13, MTG-16. 보안 결함이나 신규 지점 회귀로 직접 연결될 때만 개통 P0로 재격상. 운영 데이터 보존은 항상 최우선.

## 2. 실제 사전 PASS 필요 증거

1. [ ] GitHub Actions `Store opening full journey QA`와 본사 신규 지점/보조 관리자 **격리 PostgreSQL** 테스트 성공.
2. [ ] 실제 **격리 GoTrue/Mailpit**에서 초대·재초대·비밀번호 설정·로그인, 만료·취소·중복 수락 정상.
3. [ ] 운영 Hosted Auth/SMTP의 설정 읽기와 **허가된 테스트 수신자** 실제 초대 도달 확인. 수신이 없거나 운영 설정 API 읽기 불가면 FAIL.
4. [ ] QA 전용 Google script 프로젝트에서 `qa1243AuthorizeServices` 권한 동의 후 익명 /exec 잘못된 secret 요청이 **JSON `UNAUTHORIZED`** 반환. 403 HTML이면 즉시 FAIL, Sheets 쓰기 금지.
5. [ ] trusted main `QA1243 isolated live production Edge GAS Sheets E2E` 성공; 두 QA 지점 시트 별도 ID, Google Sheets API 실제 읽기/정정/중복 방지 증빙.
6. [ ] 관리자 초대·권한 회수·세션 보호, 직원·근태·급여, 지점별 레시피 오버라이드 저장·재조회·격리와 READY 전 경계 PASS.
7. [ ] 운영 인하대점/HQ 데이터 읽기 전·후 비교; 최소 HQ3/직원10/지점244/QA 실지점0/운영 Sheet 파일ID·표제·권한 무변경과 민감 원본 비조작 기록. 운영본 전체 셀 바이트 불변을 메타데이터만으로 주장 금지.
8. [ ] 최신 main SHA의 Pages P0 배포 성공, 공개 앱 버전과 정적 파일 비교, 별도 독립 배포 검증 SUCCESS.
9. [ ] 10/22 사전 PASS/FAIL을 근거 링크·남은 승인·차단 근거로 Issue #1243 및 원장에 기록.

`QA1243 Friday opening hard readiness gate`는 각 workflow의 **최근 main 실행**을 조회해 이전 성공을 최신 실패와 혼동하지 않는다. 외부 실SMTP 수신·실세션·사전/사후 운영 불변 증빙은 workflow 녹색만으로 PASS로 바꾸지 않는다. 실행 결과의 JSON/Markdown 아티팩트를 보존한다.

## 3. Google 403 — 별도 QA 계정 소유의 **새** 프로젝트만 사용

- 2026-10-21 사용자 검증: `webuielf@gmail.com`은 기존 운영 `2026 근태` 파일 접근 시 **액세스 권한 필요**. 그러나 GitHub Actions OAuth token으로도 실제 403/404가 반환되는지 다시 검증해야만 PASS.
- 이전 QA Script `1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw`는 Google Drive 메타데이터상 **운영 계정 소유**. 절대 재사용하거나 그 소유자 계정에서 Google OAuth 권한 승인 금지. 운영 Apps Script 및 운영 Sheet 원본 변경 금지.
- [QA 계정 설정 및 클릭 순서](QA1243_QA_GOOGLE_BOOTSTRAP.md)에 따라 QA Cloud OAuth client와 새 QA 소유 Apps Script 준비. GitHub **별도 QA-only 세 Secret**과 `QA1243_GAS_SCRIPT_ID` 변수만 연결한다.
- 코드(작업 PR [#1296](https://github.com/koith/attendance-proto/pull/1296))에서 OAuth token **이메일 일치**, 정확한 CI 최소 5 scope, 운영 시트/구 프로젝트 접근 거부, 새 Script 소유자 일치부터 확인. 복사된 QA Script 런타임은 `spreadsheets` + `script.storage`만 요구, `DriveApp`/`UrlFetchApp`/`scripts.run`은 사용하지 않는다. 다른 scope 승인 요청 시 즉시 중단.
- Google 서버 `projects.getContent` HEAD/불변 versionNumber의 소스+manifest와 배포 versionNumber 일치 검증 후에만 QA 계정 **직접** 편집기에서 `qa1243AuthorizeServices`를 실행. 운영 계정 접근·승인 절대 금지.
- QA 전용 Web App 익명 GET 공개 probe와 잘못된 secret POST가 **JSON `UNAUTHORIZED`**여야 다음 단계 허용. 403 HTML이면 NO_GO 및 모든 Sheet 쓰기 중단. 성공 후 실 Edge→QA GAS→QA 소유 A/B Sheet 읽기/정정/멱등성·지점 격리와 소유자 메타데이터를 검증해야 QA-05 부분 PASS.
- **운영 Sheet 자동 재동기화 차단:** `p0-pages-deploy.yml`은 모든 main push에 운영 Sheet 쓰기 단계가 있으므로, GitHub QA-only 변경은 정확한 커밋 마커 `[QA1243-NO-OPERATING-WRITE]`와 소스 변경 파일 allowlist를 거쳐 운영 Pages build/deploy/Sheet refresh와 운영 배포 알림을 **건너뛴다**. 이 예외는 웹앱 배포 성공 증거로 인정하지 않는다. main 변경 파일이 허용 범위를 벗어나면 QA-only 검증 실패.
- Hosted Auth SMTP/실수신/대표 관리자 세션 검증은 이 Google QA 통과와 무관한 별도 필수 게이트다. **전체 개통 NO_GO**는 유지.

## 4. 금요일 오전 — 승인 후 실제 개통 원자적 절차

**진입 조건:** 10/22 사전 게이트 PASS와 실제 지점명·대표 이메일 제공, 사용자의 운영 생성·초대 **명시 승인**. 조건이 하나라도 없으면 실데이터 투입 보류.

1. 작업 전 현재 main 배포 증명과 운영 기준선, **중복 지점 코드·이미 생성한 지점** 여부를 조회.
2. 본사 HQ로 **STAGED** 지점을 단 한 번 등록. 응답·지점ID·코드 보관. 타임아웃/응답 불확실 시 재등록 전 조회해 중복 방지.
3. 승인받은 정확한 대표 이메일로 초대 **한 번** 발송. 전송 실패/시간초과 시 해당 계정 초대 상태를 먼저 재조회한 뒤 재전송 판단.
4. 실제 수신인이 초대 열람·수락·비밀번호 설정·최초 로그인 완료 확인. 기존 가입 계정이면 기존계정 재연결 흐름만 사용. 절대 임의 다른 계정으로 대체하지 않음.
5. 대표 관리자 인증 세션과 서버 계정-지점ID·실제 수락 상태 확인. STAGED 상태에서 매장 진입이 막히는 것은 정상이며, 이를 우회하거나 STAGED 전 매장 UI를 사용하도록 강제하지 않는다.
6. 사전 격리 E2E와 실제 초대/권한 연결, 원본 시트 분리·READY 전용 보호, 사용자 승인 충족 후에만 **READY** 전환. 실패 시 STAGED 유지.
7. READY 상태에서 실제 관리자 매장 최초 진입, 다른 지점 접근 거부, 보조 관리자 권한 경계, 직원·근태·급여 기본 화면, 레시피 조회/지점 오버라이드 저장·재조회, 지점 고유 시트 동기화·조회 검증. 실데이터 작성·테스트 직원 생성이 필요하면 별도 영향 범위 승인 후 시행.
8. 인하대점/본사 read-only 변경 전후 비교 및 Issue #1243에 사용자 승인·실제 성공/실패 경계 기록.

**복구:** 단계 중 실패 시 사용자의 별도 승인 없이 운영 테스트 지점 삭제·계정 해임·중복 지점 재생성·실운영 Sheet 재매핑 금지. 현재 상태와 실패 단계·재시도 가능성 기록, 가능하면 STAGED 상태에서 원인 수정 후 같은 지점에 대해 재검증.

## 5. 보고 상태 원칙

- `CODE_READY`: 소스·합성 격리 QA 통과.
- `HOSTED_E2E_READY`: 실제 QA 외부 서비스 연동 및 권한 통과.
- `PRELAUNCH_PASS`: 위 사전 필수 게이트 전체 통과(실제 신규 이메일 제외).
- `FRIDAY_LIVE_READY`: 실제 사용자 승인 후 실인원 초대·개통 작업 허용.
- `NO_GO`: 어떤 필수 증거라도 FAIL / PENDING. 금요일 실정보 투입 보류.

항목별 산출물을 재실행하지 않고 원장에 연결해 보존한다.

## 6. 2026-10-22 22시 — 실제 Google E2E 통과 이후 보안·실인원 개통 게이트

- **검증한 최신 증거**: trusted [Google E2E #39781031886](https://github.com/koith/attendance-proto/actions/runs/39781031886) SUCCESS (QA 소유 Script / Google Sheets A·B 쓰기·읽기·중복방지·정정·격리). 이를 다시 GOOGLE 403 미완료로 기록하지 않는다. 단 Gmail/운영 Hosted Auth 초대·인증·실세션 검증에는 해당하지 않는다.
- **현재 게이트**: [#39782981047](https://github.com/koith/attendance-proto/actions/runs/39782981047) `5/8 NO_GO`, 남은 `HOSTED_AUTH_READ`, QA-only main 커밋으로 생략된 `PAGES_PUBLISH` 및 `INDEPENDENT_PAGES`. 외부 증빙 3개 `HOSTED_TEST_MAIL_RECEIPT`, `STORE_MANAGER_LIVE_SESSION`, `PRODUCTION_PREPOST_DATA_PROOF`는 워크플로 PASS로 대체 금지.
- **기존 격리 증거와 남은 실증 구분**: `qa_gotrue_mailpit_live_1243.mjs`의 격리 GoTrue+Mailpit은 실제 테스트 SMTP 초대/링크/비밀번호/로그인/기존 계정 recovery/취소 후 재초대/실제 시계 만료를 검증한다. `qa_invitation_preflight_1243.sql`·`qa_store_delegated_manager_postgres.sql`·`qa_store_opening_lifecycle_1243.sql`은 지점별 가상 사용자/역할·STALE 관리자 접근 거부/직원·급여·레시피 격리를 테스트한다. **운영 Hosted Auth를 통한 실제 테스트 수신/계정 세션은 아직 미검증**, 실명/운영 초대 임의 생성하지 않는다.
- **금요일 당일 개통**: user가 실제 지점명과 실대표 이메일 및 명시 승인을 제공하기 전 운영 지점 등록, Auth 초대 발송, 활성화/직원·근태·급여·레시피 원본 쓰기 금지. 독립 테스트 결과가 PASS라도 운영 READY로 임의 전환하지 않음.

### 사진 속 공유 비밀키 — 무중단 대응

1. 2026-10-21 QA1243 Google Apps Script 편집기 사진에 `SHARED_SECRET` 평문이 보였으므로, **해당 값은 노출된 것으로 가정**한다. 다만 사진 속 값이 지금 활성 운영 `SHEET_SHARED_SECRET`과 같은지, 기존 운영 계정 소유 스크립트의 키인지, 이미 교체됐는지는 **별도 소유자 증거 없이 확정할 수 없다**. 원문 키를 Issue/채팅/GitHub/QA 로그에 올리지 않는다.
2. 운영 경로를 무정지 교체하려면 반드시 스크립트/Edge의 현재 활성 버전과 연결 대상을 읽기 전용으로 재확인한다. **새 키는 기존 키와 독립** 생성하고 GitHub 로그 및 대화에 남기지 않는다. 스크립트 쪽을 먼저 **기존 키 + 새 키 둘 다 인정하는 임시 dual-key 수신 구현**으로 배포하고, 실제 운영 시트에 임의 시험 쓰기 없이 기존 인증 경로 정상 여부를 검증한다.
3. QA에서 새 키로 UNAUTHORIZED/정상 분기 및 무쓰기 검증한 다음, Edge `SHEET_SHARED_SECRET`을 새 키로 교체하고 외부 동기화의 정상 상태를 확인한다. 정상 전환 후에만 Apps Script에서 **기존 키 허용을 제거**해 배포한다. 하나의 키만 인정하는 기존 구현을 그대로 둔 채 Edge/Script를 순서 없이 일방 변경하면 동기화가 중단되므로 금지.
4. **중단 조건**: 운영 Google Script 소유자 접근, 운영 Supabase Secret 설정 권한, 실제 업무 동기화 승인 및 전후 정상 증거 중 하나라도 부족하면 `ROTATION_PENDING_OWNER_AUTH`으로 기록하고 운영 값은 변경하지 않는다. 임의 시트 덮어쓰기, 기존 시트/스크립트 교체, 공유 권한 변경 금지.
5. **QA 전용 새 프로젝트**는 실제 QA Actions 실행 시 난수 공유키를 생성해 QA 스크립트에만 배포한다. QA 랜덤 키와 운영 `SHEET_SHARED_SECRET`을 혼용하지 않는다. Actions Google API 오류 본문이 토큰/키를 다시 노출하지 않도록 QA 러너의 로그를 상태코드만 남기게 강화한다.

금요일 안전 판정은 최신 자동/외부 증거에 따르며, 실제 필수 항목이 미확인되면 **NO_GO**를 유지한다.


## 7. 2026-10-23 개통 필수 조건과 후속 자동화의 분리

이 문서의 2절 체크리스트는 최초 계획 이력이다. 최신 개통 판정은 아래와 Issue #1243의 실제 증거를 따른다. **38개 장기 업무원장의 완료율을 신규 지점 개통 GO 조건으로 사용하지 않는다.** v0.355/#1319/기존 Google·전체 QA·배포 성공은 재사용한다.

| 구분 | 필요한 일 | 현재 근거/경계 |
|---|---|---|
| 개통 필수·기존 검증 재사용 | STAGED/READY, 대표/보조 역할·권한 회수, 직원·근태·급여·시트·레시피 지점 격리, 배포 무결성 | 기존 main 전체 QA·격리 실제 Auth8/8·Google #39781031886·v0.355 독립 배포 증거 유지. 실패를 자동 성공으로 전환하지 않음 |
| 개통 필수·현재 미확인 | 운영 Hosted Auth의 한국어 초대 템플릿/제목·메일 provider·SMTP 설정 확인 | 읽기 감사에서 관리 자격정보 부재. 공개 /auth/v1/settings HTTP200은 SMTP/템플릿 증거가 아님 |
| 실제 정보·승인 필요 | 공식 지점명/코드·대표 이메일·기존 계정 여부 확정, 운영 생성/연결·초대 발송 승인 | 승인 전 실제 지점/계정/권한/메일 발송/READY 변경 없음 |
| 실제 사람·개통 검증 | 허용된 수신자의 초대 메일 도달·수락·비밀번호 설정·로그인·대표 권한, 대상점 시트 분리 및 보호 대조 | 비밀번호·토큰은 본인이 안전한 화면에 입력. 기존 자료 hash 보존과 실제 신규 개통 후 대상별 검증을 구분 |
| 개통 후 자동화 | POS/배달 매출 자동수집·대사, 공급사 매입 수집/원격 장바구니, 실제 판매량/레시피 소모·원가 원천 자동연계, 재고 현장 UX | 장기 원장에 개발 잔여 유지. 관리자·근태·급여·레시피 앱 개통의 추가 차단 조건으로 사용하지 않음. 기존 POS·공급사 사이트 업무를 통해 매장 운영/발주 가능 여부는 점주 현장 준비로 확인 |

### Hosted 설정 조회의 정확한 권한과 안전한 인증 경로

- 조회: `GET https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth`.
- 필요한 최소 권한: 대상 프로젝트의 **Auth Config / Read**, fine-grained permission **auth_config_read**, OAuth scope **auth:read**. 기존 계정에도 해당 프로젝트 설정을 볼 권한이 있어야 한다. 설정 수정 권한, DB 쓰기, 전체 조직 Owner 권한은 이 조회에 필요하지 않음.
- 공식 근거: [Auth 설정 GET](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [scoped PAT 권한](https://supabase.com/docs/guides/platform/personal-access-tokens), [2026-10-06 scoped PAT 정식 공개](https://supabase.com/changelog/scoped-personal-access-tokens-ga). scoped token은 기존 계정 권한을 좁힐 뿐 권한을 새로 부여하지 않음.
- CI는 전용 `SUPABASE_AUTH_READ_TOKEN`을 우선 사용하고, 이것이 없으면 이미 등록된 `SUPABASE_ACCESS_TOKEN`을 재사용한다. 전용 토큰이 거부돼도 더 넓은 토큰으로 몰래 재시도하지 않음. 토큰은 GitHub Actions Secret 또는 승인된 비밀정보 연결에만 직접 등록하며 채팅/원장/로그에 입력하지 않음.
- 2026-10-23 조회 전용 감사 #39520668442 attempt2(job120274230919)는 `MANAGEMENT_API_CREDENTIAL_ABSENT` 재확인. 현재 환경에 관리 토큰/연결 비밀정보가 없고, 연결 Supabase 도구에는 Auth 설정 GET이 노출되지 않으며, 브라우저에 Supabase 로그인 기록도 없음. 프로젝트 조회 성공을 SMTP 읽기 권한으로 확대하지 않음.
- 앱 anon/service_role 키, DB 접속, 앱 HQ 계정, Google 토큰은 Management API 인증을 대신하지 않는다. 연결 OAuth/기존 Secret의 평문을 추출하지 않는다. 기존 로그인된 관리자 대시보드에서 직접 확인하거나, 위 최소 읽기 권한을 가진 기존/전용 관리 인증을 안전하게 연결하면 감사 재실행 가능.

### 실제 초대 전 준비·QA

- 브랜드 초대 템플릿과 활성화 페이지/신규·기존 계정 분기, 수신 주소·권한·서버 preflight, SMTP 오류/잘못된 사용자/중복 연결 방어를 표적 QA로 확인. 실제 메일 전송·계정/지점 생성은 수행하지 않음.
- Hosted 감사의 6개 엄격 판정은 유지하고, 자격정보 없음/401/403/네트워크/잘못된 응답을 별도로 진단. 설정 원문·메일 서버·SMTP 비밀번호·관리 토큰은 출력하지 않음. PR 테스트 PASS는 Hosted 실조회나 메일 도달 PASS를 뜻하지 않음.
- 기존 8개 필수 workflow와 실수신/실세션/승인·대상별 보호 증거는 모두 유지. POS·공급사 등 후속 항목을 분리해도 필수 실패·미확인은 **NO_GO**이다.


## 8. 2026-10-23 최종 준비 — 인증 URL·실제 초대 화면 검증과 잔여19건 분류

이 절이 현재 판정이다. 앞 절의 날짜별 실패/배포 상태는 이력이며, 이미 성공한 v0.355 배포·Auth8/8·Google E2E·전체 개통 QA를 반복하지 않는다. 원장 **전체38 / 완료19 / 잔여19**. 분류만으로 체크박스를 완료하지 않는다.

### 운영 Hosted Auth 조회에 실제로 필요한 권한

- 현 감사 #39912291051의 MANAGEMENT_API_CREDENTIAL_ABSENT는 **그 job에 전용/기존 토큰이 제공되지 않음**이다. SMTP 고장이나 저장소/조직 전체의 자격정보 부재를 뜻하지 않는다.
- 기존 workflow의 Secret 참조와 production 환경을 조사했다. Edge production 배포는 Supabase 공식 GitHub App의 영수증으로 검증하며 Auth Management 자격정보를 CI에 전달하는 방식이 아니다. readonly job에는 production 환경을 임의 연결하지 않았다. 연결 GitHub 도구는 Secret/조직 관리 API를 지원하지 않으므로 다른 환경·조직·보관함에 기존 토큰이 있는지 소유자가 확인해야 한다.
- 현재 cloud spec52의 secret/runtime/outbound identity binding은 비어 있고, Supabase connector에는 Auth config GET 도구가 없다. Tinyfish default profile의 로그인 사이트도 비어 있다. 연결 OAuth/서비스키를 추출하거나 DB를 통해 비밀을 우회 조회하지 않는다.
- **최소 권한:** 프로젝트 `waluhdgqhwjjwmflhrle`의 `GET /v1/projects/{ref}/config/auth`, **Auth Config Read / `auth_config_read` / OAuth `auth:read`**. 해당 계정 자체에도 Auth 설정 열람 권한이 있어야 한다. DB 쓰기·Auth 설정 쓰기·조직 Owner 권한은 이 조회에 필요하지 않다.
- **기존 권한의 안전한 활용:** 권한 보유자가 기존 승인된 Secret을 읽기 감사 job에 안전하게 바인딩하거나, 프로젝트 범위 read-only 자격정보를 GitHub Actions `SUPABASE_AUTH_READ_TOKEN` Secret에 직접 등록한다. 기존 `SUPABASE_ACCESS_TOKEN`은 전용 값이 없을 때만 사용하며 403 뒤 더 넓은 권한으로 재시도하지 않는다. 토큰/비밀번호를 채팅·Issue·로그에 제출하지 않는다. 로그인된 관리자 화면을 통한 읽기도 가능하지만 현재 저장된 로그인은 없다.
- 이 연결이 이루어진 뒤 **조회 감사만** 다시 실행한다. 읽힌 설정이 다를 때만 구체적 변경안을 검토하고 별도 설정 변경 승인을 받는다. 실제 메일 수신을 config GET 성공으로 대신하지 않는다.

### 이번에 끝낸 승인 전 기술 검증

- 감사 코드의 **인증 URL 검사 누락** 수정: 한국어 초대 HTML/제목·email provider·SMTP host/sender 외에도 운영 Site URL과 실제 신규/복구 초대의 `owner_activation.html` 복귀 경로를 필수 확인한다. 상위 개통 자동점검은 그대로8개이며 HOSTED_AUTH_READ 내부검사는6→8개.
- 실제 GoTrue 소스의 scheme/host/port 동일 출처 허용을 반영한다. 정상 same-origin 설정을 추가 allow-list 항목 부재만으로 실패시키지 않는다. 지원 wildcard를 구현하지 않은 상황은 UNKNOWN/검토 필요로 남기며 성공/장애를 날조하지 않는다. 원격 URL 원문과 인증 query/fragment는 보고하지 않는다.
- 배포된 `owner_activation.js`를 네트워크 없는 VM에서 실행한 **20개 시나리오 PASS**: 대표/보조, 인증정보 누락/만료, 짧은/불일치 비밀번호, 취소/만료/미권한 preflight, 설정/통신/비밀번호/수락 실패, 타지점·HQ context 거부, 안전한 재시도. 승인 실패 전에 password PUT을 하지 않으며 검증 실패 시 세션 저장/매장 이동 없음. 이는 Hosted 실메일/실사용자 성공 증거가 아니다.
- 새 계정은 invite, 이메일 확인은 됐지만 비밀번호 없는 계정은 recovery, 이미 인증·비밀번호가 있는 계정은 명시적 기존계정 연결 경로를 사용한다. 기존 성공8/8과 dispatch/권한 증거를 재사용한다. 대표 확정은 서버의 인증된 uid·확인된 email·비밀번호·미만료 초대의도·정확한 지점에 의해 처리되고 READY 전에도 별도로 검증한다.
- 전체 개통 순서(신규 STAGED→대표 초대/수락→대표 확정→READY→보조→직원/근태/급여→지점 전용 Sheets→레시피)는 기존 격리 브라우저/PG·실 Auth·실 Google 증거로 연결한다. 실점주 단계는 아직 PASS가 아니다.
- 운영 read-only 보호10그룹은 §66의 원본 hash와 일치: 지점244/HQ3/직원10, 원본 근태236(id≤5578), 급여snapshot0/재고이동5/거래3323/raw0/override0/recipe variant245. 현재 근태238은 앞서 기록한 자연 추가2건을 포함한다. 운영 DML·Auth 계정 변경·초대·메일 발송·READY·Google Sheets writer 호출0. 기존 Sheet 전체 셀 hash까지 검증했다고 주장하지 않는다.

### 잔여19건의 실제 완료 조건

A=개통 전 기술·검증 관리7건, B=실제 본인인증·개통 승인2건, C=개통 이후 개발·실자료 검증10건. A의 이미 통과한 기술 부분은 재사용한다. 행 전체가 미완료라는 사실과 현재 개통에 필요한 최소 부분을 함께 표시한다.

| ID | 분류 | 개통에 필요한 부분 / 전체 완료를 위해 남은 일 |
|---|---|---|
| QA-04 | A·필수 | 격리 Auth/SMTP는 성공. 운영 Hosted 설정 읽기와 승인된 테스트 메일의 실제 도착·링크·비밀번호·세션 확인 필요. 테스트 수신자 동의/직접 인증 없이 완료 불가. |
| QA-05 | A·필수 | 실제 Edge→QA GAS→Sheets #39781031886 성공을 재사용. 실제 대상 지점 전용 Sheet 연결·권한·승인 범위 확인은 실개통 때 수행. 기존 Sheet 손상 없이 실업무 정정/복구까지 확인해야 전체 체크. |
| QA-06 | A·필수 | 기존29개 자동 증거와 실제 Auth8 재사용. 공식 주소·약정 대비 실지각/조퇴·실재입사·실제 정정사유·월마감6개 GAP 유지. 개통 시 주소/인증과 안전한 기본 경계는 필수, 실제 한 달 사실/마감은 FIELD-02에서 후속 확인. |
| QA-07 | A·기본 통합 필수 | 개통→권한/직원/급여/레시피/재고 진입·해임 기본 통합은 기존 성공 증거 재사용. 전체 항목의 POS/공급사 원격 연속 시나리오·음성·현장 사용은 C와 연계해 계속 미완료. |
| SEC-01 | A·원래 P0 유지 | **해임 구JWT 거부와 새 장치 로그인 구세션 거부는 다른 조건.** 후자는 WIP #999가 open/unmerged/mergeable=false. 조회상 guard 객체 존재=true, authenticator role hook 설정=false이지만 유효 운영 설정·실효성을 이것만으로 단정하지 않음. main 통합·실제 Auth 세션 발급·익명/직원/HQ3 무회귀·복구/롤백·실기기 검증 및 승인된 활성화가 필요. 기술/배포 미완료이며 단순 수신자 대기로 바꾸지 않음. 개통 필수 제외 승인은 받은 적 없으므로 **차단 조건 유지**. |
| AUTH-01 | A·필수 | 한국어 템플릿/제목 코드만 검증됨. Hosted 실제 적용·SMTP·인증 URL 읽기 및 승인된 메일 수신/스팸 원인 확인 필요. 읽기 불가를 SMTP 장애로 기록하지 않음. 불일치 시 변경안과 설정 쓰기 승인 별도. |
| MTG-03 | A·안전 급여 필수 | 서버 독립 검산·주휴 근거·예외 방어 기존 QA 재사용. 실제 지점 계약/휴게/야간/주휴/정정 승인 정책과 담당자 확인 필요. 급여 최종 지급/월마감은 실제 자료·승인 전 확정 금지. |
| FIELD-01 | B·필수 | 실제 대표 이메일 본인인증·수락/비밀번호/로그인·지점/대표 확정, 보조는 승인된 계정으로 권한/해임·타점 차단을 실제 확인. 합성 사용자로 대체 금지. |
| MTG-04 | B·필수 | 정확한 실제 지점명/코드·주소·개통 증빙, 대표 이메일, 기존 계정 안전 연결 및 지점별 Sheet 연결 범위를 확인하고 생성/초대/READY 승인. 회의 속 두 지점을 임의 실제 대상이라 추정하지 않음. |
| FIELD-02 | C·실자료 | 한 달 원천 근태/계약/주휴/승인·마감·snapshot 실금액 대조. 개통 전 기본 급여 안전성 검증과 구분하며 실제 자료 축적 후 확인. |
| FIELD-03 | C·실자료 | 비시연 POS/매입/재고/공급사 원천을 확보해 실제 장부와 대조. 연동 개발이 미완료인 부분은 단순 현장 대기로 축소하지 않음. |
| MTG-05 | C·개발/원천 | POS1/2·키오스크·배달의 실제 원천 의미 및 키/시간/금액/채널로 정규화·수집 어댑터 개발/검증. |
| MTG-06 | C·개발/원천 | 취소/환불·배달 중복/정산액 분리·의심 매칭 검토 및 실제 대사 개발/검증. |
| MTG-07 | C·실자료/연결 | 기존 SALE 별칭 기능은 배포됨. 실제 판매명/수량·행사/단위별 SKU 매핑과 POS·배달 어댑터 연결/대조 잔여. |
| MTG-08 | C·개발/외부 인증 | 온리원푸드넷 등 공급사 실제 서비스·공식 API/다운로드 지원/약관 조사, 매입/입고 수집·중복/지점 격리 어댑터 잔여. 공식 API 계약 없음. |
| MTG-11 | C·개발/외부 인증 | 내부 입력 보조만 완료. 실제 장바구니 반영/재조회·중복 방지 어댑터와 안전한 본인 로그인 필요. 사용자 허용은 장바구니까지이며 주문·결제는 금지. |
| MTG-12 | C·실자료/회계 | v0.355의 월별 실제 사용 재료비 기능·배포는 완료. 실제 단가/확정 실사/기초기말 수량·회계 기준 확인 후 전체 체크. 미확인 원가를0으로 표시하지 않음. |
| MTG-13 | C·개발/실자료 | 수동 판매량×지점 레시피 비교는 구현. 실제 판매수량·폐기/서비스/관측 원천 연결 어댑터와 허용오차·실물 검증 잔여. |
| MTG-16 | C·개발/현장 | 모바일 재고 UX 일부 구현. POS/매입 자동수집·직원 역할 최소 입력과 실제 직원 실기기 사용성 검증 잔여. |

POS·배달·공급사·장바구니 자동화 자체는 관리자/근태/급여/Sheets/레시피 앱 개통을 막지 않는다. 실제 카페 영업의 공급·계약·장비 준비는 점주가 별도 확인한다. 필수 보안·급여·지점격리 결함이 드러나면 개통 차단으로 처리한다.

### 최종 판정 기준

- 자동8개: STORE_E2E / MANAGER_POSTGRES / HQ_STORE_POSTGRES / TEST_MAIL_GOTRUE / **HOSTED_AUTH_READ** / LIVE_EDGE_GAS_SHEETS / PAGES_PUBLISH / INDEPENDENT_PAGES. 기존7 PASS 재사용, Hosted 읽기만 미충족. 변경 후 main의 새 읽기 감사와 자동점검 결과를 Issue #1243에 연결한다.
- 자동8개 외 실제 증거: Hosted 테스트 메일 수신, 실제 점주 세션/권한·승인, **원장 P0 SEC-01 단일 장치의 통제된 통합/활성화 증거**, 승인된 대상 작업의 운영 전후 보존. SEC-01을 보고서에서 누락하던 외부 차단 목록도 보완하며 자동 PASS로 만들지 않는다.
- **NO_GO**: Hosted 설정/실수신/실인원·승인과 SEC-01 미완료. 실제 지점명·이메일만 받으면 즉시 READY 가능하다고 아직 주장할 수 없다. 관리 읽기 연결 후 설정 검증, 보안 P0 통합·통제된 검증/활성화, 수신자 본인인증·개통 승인을 완료해야 한다. 승인 없이 실제 운영 변경은 수행하지 않는다.


## 9. SEC-01 승인 전 실제 세션·복구 QA 준비

- 원장의 P0를 제외하지 않고, WIP #999의 서버 guard를 `scripts/qa1243_sec01/staged_guard.sql`에 **운영 비활성 후보**로 분리했다. 운영 migration 디렉터리에 넣거나 DB에 적용하지 않는다. 기존 사용자/세션/설정 변경 없이 검토 가능한 설치 후보를 준비한다.
- 기존 후보는 latest_session 값만 비교해, 로그아웃으로 auth.sessions 행이 삭제돼도 같은 미만료 JWT를 허용할 수 있었다. 실제 Auth session의 id와 user_id 존재까지 검사하도록 보완했다. 격리 embedded PostgreSQL에서 해당 회귀와 새/구세션·익명·직원 경계 PASS.
- 새 전용 QA는 SMTP/초대/Google 없이 **실제 GoTrue 발급 로그인·refresh JWT → 실제 PostgREST**를 검증한다. 신규 로그인→이전 JWT 차단, 다른 관리자3명·비관리자 직원·익명 정상, 최신 refresh, 이전 refresh의 권한 복원 차단, logout 뒤 미만료 JWT 거부, 새 로그인 복구, 실제 role 설정 RESET/reload와 재활성화 검증을 각각 기록한다. 기존 Auth8/8·Google E2E를 재실행하지 않는다.
- 복구를 가리는 PGRST_DB_PRE_REQUEST 환경 override를 사용하지 않는다. 격리 role 설정을 실제 RESET/reload한 뒤 이전 JWT의 HTTP 동작이 돌아오는지 확인해야 복구 PASS다. 운영에서는 기존 유효 훅/환경을 먼저 읽고 보존해야 하며 무조건 RESET하면 다른 기존 보호를 없앨 수 있으므로 금지한다.
- 전용 QA는 PGHOST=127.0.0.1 / PGDATABASE=qa1243_sec01 및 명시적 fixture marker로 제한된다. 실제 SMTP·운영 자격정보를 사용하지 않으며 JWT/비밀번호·Auth 응답 원문을 로그/아티팩트에 남기지 않는다.
- 이 결과가 성공해도 **운영 활성화/실기기 PASS가 아니다**. 실제 Auth/기존 PostgREST 유효 설정, 대상/예외·HQ/직원 영향, 설치·활성화·이전 설정 복구안을 검토하고 사용자 명시 승인 후 적용해야 한다. 실제 기기와 승인된 계정의 최종 확인까지 SEC-01 [ ] 및 NO_GO를 유지한다.
- PR/CI/최종 main 새 보안 QA 증거는 Issue #1243에 연결한다. 앱 v0.355·38/19/19 유지. SQL은 자동 적용되지 않으며 새 앱/Google 배포가 필요하지 않다.


## 10. 기존 승인 연결로 Hosted 읽기 해결·실수신 준비·SEC-01 운영 계획 확정

### Hosted 읽기: 기존 승인 범위부터 확인

- 현재 main2cd45e9b/v0.355 기준, cloud spec53의 관리 secret/runtime/outbound binding0 및 로컬 알려진 관리변수 없음, 저장된 브라우저 로그인0. Supabase 연결 SQL은 정상이나 Auth config GET 도구는 없음. GitHub connector의 environment GET은 HTTP400 **미지원 경로**이며 실제 GitHub 권한 거부와 다르다.
- 누락됐던 경로를 보완한다. 기존 repository 전용/legacy Secret이 있으면 그대로 사용하고, **없는 경우만** CI의 기존 GITHUB_TOKEN(Actions Read)으로 `GET environment production` 메타데이터를 조회한다. 존재 확인 없이 환경을 참조하지 않아 새 환경을 만들지 않는다.
- production은 기존 공식 Edge 영수증 workflow에서 사용하는 환경이다. 메타데이터가 확인되고 지원 보호규칙만 있을 때 그 환경의 기존 Secret 문맥에서 Auth GET만 수행한다. `deployment:false`로 배포 객체를 만들지 않는다. required reviewer/대기/branch 정책을 유지하며 custom·미확인 규칙이면 환경 사용을 중단한다. 이미 있는 저장소 토큰이401/403이어도 더 넓은 환경 인증으로 바꾸지 않는다.
- 공식 [environment GET](https://docs.github.com/en/rest/deployments/environments#get-an-environment)은 Actions Read, [workflow 환경](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment)의 deployment:false를 확인했다. Auth API는 여전히 대상 프로젝트의 **Auth Config Read(auth_config_read / auth:read)**만 요구한다. GitHub 환경·Secret 수정/조회 API나 신규 관리권한 생성은 하지 않는다.
- PR/준비 검증에는 관리 인증을 주지 않고, trusted main의 경로 선택·실제 GET 단계에만 기존 Secret을 연결한다. 템플릿·SMTP·운영 URL 원문/토큰은 로그에 내보내지 않는다. 기존 성공한 초대/SMTP8·SEC9·Google·전체 개통·Pages는 재실행하지 않는다.
- 실제 결과/필요한 **한 가지 다음 조치**는 #1243 최종 증거에 기록한다. 기존 환경 승인 대기면 해당 읽기 job 승인 한 건만 요청한다. 실행 후에도 NONE이면 관리자에게 저장소 Actions `SUPABASE_AUTH_READ_TOKEN`에 대상 프로젝트 읽기 전용 연결을 안전하게 등록하는 한 가지 조치만 요청한다. 토큰 원문은 채팅에 받지 않는다. 연결 후 감사 재실행/결과 판정은 AI가 수행한다.

### 실제 Hosted 초대·수신·로그인 실행 준비표

| 단계 | AI가 수행할 준비/확인 | 본인 참여·승인이 있어야 하는 실행 |
|---|---|---|
| 1. 설정 | GET으로 브랜드 초대 HTML/제목, email provider/SMTP, production Site URL·activation callback, 실제 만료기간 확인; 실패 필드별 변경안 준비 | 설정 변경은 불일치가 확인된 뒤 별도 승인. 현재 SMTP 고장을 가정하지 않음 |
| 2. 대상 고정 | 지점ID·정확한 이메일·기존 가입 상태·대표/보조 의도와 허용 작업표 준비. Google QA 메일 사용 동의를 Hosted 초대 동의로 확대하지 않음 | 동의된 테스트 수신자와 시험할 계정/지점 범위·발송1회 승인. 실제 지점 생성/대표 초대 승인과 혼동하지 않음 |
| 3. 안전한 분기 | 미확인/신규→invite; 확인됐지만 비밀번호 없음→recovery; 확인+비밀번호 있음→명시적 기존계정 연결. 기존 계정 비밀번호를 대신 변경하지 않음 | 발송/연결·재초대는 승인 범위 내에서만. recovery 메일은 invite와 다른 템플릿이므로 실제 수신 시 별도로 확인 |
| 4. 수신 | 발송 응답·시각·수신/스팸 여부·브랜드/제목·링크 host/path의 비밀 없는 증거 양식 준비. 타임아웃이면 상태 조회 후 재발송 판단 | 수신자 본인이 메일함에서 확인. 인증 링크·JWT·비밀번호/전체 헤더 원문은 채팅/Issue에 올리지 않음. 필요시 SPF/DKIM/DMARC 결과만 요약 |
| 5. 수락 | 최신 링크·만료기간·취소 상태와 사전 권한 검사. 거부 시 password PUT 없음. 실패/재시도는 기존 VM20/실 Auth8 증거 재사용 | 본인이 링크 클릭·비밀번호12자 이상 설정·로그인. 만료/취소면 승인된 재초대 후 최신 링크 사용 |
| 6. 권한 | 서버 uid·확인 이메일·초대 의도·지점ID·대표 확정 확인. 다른 지점 접근 차단/보조 최소권한·해임 구JWT 확인표 준비 | 승인된 실제 계정으로 확인. STAGED 매장 진입 차단은 정상이며 READY로 우회하지 않음 |
| 7. 종료 | 성공/실패·재시도 가능 단계만 기록. 기존 Sheets/업무자료 쓰기0 유지 | READY·시험 계정 삭제·해임·정리·시트 연결은 각각 승인 범위를 충족할 때만 실행 |

승인 전에는 실제 수신자 이메일을 추측하거나 운영 테스트 계정을 만들지 않는다. 실제 메일 수신·수락·로그인은 아직 PASS가 아니며, 설정 GET의 성공과 분리한다.

### SEC-01 운영 영향·적용·복구·실기기 계획

**현재 읽기 영향 분석:** 본사 관리자3, Auth session 행이 있는 관리자2/행90, 복수 세션 관리자2, latest_session 연결 없는 관리자1, 실제 Auth session이 없는 latest 연결0. 이 기록 수는 **현재 유효 JWT/사용 중 기기 수가 아니다**. 아직 유효한 비최신 JWT가 있으면 단일 장치 정책 적용 뒤 거부될 수 있다. authenticator role의 명시 pre-request 항목0, 기존 guard hash `47c6b36b66f1834371f95a561e3f90d9`. 이것만으로 provider 환경의 유효 훅/설정을 안다고 주장하지 않는다.

1. **적용 전 정지 조건:** 실제 유효 PostgREST pre-request 설정·기존 훅·역할별 설정과 현재 함수 정의/권한/trigger를 읽고 안전한 비공개 복구본 확보. 알 수 없는 기존 훅이 있으면 덮어쓰지 않는다. 서버/설정 출처를 확인할 수 없거나 담당자 재로그인·복구 접속이 준비되지 않으면 활성화하지 않는다.
2. **승인 범위:** 대상 프로젝트·적용 시간·관리자 전 계정에 미칠 세션 정책·본사3 재로그인 가능 여부·승인된 시험 계정·정확한 SQL/이전 설정 복구안을 명시한다. Auth 사용자/비밀번호/직원·근태·급여·재고·레시피·Sheets 삭제/변경을 포함하지 않는다. 이 문서는 승인 요청/승인 자체가 아니다.
3. **후보와 적용 분리:** §9의 staged SQL은 설치 전체 fixture이므로 그대로 운영에 일괄 실행하지 않는다. 현재 설치 객체와 비교해 필요한 함수/권한 차이만 적용하는 최소 migration을 만들고 검토한다. 세션 원장 seed·trigger 재설치가 실제 필요한지 따로 확인한다. 승인 전 DDL·hook·세션 변경0.
4. **실기기 순서:** 승인된 관리자 계정으로 장치A 로그인/정상 조회→장치B 새 로그인→B 정상·A의 실제 관리 RPC 거부→A의 옛 refresh로 권한 복원 불가→B logout 뒤 미만료 JWT 거부→본인 새 로그인 복구. JWT/링크 원문은 기록하지 않는다. 기존 격리9/9를 실기기 PASS로 대체하지 않는다.
5. **함께 확인할 경계:** 본사3 및 신규 대표/보조의 정상 최신 로그인, 직원 로그인/근태·익명 POS·레시피 접근, 지점별 권한·해임 차단. UI의 로그인 표시가 남아도 서버 RPC 거부가 보안 판정 기준이며, 실제 사용자에게 재로그인 안내/복구가 가능한지 확인한다. 다른 사람의 본인인증을 AI가 대신하지 않는다.
6. **즉시 복구 조건:** 정상 최신 관리자 또는 직원/익명 경로 오차단, 타점 접근 허용, 훅/설정 reload 실패, 준비된 담당자의 복구 불가. 우선 **정확히 보관한 이전 설정/함수 정의**로 되돌리고 reload한 뒤 실제 HTTP 경계 확인. 이전 값이 없었다는 증거가 있는 설정만 RESET하며, 다른 기존 훅을 무조건 RESET하지 않는다.
7. **복구 범위:** 정책/함수의 이전 상태만 복구한다. 로그아웃으로 삭제된 Auth session·소비한 refresh token·비밀번호를 되살리려 하지 않는다. 해당 사용자는 본인 새 로그인으로 복구한다. 과거 취약 함수로 되돌려야 하면 원인/남는 위험을 기록하고 추가 활성화를 중단한다.
8. **증거·판정:** 적용 SHA/SQL hash·승인 범위·설정 readback·각 기기의 성공/거부·기존 데이터 기준선 비교·복구 결과만 비밀 없이 보존. 권한 없는 실제 기기 또는 운영 활성화 미실행은 PENDING으로 유지한다.

**AI가 계속할 일:** 기존 권한 문맥의 실제 GET, 승인 후 필요 최소 migration/설정안 작성·검증, 비밀 없는 증거 연결·판정. **사람이 해야 할 일:** 조회 연결에 필요한 관리자 본인 조치 한 건(필요시), 향후 수신자 동의/직접 인증 및 별도 SEC-01 운영 적용 승인·실기기 참여. 현재 v0.355/38·19·19 유지.


## 11. 2026-10-23 기존 인증 경로 확인 결과와 다음 한 가지 조치

- #1323(59체크/실패0) 병합 후 [실제 감사39923060344](https://github.com/koith/attendance-proto/actions/runs/39923060344)를 완료했다. production 메타데이터 GET200·별도 승인/대기 규칙 없음. 기존 환경의 Secret 문맥도 실제로 사용했지만17:13:16 KST 관리 인증이 NONE이어서 Auth 설정 본문은 읽지 못했다. SMTP/템플릿/URL 오류의 증거가 아니다.
- **사용자에게 지금 요청하는 한 가지 조치:** 프로젝트 `waluhdgqhwjjwmflhrle`의 **Auth Config Read**(`auth_config_read` / OAuth `auth:read`) 관리 API 인증을 [저장소 Actions Secret 등록 화면](https://github.com/koith/attendance-proto/settings/secrets/actions/new)에서 `SUPABASE_AUTH_READ_TOKEN`으로 안전하게 연결한다. 기존 승인된 읽기 인증을 활용하고, 비밀번호/토큰을 대화나 Issue에 보내지 않는다. Owner·설정 쓰기·DB쓰기 권한은 필요하지 않다.
- 연결되면 AI가 인증 경로 선택과 실제 GET만 새 Secret 문맥으로 재실행해 메일/SMTP/인증 URL의8개 판정을 마무리한다. 동일 NONE 재시도나 기존 초대Auth8·SEC9·Google·전체 개통·Pages 재실행은 하지 않는다.
- 실수신·수락·로그인 준비표와 SEC01 영향/적용 전 정지 조건·이전 설정 보존/복구·실기기 검증 계획은 §10으로 확정했다. 실제 수신자 동의/직접 인증과 SEC01 활성화 승인은 향후 실행 범위이며 이번에 임의 수행하거나 한꺼번에 요청하지 않는다.
- 앱 v0.355/38·19·19 유지. 기술 main a125554c의 P0 성공·게시 전부 SKIP, 자동점검7/8와 원본 보호 기록은 원장§72/Issue#1243에 연결. 본 절의 최종 기록은 문서 전용 변경이므로 CI/운영 배포를 다시 실행하지 않는다.
