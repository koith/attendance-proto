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
