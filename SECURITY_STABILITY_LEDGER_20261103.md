# 백억커피 운영 보안·안정화 전용 업무원장 (2026-11-03)

> **보안·운영 안정화 전용 정본 / SEC-LEDGER v1**. 기존 `PROJECT_BACKLOG_20261017.md`의 **38건(완료19/잔여19)**과 별도로 집계한다. 기존 원장·Issue·PR·Git 기록을 삭제하거나 재작성하지 않는다.
>
> 범위: 현재 운영 중인 앱의 보안·데이터 보호·복구 및 운영 인수인계. 신규 지점 개통/기능 개발/사업 확장 제외. 운영 중단, 실제 데이터 삭제·계정 이전·권리 이전 금지.
>
> **최신 수용 상태 (2026-11-11): 세부 28항목 중 COMPLETE 12 / OPEN 16. 이번에 R6 실제 운영 두 시점 간 변경분(44 INSERT + 12 UPDATE)을 독립 SQLite에서 재적용·재시도·변조 롤백 검증으로 수용. B1/R2/R3/D5 등은 계속 미완료.** 과거 11/28 및 9/28 기록은 역사적 시점의 결과이며 마지막 X절이 현재 판정이다.
> **민감정보 금지**: 원본 개인정보·PIN·패스워드·토큰·실제 계정·직원·급여 행·사적인 협력 사유를 이 공개 저장소에 적지 않는다. 증거는 건수·해시·시각·권한 경계·테스트 ID 등으로만 기술하며 복구 파일은 접근 제한된 별도 저장소에 둔다.

## A. 사용자 지시 출처 및 원문 보존 상태

1. **2026-10-29 긴급 보안·운영 안정화 지시**: 현재 대화 맥락에서 확인 가능한 원제목, 목적(실운영 유지/협력 관계 변화 시에도 데이터 보호와 안전한 인수인계), 최우선 원칙(중단 금지/근태·급여·직원·지점 데이터 유실·변조 방지) 부분을 기준으로 수용. **해당 날짜의 전체 원문 100%는 현재 출처에서 재확인되지 않음. 이 문서는 원문 전체를 복원한 것이라고 주장하지 않으며, 추정 문장을 사용자 원문으로 위조하지 않는다.** 확인된 원문이 확보되면 별도 추가본으로 기록하고 변경 이력을 보존한다.
2. **2026-10-31 독립 기술 감사 사용자 지시**: [Issue #1442](https://github.com/koith/attendance-proto/issues/1442)의 인용/요약을 별도 출처로 보존. 이는 10-29 원문과 동일한 문서가 아니다. PIN/자동퇴근/중복근태/수기정정/공개 노출·격리 QA·비파괴적 롤백·PC 호환성 요구를 포함한다.
3. **2026-11-03 최종 재지시**: 사용자 대화에서 보안 전용 원장 분리 및 전체 항목 재산정, DB/Auth/Storage 통합 백업·격리 복구, anon/타점 RPC, 함수 21/213, SEC-01, PIN 운영 차단, 자동퇴근 과거 10건 정산, SQL/PR/배포/iPhone 실기 검증 상태 분리, 비인가 운영 데이터 변경 금지를 재확정했다. 사용자 메시지 원문은 이 공개 문서에 그대로 재게시하지 않는다.

## B. 완료 기준 및 현재 완료율

- **완료(COMPLETE)**: 해당 항목의 운영 실제 증거와 복구/회귀 조건까지 충족. 코드 커밋·합성 QA·PR·Pages·SQL 배포만으로 완료하지 않는다.
- **진행(IN_PROGRESS)**: 독립 증거 또는 코드 진전이 있으나 완료 기준 미충족.
- **미착수(NOT_STARTED)**: 범위에 맞는 작업/증거가 없어 실행부터 필요.
- **미검증(UNVERIFIED)**: 구현·자료 존재 가능성이 있으나 필요한 확인 증거가 없음.
- **판정(2026-11-03 기준)**: **2026-11-04 재검증: 전체 18 / 완료 1 / 진행 13 / 미착수 2 / 미검증 2 / 보안 완료율 5.6%**. 최초 2026-11-03 판정 0/18은 아래 이력과 Git 커밋에 남아 있다. 이는 보수적인 종단 간 '완료' 판정이고, 부분 개선이나 PIN 활성화 성과를 부정하는 의미가 아니다. 원래 38건과 합산 금지.

| ID | 우선순위 | 항목/완료 게이트 | 상태 | 확인 증거 / 남은 조건 |
|---|---|---|---|---|
| SEC-S01 | Critical | 전체 DB DDL·데이터 일관성 백업·암호화·접근통제·해시 | IN_PROGRESS | 98 테이블/42,235행 운영 암호화 논리 보관·격리 데이터 적재/전체 행 해시 검증됨(PR #1481). 정식 pg_dump·정합한 DDL/role/sequence·전체 서비스 복구 미검증 |
| SEC-S02 | Critical | Auth 사용자·설정·세션 이전/복구 가능 백업 | IN_PROGRESS | auth 스키마 실제 데이터 2,637행 논리 보관 및 격리 적재; Auth 외부 설정·GoTrue 실로그인·안전한 재인증 미검증 |
| SEC-S03 | Critical | Storage 객체 바이트·메타데이터·정책 백업과 checksum | COMPLETE | 2 버킷/14 실파일/26,890,252 bytes; 파일별 SHA-256 14/14, 원본 DB metadata digest `c0330f9264fb99890933f2bb4a316d71f7b13fc1441a108f117c0d9ef0150546` 일치; 논리 보관본 Storage RLS 정책 3개·버킷/객체 메타데이터 보유; 암호화 ZIP SHA-256 `3fa6fd922c7804f7a6db33c2759456a4739039aba8ab3c9cc25d71952da37274`, AES-GCM+RSA 격리 복호화 전건 PASS; GitHub Actions #41634246360, Drive 소유자만, Library 복제·읽기 비교; 임시 Edge v3 비활성(410) 검증. 단, Storage 서비스 전체 운용 환경 복구는 SEC-S04에 남음 |
| SEC-S04 | Critical | 원본 훼손 없는 격리 복구 및 무결성 비교 | IN_PROGRESS | 실제 운영 논리 데이터 98테이블/42,235행 PGlite 격리 적재/행 해시 PASS와 Storage 실파일 14건 복호화/해시 PASS는 독립 성공. 실제 PostgreSQL DDL/서비스 Auth/Storage 통합 재기동·무손실 컷오버는 미검증 |
| SEC-S05 | Critical | 익명/비로그인 경로에서 출퇴근·관리자 RPC 비인가 행위 차단 | **COMPLETE (실운영 비로그인/위조 JWT 경계 수용)** | 2026-11-13 실제 운영 PostgREST에서 사전 SQL로 10개 민감 **읽기 전용** RPC 전체 `anon EXECUTE=false`, DML 없는 본문을 독립 확인. 10개×익명 bearer·apikey-only·위조 인증 JWT 3모드 = **30/30 HTTP 401/403**, 오도하는 404 허용 안 함. 7개 실테이블 비공개 RLS GET 6개 빈 배열+1개 거부, forged JWT 추가 401. 19개 익명 SECURITY DEFINER 의도된 공개 4/PIN 필수 14/POS 토큰 1 전체 보호 코드 검토(SEC-S07/S08); 실제 Pages 공개 POS 정상·미개통 지점 차단 Chromium/WebKit PC/모바일 4+4 PASS. 실서비스 DML/직원 PIN 사용 0. 무권한 **실제 출퇴근 변경 시도는 수행하지 않았고** 정당 PIN 사용자/실제 관리자 로그인·타지점 권한 E2E는 SEC-S06/09·S3/S4/S5로 분리. QA [PR #1577](https://github.com/koith/attendance-proto/pull/1577), CI `61/61` SUCCESS; 후속 §AB. |
| SEC-S06 | Critical | 본사/지점/직원·타지점 간 고권한 RPC 객체 수준 격리 | IN_PROGRESS | 과거 일부 지점 API 차단 증거 존재; 고권한 전체 RPC 회귀 미완료 |
| SEC-S07 | High | 익명 실행 가능한 SECURITY DEFINER 21개 분류·필요 권한 최소화·회귀 | COMPLETE | 21개 전수 분류(직원 PIN14/스토어토큰1/공개4/내부 트리거2); 내부 2개 anon/PUBLIC EXECUTE 회수, 인증 관리자·실트리거 실행 보존. 실제 운영 PostgreSQL 2026-11-13 재조회: anon 실행 가능 SECURITY DEFINER 정확히 19, trigger 보조 2개 익명 EXECUTE false/연결된 활성 트리거 true. 실 PostgreSQL 16/17 QA #42379448748 SUCCESS, 운영 Pages Chromium/WebKit 공개기능 #42370982709 attempt3 SUCCESS. 원장 후속 §Y 참고. 전체 JWT 권한/실단말/S3/S4/S5는 별도 미완료. |
| SEC-S08 | High | authenticated 실행 가능한 SECURITY DEFINER 함수 전수 ACL·보호 코드 점검 (기존 213→현재 214개) | **COMPLETE (실운영 함수 정의·권한 감사 범위)** | 2026-11-13 운영 PostgreSQL 17의 `pg_proc`·`pg_namespace`·`has_function_privilege`·함수 전체 정의 214/214 전수 확인. 로그인전용 195(관리·권한 검사 193 / 내부 트리거 2), 익명 겸용 19(공개 UI 4 / PIN 검증 14 / POS 토큰 1). 관리 계열 접두 184개(관리 133, HQ 27, 지점 24). 미분류/보호조건 누락/검색경로 미고정/user_metadata 권한 참조 각 0; public/extensions 스키마 anon·authenticated CREATE 모두 false; 내부 관리자 트리거 2개 정상 연결. 재실행 SQL `security/readonly_sec_s08_authenticated_acl_20261113.sql` 실운영 SELECT 재검증 동일. **정적 ACL·코드 전수감사만 수용**하며 실제 역할별 서명 JWT·타지점 HTTP/모바일 실동작(SEC-S05/06/09, S3/S4/S5/D4)은 별도 미완료. 후속 §AA. |
| SEC-S09 | Critical | SEC-01 단일기기 관리자 세션 서버 강제·구세션 차단·롤백/실기기 | IN_PROGRESS | [#998](https://github.com/koith/attendance-proto/issues/998) / [PR #999](https://github.com/koith/attendance-proto/pull/999) WIP; 격리 검증은 존재하나 운영 활성화 미확인 |
| SEC-S10 | Critical | PIN 서버 제한/잠금·우회차단·기존 매장 PC·직원 iPhone 실동작 | IN_PROGRESS | PR #1444/#1447 및 `pin_private.settings.enabled=true` 운영 확인 보고; 전경로 비인가 시도·현장 PC/iPhone 검증 없음 |
| SEC-S11 | High | 과거 자동퇴근 10건 실제 근로 인정/차액·주휴·시트 독립 검산 | IN_PROGRESS | PR #1452 병합, v0.384 Edge v76/Pages 배포 보고; 과거 10건 직원별·월별 차액은 **미산출** |
| SEC-S12 | High | 원본 보존하며 잘못된 급여의 확인·정정 권한 절차, 일치 증빙 | UNVERIFIED | 과거 급여·정정 원본 수정 금지; 적법한 확인자 승인 전 실제 정정/마감 금지 |
| SEC-S13 | High | 수기 근태 원자적 저장·중복/겹침 차단의 운영·현장 증명 | IN_PROGRESS | PR #1450 병합·운영 RPC 존재 보고; 기존/타점·경합 실기기 검증 없음 |
| SEC-S14 | High | 미래시각 정정으로 IN/OUT 방향 반전 차단 확인 | IN_PROGRESS | PR #1454 병합 및 운영 `punch` 시간 조건 보고; 직원 실사용 검증 필요 |
| SEC-S15 | High | 공개 저장소 현재·과거 이력의 개인정보/비밀 노출 평가와 안전 조치 | IN_PROGRESS | PR #1448 탐지, PR #1449 일부 이메일 치환; 과거 Git·배포물 완전 검수 미완료 |
| SEC-S16 | Critical | 롤백 시 운영 중 신규 근태/급여 무손실·DB 코드 분리 | **COMPLETE (실백업 간 변경분 재적용 범위)** | 실제 운영 3시점 암호화 보관본 101테이블 / 42,329→42,373→42,376행 독립 복호화; 실증분 44 INSERT+12 UPDATE 이어 3 INSERT+2 UPDATE를 격리 SQLite 트랜잭션에 순서대로 적용하고 최신 42,376행 **전체 PK·행 내용 일치** PASS. 이중 재실행 신규 변경 0, 데이터 충돌 시 rollback·원본 불변 PASS. 출퇴근 이벤트, 계약·시트동기화 상태 포함. 비공개 Library에 두 번째 암호화 델타·실증검증기 저장하고 재수신 SHA256 일치. **실제 급여 지급액 확정/임의 중간시점 PITR/PG17 전체 복원·현장 컷오버는 포함하지 않으며** SEC-S11·S12, B1/R2/R3/A3/D5 등 별도 OPEN. 후기 §Z. |
| SEC-S17 | High | 코드/DB/Auth/Storage/Edge/GAS/Sheets 구성·의존성·복구·감사 인수인계 패키지 | IN_PROGRESS | `security/SEC_S17_RECOVERY_HANDOVER_PUBLIC_20261106.md` 공개 기술지도 신규 작성: 구성·의존성·백업/세션/Storage/GAS·Sheets 검증·오프라인 키·RPO/RTO 미입증·롤백 순서·승인 체크리스트 구분. **실제 접근권한/키 이중 보관/복구 인수인계·비공개 운영절차 증명 없음**; 인수인계 완료 아님. |
| SEC-S18 | High | 기존 매장 PC·iPhone 실기·관리자/직원·급여/Sheets 정상운영 검증 | UNVERIFIED | CI/PWA/Pages 결과와 현장 PASS를 구분; iPhone 실기 검증 자료 없음 |

## C. 2026-11-03 읽기 전용 운영 점검

- Supabase 프로젝트: `ACTIVE_HEALTHY`, PostgreSQL 17; **조회 성공은 정상운영 전체 증명이 아님**.
- 민감값을 열람·복사하지 않는 카운트: 직원 12, 근태 원본 이벤트 322, Auth 사용자 6, Auth 세션 109, Storage 객체 메타데이터 14/버킷 2, payroll snapshot 0.
- 함수 권한: `public` SECURITY DEFINER 총 251개 중 anon EXECUTE 21개, authenticated EXECUTE 213개. 21과 213은 서로 배타적인 집합이 아님. 위험도는 비인가 호출 시 실제 데이터 노출/변경 및 비즈니스 필요성으로 별도 판정.
- 단순 함수 본문 문자열 검사만으로 인증/지점 검증이 없다고 단정하지 않는다. 위임 호출/다른 보호 계층/공개 정책이 있을 수 있다.
- **전체 DB/Auth/Storage 백업 완료 증거 및 격리 복원 PASS는 아직 없음.** 부분 JSON 사본은 대체 수단이 아니다.

## D. 삭제·변경·누락의 확인 가능한 이력

| 일시/증거 | 확인된 사실 | 판정 |
|---|---|---|
| 2026-10-29 대화 일부 | 보안·안정화 우선, 운영중단·유실 방지 지시가 있었음 | VERIFIED_PARTIAL; 전체 원문 미복원 |
| 2026-10-31 [Issue #1442](https://github.com/koith/attendance-proto/issues/1442) | 별도 독립 감사 지시 핵심 부분이 원문 인용과 AI 실행해석으로 기록 | VERIFIED; 10-29 원문과 혼동 금지 |
| 2026-11-02 [PR #1449](https://github.com/koith/attendance-proto/pull/1449) | 공개 문서의 일부 개인 이메일 표기를 치환하는 변경 | VERIFIED; 보안 지시 삭제 증거는 아님 |
| 2026-11-03 [commit a46060c](https://github.com/koith/attendance-proto/commit/a46060c2831646d7aa6f6ad6678a4664b8b4bd29) | 기존 38건 원장에 보안/P0 롤아웃 진행표를 **추가·혼합** | VERIFIED; 기존 항목 38/19/19 체크수 유지 |
| 2026-11-03 본 분리 파일 | 운영 보안 전용 18개 게이트·완료율·증거·보존 원칙을 독립 추적 시작 | NEW; 10-29 원문 전체 복원과는 구분 |

**아직 미입증:** 10-29 지시 원문의 어떤 문장이 언제 실제 삭제됐는지, 누가 의도를 가지고 삭제했는지. 찾지 못한 원문이나 개인 사유를 추정으로 공개 기록하지 않는다. 모든 후속 사용자 지시의 완료 게이트 변경은 사용자 승인 기록이 있어야 하며, 원문·이전 판정·새 판정을 나란히 남긴다.

## E. 배포·변경 게이트 / 다음 작업

1. **읽기 전용**: 1차 백업 보유 상태, 전체 백업 수단/검증, 민감 파일 접근통제와 격리 복구 스펙 확인.
2. **격리 환경**: 21/213 함수 호출 가능성·인증·타점 테스트 매트릭스와 최소권한 GRANT/REVOKE 마이그레이션+복구 SQL 준비. **기존 직원/익명 POS/공개 레시피 호출을 일괄 차단하지 않는다.**
3. **운영 변경 전**: 백업/무손실 복구 계획→격리 실패 재현→수정→전체 회귀→코드 PR/병합·DB SQL·Edge·Pages·실기 검증 **각각 별도 영수증**. 고위험 SQL/Auth 세션 적용은 별도 승인과 롤백 준비 없이 하지 않는다.
4. **급여**: 자동퇴근 10건 및 기존 정책 충돌 가능성을 원본 기준 읽기 전용 재산정; 예상액·차액·근거를 비공개 보관하고 승인된 담당자 확인 전 정정하지 않는다.
5. **인수인계**: 구성요소/버전/복구 소요·데이터 최신성(RPO)/운영 책임자/복구 증거; 비밀정보 및 협력 종료 사유는 공개 저장소 외 별도 접근통제.

## F. 2026-11-03 추가 검증 영수증 (읽기 전용)

- 운영 PIN 서버 보호 토글: `pin_private.settings` 단일 설정 행 **enabled=true** 직접 확인. 반복 비인가 시도/지점·iPhone 수용이 완료됐다는 의미는 아니다.
- Security Advisor: `anon_security_definer_function_executable=21 WARN`, `authenticated_security_definer_function_executable=213 WARN`, `rls_enabled_no_policy=63 INFO`, `auth_leaked_password_protection=1 WARN`. RLS 정보경고를 실제 데이터 열람 허용으로 단정하지 않는다.
- 운영 카탈로그: `public` SECURITY DEFINER 251개, 익명 EXECUTE 21, 인증 EXECUTE 213(익명 21은 인증 213에 포함), EXECUTE TO PUBLIC 3, 익명 집합 내 트리거 전용 2, 관리자 접두 함수 133. 실제 ACL/반환형 직접 집계. **두 트리거는 일반 HTTP RPC 대상으로 볼 수 없다.** PUBLIC 권한 3개를 포함해 무차별 REVOKE 금지.
- 읽기 전용 SQL [RPC 권한 분류](security/readonly_rpc_acl_audit_20261103.sql) 2개 SELECT 실행 검증: 함수별 213행을 공개 기능 4/일반 공개 워크플로 15/트리거 2/관리자 133/본사 27/지점 22/기타 10으로 분류. 분류는 실제 권한 우회 취약성을 증명하지 않는다.
- 과거 자동퇴근: `system:auto-close` ADD 총22, 무효12, **유효10**(2026-09:4/2026-10:6) 직접 조회. [읽기 전용 재산정 SQL](security/readonly_auto_close_impact_20261103.sql)의 정규식 검증/운영 재실행 결과: 9월 출근 연결4건·15.96시간, 10월 연결4건·25.66시간, **합계 8건·명목상 41.62시간**, 출근 연결 안 된 2건. 이 값은 지급시간/과지급액이 아니며, 개인별 정책·급여 이전/이후 차액은 여전히 미검증. 최초 집계는 무효 12건을 연결 자료에서 제외하지 않아 9건/58.62시간으로 과다 추정되었으므로 폐기하고 본 재검산으로 교정.
- Google Drive 보안 부분 스냅샷 2026-11-01/02(2건)/03(1건) **4파일 실제 메타데이터 확인**: 소유자 한 명 권한, `shared=false`. 그러나 전체 DB·Auth·Storage 덤프, 암호화/복호화, 고립 복구 성공 증거 없음.
- Storage 메타데이터 2 bucket, 14 objects, 표시 파일 크기 합계 26,890,252 bytes. 이는 파일 본문 백업 여부 증거가 아니다.
- Supabase Edge `server-sync-sheet` **v76 ACTIVE** 직접 조회. 앱 코드·급여 계산·실제 iPhone 현장 동작까지 검증했다는 의미는 아니다.
- **이번 점검의 운영 변경: 0**. 카탈로그/합계/Drive 권한 읽기만 수행. 이후에도 SQL 적용, 권한 회수, 실제 급여 정정은 안전한 격리 복구와 승인 근거를 먼저 요구한다.

### 상태 전이 기록 형식
`YYYY-MM-DD HH:mm KST | SEC-Sxx | 이전상태→새상태 | source/commit/PR/SQL receipt/Edge/Pages/field receipt | VERIFY_LEVEL | 운영 데이터 쓰기 여부 | 승인 근거 | rollback/후속`

> **중단 없는 정상운영/이전 가능 판정: NO_GO (UNVERIFIED).** 별도 서비스 종료/이전 지시가 아니다. 백업/복구·고권한 경계·SEC-01·iPhone 현장 검증이 끝날 때까지 신규 개발 없이도 안전하다고 단정하지 않는다.


## G. 2026-11-04 실제 Storage 완료 조건 재판정 (SEC-S03)

- 이전 판정은 **NOT_STARTED**(2026-11-03 최초 원장). 현재 **COMPLETE**(2026-11-04 독립 확인). 기존 구 판정/발행 문서는 Git 이력에 그대로 보존한다.
- 원본 DB 읽기 전용 재조회: 버킷 **2**(비공개 버킷 1개에 14개, 공개 버킷 1개에 0개), 객체 **14**, 바이트 **26,890,252**, storage RLS 정책 **3**.
- GitHub [Actions #41634246360](https://github.com/koith/attendance-proto/actions/runs/41634246360) 실제 백업 성공; 암호화 산출물 36,021,107 bytes; [PR #1484](https://github.com/koith/attendance-proto/pull/1484) 정확한 immutable OIDC subject 검증 및 병합; 별도 수집 후 임시 Edge v3 차단 전용 410 코드 배포·읽기 확인.
- 기존 암호화 ZIP을 별도 로컬 환경에서 **개인키로 복호화해 실제 14개 파일 본문**을 복원, 파일마다 메타데이터 size/actual size/SHA-256 일치, 중복·누락 0, 원본 SQL metadata digest 일치. Zip SHA-256은 위 SEC-S03 행 기록과 동일.
- 기존 논리 보관본 OpenPGP 복호화도 독립 재검증: `storage.buckets` 2행, `storage.objects` 14행, `pg_policies`의 storage RLS 정책 3개 존재 확인. **실제 서비스 레벨 Storage API/RLS 복원은 SEC-S04 범위로 남긴다.**
- 기존 Drive 비공개 소유자 전용 파일 및 ChatGPT 개인 Library의 암호문 백업 사본을 보존. 기존 유일한 키 삭제·교체 없음. 로컬 RSA 개인키 파일 권한 `600` 적용 확인. **키의 독립적 오프라인 이중 보관은 아직 미확인**(SEC-S17 후속).
- **보안 전체 완료율 = 1/18 (5.6%)**. DB/Auth/통합 복구 및 새 AI 자동화 보안 항목은 합산하지 않는다. 종합 **NO_GO** 유지.


## H. 2026-11-06 보안 원장 실개발 진행 상태 정정 (리뷰 브랜치)

- **독립 증거 출처**: 기존 PR #1504 HEAD `6e0d388f69cf54f407339af4841ddaea77bd4086`, CI **50/50 SUCCESS**; 상위 PR #1506 HEAD `19961226535f384b14b1b4d7180e488eb530d183`, CI **38/38 SUCCESS**. 합성 모델은 삭제/정정 등 실제 운영 DB 트랜잭션/동일 스냅샷 무손실을 입증하지 못한다.
- **SEC-S16 상태 정정**: `NOT_STARTED → IN_PROGRESS`. 위 PR의 `delta_guard.mjs`·`reapply_guard.mjs`와 2개 `*.test.mjs`를 기존 코드 SHA가 일치하도록 최신 main 기준 리뷰 브랜치에 반입. 새 브랜치 GitHub CI/운영 검증은 별도 증거로 기록해야 한다.
- **SEC-S17 상태 정정**: `NOT_STARTED → IN_PROGRESS`. `security/SEC_S17_RECOVERY_HANDOVER_PUBLIC_20261106.md` 비밀정보 없는 의존성/복구 절차/승인 체크리스트 작성. 개인키·운영 데이터·실제 소유권·권한 변경은 일절 수행하지 않았다.
- **정본 반영 전 주의**: 이 문서의 H 섹션은 검토 브랜치의 코드 진행 증거이며 **main에 병합·검증되기 전에는 main 정본 상태 변경이 아님**. 이후 CI PASS 및 안전한 메인 반영을 별도로 검증한다.
- **완료 건수 불변**: 과거 2026-11-04 판정은 당시의 이력으로 보존. 본 브랜치 기준 현재 전체 18건 = `COMPLETE 1 / IN_PROGRESS 15 / NOT_STARTED 0 / UNVERIFIED 2`; **종단 간 운영 완료율 1/18 (5.6%)로 변함없음**. 코드 진행 상태 개선과 운영 완료 게이트를 혼동하지 않는다.
- **다음 실제 완료 게이트**: SEC-S16은 독립 PostgreSQL에서 단일 복원 기준시점·운영 구조와 일치하는 신/구 이벤트 및 급여 스냅샷 델타 증거, 장애 중 쓰기와 누락·중복을 검증해야 한다. SEC-S17은 승인된 비공개 접근권한·키 이중 보관·소유권·개별 서비스 복원 runbook 및 실제 인수인계 감사 로그가 필요하다.

## I. 2026-11-07 실제 실행 영수증 및 잔여 28항목 (보안 전용)

> 이 단락은 기존 18건 원장과 별도로 사용자 요청에 맞춰 **작업 가능한 28개의 세부 수용 조건**을 추적한다. 28개와 SEC 18/AISEC 7의 완료 건수를 더하거나 서로 대체하지 않는다. 기존 SEC-S03 완료는 보존한다. 프로그램 합성 테스트/PR 병합과 **실제 운영 전체 백업·복원**은 별도 상태다.

### 실증 결과

- 기존 [PR #1520](https://github.com/koith/attendance-proto/pull/1520)이 main `86a1fb52343daefbce172695d174579fe57de11f`에 **병합됨**. PostgreSQL MVCC 스냅샷·암호화 덤프·테이블 데이터 해시·독립 복원 검증 코드 반영. [PG16·PG17 독립 CI #42329693647](https://github.com/koith/attendance-proto/actions/runs/42329693647): 37/37 + 37/37 PASS. **실제 백업이 생성된 증거가 아님**.
- [PR #1522](https://github.com/koith/attendance-proto/pull/1522) main `eacfd8cda50e3e250dfbf0f06d676ec76ffbf8a2`: GitHub 인증된 소유자/정확한 Issue #1492/정확한 본문만 허용하는 백업 실행 경로 추가. 기존 `production-backup` 보호 환경/비밀값 필수 검사 유지. [CI #42333620967](https://github.com/koith/attendance-proto/actions/runs/42333620967) PG16 40/40 + PG17 40/40 PASS.
- [운영 백업 실행 #42333785144](https://github.com/koith/attendance-proto/actions/runs/42333785144): 실제 시작했으나 `BACKUP_BLOCKED_PROTECTED_ENV_NOT_READY`로 **pg_dump·Storage 수집·백업 아티팩트 생성 이전에 실패**. `SEC_BACKUP_ENV_READY` 빈 값. 운영 원본 백업 생성·격리 복원 수용 조건 **NO_GO**.
- [PR #1523](https://github.com/koith/attendance-proto/pull/1523) / [자격증명 존재 확인 #42334093226](https://github.com/koith/attendance-proto/actions/runs/42334093226): repository-scope DB URL/DB password/service-role key/Management API 토큰 모두 false. 기존 `SUPABASE_AUTH_READ_TOKEN`만 존재 true. 실제 비밀값은 표시·복사하지 않음. 환경 단위 Secret은 이 조회로 판단 불가하나 #42333785144 실백업 작업의 네 값은 비어 있었음.
- [PR #1525](https://github.com/koith/attendance-proto/pull/1525) / [읽기 전용 대체 경로 검사 #42334456773](https://github.com/koith/attendance-proto/actions/runs/42334456773): 저장된 `SUPABASE_AUTH_READ_TOKEN`으로 공식 Management API에 값 `SELECT 1` 전송, 응답 본문 저장 없이 HTTP **401** 확인. 이 토큰으로 해당 endpoint를 사용할 수 없다는 **해당 경로만** 실패 판정.
- [P0 Pages #42334456757](https://github.com/koith/attendance-proto/actions/runs/42334456757): 빌드·배포·동일 실행 검증 PASS; 앱 UI/Edge 변경 파일 없음, 소스 앱 버전 v0.384 유지. **주의: 보안 코드만 main 병합해도 기존 워크플로가 Google Sheets '2026-11' 새로고침을 실행**했음(작업 로그 `Sheet refreshed after deployment`). 따라서 이번 작업에서 `운영 데이터 변경 0`이라고 기술하지 않는다. 실수로 데이터가 변조되었다는 증거도 없고, 현장 재검증은 별개다. 다음 비운영 메인 병합은 기존 검증된 `[SEC-NO-OPERATING-WRITE]` 태그와 정확한 변경 파일 허용 목록을 사용해 Pages/Sheet 재실행을 방지한다.
- 운영 Supabase 읽기 전용 카탈로그: 관련 비시스템 스키마 10개, 기본/파티션 테이블 115개(관리형 스키마 포함), Storage 2버킷·14개 객체·메타데이터 26,890,252바이트. 익명 실행 가능한 SECURITY DEFINER 21개: PIN 인자 14, POS 세션 토큰 1, 공개 함수 4, 트리거 2. 공개 카드/직원 선택 함수는 직원 이름·근무 상태를 공개할 수 있으므로 실제 서비스 UX·정보 노출 검증 없이 무차별 권한 회수하지 않는다. `anon` 및 `authenticated`는 `public`/`extensions` 스키마 CREATE 권한 없음.
- 총괄 영수증: [Issue #1492 최신 기록](https://github.com/koith/attendance-proto/issues/1492#issuecomment-6701744994). 운영 복구 가능 판정 **NO_GO**. 기존 SEC-S03 완료 조건 유지, 전체 SEC 18건 완료 1건에서 증가하지 않음.

### 세부 28항목 수용 체크

| ID | 세부 작업 | 2026-11-07 판정/부족한 증거 |
|---|---|---|
| B1 | 실제 운영 전체 DB 백업 | BLOCKED: DB 접속 자격증명/백업 실행 환경 |
| B2 | 직원·근태·급여·관리자·지점 DB 포함 | UNVERIFIED: 실제 전체 pg_dump TOC·행 데이터 |
| B3 | Auth 사용자·운영 설정 백업 | IN_PROGRESS: 과거 논리 데이터 일부, hosted 설정 미확보 |
| B4 | Storage 전체 객체 바이트 백업 | **VERIFIED COMPLETE**: SEC-S03 전체 14/14 실제 암호화 파일·독립 복호화·해시 일치; 11/07 원본 전체 목록·바이트·최종 수정시각 재확인, 변경 없음 |
| B5 | 암호화·소유자 통제 장기 보관 | IN_PROGRESS: 과거 암호화 사본 보유, 최신 일괄본 없음 |
| B6 | 독립 보관 키·실제 복호화 | IN_PROGRESS: 과거 SEC-S03 실제 복호화 PASS, 최신 전체 키/이중 보관 미확인 |
| R1 | 격리 복원 환경 준비 | **VERIFIED COMPLETE**: PG16/17 실제 독립 격리 클러스터 생성·암호화 테스트 백업 복호화·복원·무결성 검증 PASS; 운영 전체 백업 데이터 복원은 R2로 별도 미완료 |
| R2 | 실제 운영 전체 백업 복원 | BLOCKED: 전체 백업본 없음 |
| R3 | 원본/복원본 데이터·DDL·ACL·sequence 일치 | SYNTHETIC VERIFIED, 실백업 불가 |
| R4 | Auth 실로그인·세션 테스트 | **VERIFIED COMPLETE (격리 실인증 서버 수용 한정)**: 실제 GoTrue/SMTP 메일·로그인 E2E 14/14 + GoTrue 발급 JWT·PostgREST 세션 E2E 9/9, 독립 disposable DB/API. 운영 원본 Auth 복원·운영 실사용자 세션은 B3/R2/S5 별도 (N절) |
| R5 | Storage 파일·서비스 API 복원 | IN_PROGRESS: 역사적 파일 복호화 성공, 서비스 재가동 미검증 |
| R6 | 원본 불변·오류/재시도 방어 | SYNTHETIC VERIFIED, 실제 전체본 검증 대기 |
| S1 | 익명 SECURITY DEFINER 21개 분류 | VERIFIED: 14 PIN/1 토큰/4 공개/2 트리거, SQL catalog 읽기 |
| S2 | 불필요한 익명 권한 제한 | **VERIFIED COMPLETE**: 운영 DB anon SECURITY DEFINER 21→19, 내부 관리자 트리거 2개 PUBLIC/anon EXECUTE 회수, PG16/17+운영 DB ACL+실제 Pages Chromium/WebKit 공개 UX 검증 통과 (M절) |
| S3 | 본사/대표/보조/직원 권한 격리 | IN_PROGRESS: 권한별 E2E 필요 |
| S4 | 지점 간 객체 수준 접근 차단 | IN_PROGRESS: 실제 세션·타지점 호출 필요 |
| S5 | 관리자 단일기기 서버측 세션 차단 | IN_PROGRESS: 구 JWT 실제 거부 증거 필요 |
| S6 | GitHub 비밀·PAT 의존성 점검 | **VERIFIED COMPLETE (감사·의존성 진단 한정)**: 158/158 GitHub workflow 직접 Secret·PAT·Var 참조 전수 확인, 실제 비밀값 노출 없는 존재 검사·Management 401·백업 protected-env 실패 원인 확인. 미등록 비밀값·실제 백업 성공·토큰 발급/갱신은 별도 B1/D5 과제 |
| A1 | 출퇴근 동시성·중복 차단 | IN_PROGRESS: 독립 합성 QA 존재, 운영 전경로 미검증 |
| A2 | 근태 정정·삭제 이력 보존 | **VERIFIED COMPLETE (감사기록 보존 범위)**: 운영 private 감사 INSERT 1건(실제 2026-11-09 시스템 자동퇴근 정정)이 현재 원본 행 JSON과 1/1 완전 일치, 사전/사후·시간·PK 검증. event_corrections·correction_requests INSERT 트리거 2개, 3개 원본 테이블 UPDATE/DELETE·TRUNCATE 방어 6개, private 감사 UPDATE/DELETE·TRUNCATE 불변성 2개 활성. anon/authenticated private USAGE·SELECT 모두 false; PG16/17 합성 정정·수정·삭제·롤백 검증 기존 CI 통과. 과거 원본포인터 없는 VOID 8건은 운영본+11/09·11/11·11/12 개인 암호화 실백업에서 전건·동일 원문 보존, 실제 펀치 포인터/시각/유형 없고 두 서버 실근무 투영에서 기여 0인 과거 **무효 삭제요청 이력**으로 분리. *당시 의도한 삭제 대상은 확인 불가하여 업무적 판단·정정 미진행*, SEC-S12/A3의 지급·정정 영향 조사로 유지. 이번 운영 쓰기 0. 재현 SQL `security/readonly_sec_a2_live_audit_orphan_custody_20261113.sql`, 개인 재검증기 `/Attendance-Recovery/tools/sec_a2_private_orphan_custody_verify.py`, 후속 §AC. |
| A3 | 급여 마감·정산 일관성 | IN_PROGRESS: 합성 QA 존재, 과거 10건 개별 검산 미완 |
| A4 | Google Sheets 동기화·복구 | IN_PROGRESS: 실제 새로고침 성공, 손실 없는 격리 복구 미검증 |
| D1 | 복구 코드 PR #1520 안전 검토·병합 | VERIFIED: main commit 86a1fb52 |
| D2 | 전체 CI·회귀 검증 | IN_PROGRESS: 관련 PR 합성 테스트 통과, 종단간 전체 미완 |
| D3 | 배포 영향·버전 확인 | **VERIFIED COMPLETE**: 최종 Pages 실제 배포 HTTP 200/v0.384/JS 일치·비인가 급여 401, 후속 두 security-only main에서 UI/Edge blob 불변, P0 패스와 배포/Sheets SKIPPED 검증 |
| D4 | PC·iPhone 실기 기능 수용 | UNVERIFIED: 실제 기기 검증 증거 없음 |
| D5 | 주기 백업·보관·실패 알림 | BLOCKED: 실제 암호화 백업/복원 선행 필요 |
| D6 | 완료 원장·최종 보고 | IN_PROGRESS: 증거 갱신 중, 최종 NO_GO |

**2026-11-07 재검증 결과, 28개 세부 항목의 최종 완료는 S1·D1·B4·D3·R1·S6의 6건이다.** 별도 합성 부분 완료, 과거 Storage 백업, 현재 실제 운영 복구 완료는 구분한다. 최종 전체 보안 18개 운영 수용 완료는 여전히 **1/18**이다.


## J. 2026-11-07 B4·D3 최종 수용 완료 판정 (2/28 → 4/28)

> 이 전이는 **동일한 기존 28항목 정의**를 유지한 실증 수용 판정이다. B4는 기존 SEC-S03의 중복 미계상 수정이고, D3는 현재 배포 영향/버전 확인 완료다. 운영 전체 DB/Auth/Storage 통합 복원과 현장 PC·iPhone 실기 검증은 포함하지 않는다. 이전 이력 2/28·SEC 1/18은 역사적 기록으로 보존한다.

### B4 — Supabase Storage 전체 실파일 백업: VERIFIED COMPLETE

1. 원본 [SEC-S03 Storage encrypted GitHub Actions #41634246360](https://github.com/koith/attendance-proto/actions/runs/41634246360) **SUCCESS** (2026-11-03 12:18 UTC), 암호화 아티팩트 `sec-storage-enc-20261103` (ID **13229353638**), **36,021,107 bytes**, 아티팩트 sha256 **3fa6fd922c7804f7a6db33c2759456a4739039aba8ab3c9cc25d71952da37274**, 확인 시 `expired=false`, 보관 만료 2026-12-03 12:18 UTC. 일반 사용자·GitHub 공개 저장소에 평문 파일이나 개인키 게시 안 함.
2. 위 원장 G절에서 **실제 파일 14개를 독립 복호화해 개별 파일 크기/본문 SHA-256·메타데이터를 비교하여 누락/중복 0건** 검증한 영수증을 보존. 임시 Edge는 저장 후 응답 410으로 차단됨. 이 완료 성과는 임의의 합성 복원 테스트와 다르다.
3. **2026-11-07 운영 Storage READ ONLY 재검증** (`BEGIN TRANSACTION READ ONLY; ... ROLLBACK`): 비공개 employee-docs **14개 / 26,890,252 bytes**, 공개 recipe-thumbnails **0개**. 직원 파일의 가장 최근 `updated_at`은 **2026-11-01 12:45:01.624675 UTC**, 즉 백업 시점 이전. 11월 4일 이후 새로 업데이트된 객체 **0개**. 기존 백업 로스터와 원본 현시점의 버킷/개수/크기가 일치하며 이후 객체 변경 증거 없음.
4. **한계 구분:** 이번 별도 DB/Auth 전체 백업은 여전히 미완료(B1~B3). 기존 GitHub 아티팩트의 30일 보관은 **장기·독립적 보관을 보장하지 않으며** B5/D5는 미완료. Storage 실제 Supabase API 복원·RLS는 R5에서 별도 검증. 이 수용 판정은 B4 하나에 한한다.

### D3 — 배포 영향·운영 버전 확인: VERIFIED COMPLETE

1. [최종 실제 Pages 배포 #42334456757](https://github.com/koith/attendance-proto/actions/runs/42334456757): P0 Gate / Build Pages / Deploy GitHub Pages / Same-run Pages 검증 모두 **SUCCESS**. 검증 로그에 `PASS live Pages v0.384: HTTP 200, matching JS assets, protected production payroll HTTP 401` 및 실제 모바일/데스크톱 브라우저 스모크 PASS 포함. 실기 아이폰/매장 PC 증거는 D4로 계속 **UNVERIFIED**.
2. 위 배포 커밋 `4632f0e7a3a1aa58a548a6a4836f2861c7e348b8`과 최신 보안 병합 커밋 `961bb22b53d07c674105a14e54402f81681da6f6`의 GitHub compare **2 commits, 정확히 비운영 문서/테스트/워크플로 5개 파일만 변경**. `index.html` Git blob SHA `b72b850e746185dc4b43098424d1d0614f0e6c6b` 동일, `server-sync-sheet/index.ts` blob `afb7838ebe0fdf06ecf7fba1c800c32f182ce186` 동일. 앱 소스 버전 **v0.384**.
3. [문서 수정 건 P0 #42335533678](https://github.com/koith/attendance-proto/actions/runs/42335533678)과 [관리자 QA 보강 P0 #42361285595](https://github.com/koith/attendance-proto/actions/runs/42361285595)는 정확한 no-operating-write 변경 목록 검사 성공 이후 **Build/Deploy Pages, Same-run Validation, Safari publish 전부 SKIPPED**. 따라서 두 보안 전용 업데이트는 불필요한 새 배포나 Google Sheets 새로고침을 만들지 않음.
4. **관찰한 부작용도 보존:** 그 이전의 코드 전용 [#42334456757] 배포는 실제로 **2026-11 Google Sheets 새로고침**을 수행했으며 로그에 PASS 기록. 그 부작용을 삭제하거나 실행 안 했다고 주장하지 않음. 이후의 정확한 비운영 파일만 대상으로 하는 가드로 중복 실행을 방지한 것을 실증. 이후 실제 앱 변경은 정상 배포·운영 QA로 검증하고, 모든 보안 수정에 예외 없이 skip 태그를 붙이지 않는다.

### D2 — 전체 자동 CI/회귀 검사: 별도 미완료 유지

- 최신 main `961bb22b...` GitHub check-runs **68개 중 43 SUCCESS, 22 SKIPPED, 3 FAILURE**. 3개의 실패는 `QA1243 Friday opening hard readiness gate / prelaunch-readiness` (관련 Actions #42361408908, #42361397202, #42361397850). 첫 번째 최종 점검 로그는 필수 8개 중 4개만 통과했고, 테스트 메일·호스티드 Auth 조회·Edge→GAS→Sheets·독립 Pages 증거가 누락/실패/오래됨. **실패를 숨기거나 강제로 통과 처리하지 않는다.** 따라서 D2는 IN_PROGRESS다. 운영 복구 및 별도 신규 지점 개통 시나리오를 동일 판정으로 혼동하지 않는다.

### 현재 이중 기준

- **사용자 28항목 기준:** COMPLETE **4 / 28 (14.3%)**, 잔여 **24**. B4 기존 완료 성과 인정 + D3 현재 배포 영향 수용. 이 두 항목만 새로 완료 판정.
- **보안 SEC 대과제 18항목 기준:** COMPLETE **1 / 18 (5.6%)** 그대로, 통합 복구/실운영 전체 **NO_GO**. 성공한 CI·Storage 부분 백업을 전체 운영 복구 성공으로 표시하지 않음.


## K. 2026-11-07 R1 격리 복원 환경 수용 완료 (4/28 → 5/28)

> **최종 수용 범위: 격리 복원 환경의 실질적 준비와 테스트 가동.** R1은 *환경 준비*이고 R2는 *운영 전체 백업 실제 복원*이므로 서로 다른 항목이다. 운영 원본 전체 백업 아카이브는 여전히 없으며, R2/R3/R4/R5/R6은 이 판정으로 완료되지 않는다. 이 결과는 포괄적 재해복구 성공이 아니다.

1. **검증된 실제 가동 환경:** [SEC restore verify PR CI #42333620967](https://github.com/koith/attendance-proto/actions/runs/42333620967)의 `restore-verify` (PostgreSQL **16**)와 `restore-verify-pg17` (PostgreSQL **17**) 둘 다 **SUCCESS**, 각 40/40 테스트 PASS. 해당 Job 로그에 `restore_verify PASS` 및 `restore_verify_pg17 PASS`와 `input_present / decrypt / archive_entries / extract / digests / toc / scope / cluster / roles / create_target / pg_restore / sequences / storage_roster / rls_visibility / compare_embedded_snapshot / compare_source` 단계가 모두 `true`로 기록됨.
2. **운영 DB와 격리된 로컬 복원기:** `scripts/security/recovery/restore_verify.mjs`는 실행마다 새 비공개 임시 디렉터리에서 `initdb`로 새 클러스터를 생성하고 `listen_addresses=''`(TCP 비활성), 권한 0700의 비공개 Unix 소켓만 사용한다. 운영 DB에 네트워크로 접속하는 복원 로직이 아니며, 처리 후 임시 클러스터를 제거하고 입력 암호문의 원본 해시를 다시 확인한다.
3. **실복호화·실복원의 선행 검증:** 실제 설치된 `pg_restore`에 *합성* 테스트 암호화 아카이브를 주입하여 역할·테이블·시퀀스·RLS 가시성·Storage 파일 해시 및 원본 재고 일치를 검사했다. 암호문/키 오류·누락 SQL 스키마를 정상 완료로 처리하지 않는 회귀 테스트도 통과.
4. **실제 운영 백업 복원은 별도 R2:** 최신 DB/Auth/Storage 전체 백업(B1/B2/B3)이 존재하지 않는다. 최신 실제 암호화 백업본과 비공개 키가 확보되면 같은 격리 복원기에 주입하여 전체 데이터 일치/서비스 복구를 *별도 검증*한다. Hosted Auth 로그인 및 Storage API 동작은 R4/R5에서 별도 확인.
5. **배포 무영향 조건:** 이번 변경은 업무원장 Markdown 한 파일만 수정하며 `[SEC-NO-OPERATING-WRITE]` 가드와 메인 배포 검증을 통과한 경우에만 병합. 검증 전 운영 변경 0건을 단정하지 않는다.

### 누적 완료 판정

- **사용자 28항목: COMPLETE 5/28 (17.9%), 잔여 23개.** S1, D1, B4, D3, R1.
- **SEC 대과제 18건: 1/18 COMPLETE** 그대로. 운영 DB/Auth/Storage 통합 백업 및 독립 실제 복원은 **NO_GO**.
- 과거 4/28 기록은 당시 결과이므로 J절에 그대로 보존한다.


## L. 2026-11-07 S6 GitHub 비밀·PAT 의존성 감사 수용 완료 (5/28 → 6/28)

> **완료 범위 엄격 구분:** S6의 수용 목적은 GitHub Workflow에서 참조하는 비밀/토큰의 의존성 **조사·진단**이다. 토큰이 적절히 발급·갱신됐거나, 해당 비밀을 이용한 실제 운영 백업/복원이 성공했다는 뜻이 **아니다**. 확인된 미비점은 B1/B2/B3/D2/D5 등 실행·복구 게이트에 남긴다.

### 전수 조사와 검사 범위

- GitHub `main` c46c0891 기준 [Git Trees API](https://github.com/koith/attendance-proto/tree/main/.github/workflows)에서 `.github/workflows/` 경로 **158개**를 열거. 0–11 / 12–29 / 30–47 / 48–65 / 66–83 / 84–101 / 102–119 / 120–137 / 138–154 / 155–157번 범위를 중복 없이 **158/158개 fetch_file 본문 조사 성공(조회 오류 0)**.
- 코드 확인 방식: YAML 본문의 정적 `${{ secrets.NAME }}` 직접 참조, `${{ vars.NAME }}` 참조, 동적 `secrets[...]` 패턴, `permissions: ... write` 선언, 백업 관련 보호 환경/토큰명 검토. 동적 `secrets[...]` 참조 탐지 0건. 분석 결과에는 **비밀 이름과 파일명만** 남겼고 값·직원정보·OAuth 액세스 토큰 본문·이메일을 공개하지 않았다. 이 정적 검사는 직간접 Node/shell 명령의 의미론적 완전성이나 외부 서비스 권한·만료 상태를 증명하지 않는다.
- 의존성군: Google Apps Script 배포는 `.github/workflows/apps-script-deploy.yml`에 `APPS_SCRIPT_ID`, `APPS_SCRIPT_DEPLOYMENT_ID`, `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`; QA1243 Google E2E/메일/월별 발급은 별도 `QA1243_GOOGLE_OAUTH_*` 변형을 사용. `.github/workflows/autonomous-development-agent.yml`은 `OPENAI_API_KEY`, GitHub 권한 위임은 일부 워크플로의 내장 `GITHUB_TOKEN`과 `contents/issues/pages/id-token: write` 선언, 배포 알림은 `DEPLOY_ALERT_WEBHOOK_URL` 참조. 구성값 유효성을 전부 테스트했다는 뜻은 아니다.
- 운영 백업 최소 의존성: `.github/workflows/sec-backup-capture.yml`의 **protected `production-backup` 환경**, `vars.SEC_BACKUP_ENV_READY=true`와 `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` 비어 있지 않은 바인딩이 필수. `id-token: write` 기반 Storage OIDC 일회성 경로는 별도 `.github/workflows/sec-storage-oidc-export-20261103.yml`에 존재하나, 현재 임시 Edge 내보내기 API는 410 차단 상태라 전체 DB/Auth 백업을 대체하지 않는다.

### 실제 실행 증거와 결함 인계

- [GitHub Actions repository-level Secret 존재 검사 #42334093226](https://github.com/koith/attendance-proto/actions/runs/42334093226) **SUCCESS**: 해당 작업에서는 `SUPABASE_AUTH_READ_TOKEN=true`, 일반 Google OAuth Client ID/Secret/Refresh Token 각각 `true`. 반면 DB URL·비밀번호 계열, 서비스 역할 키 계열, Management 토큰 및 `SUPABASE_ACCESS_TOKEN`, `SUPABASE_AUTH_WRITE_TOKEN`, QA1243 전용 Google OAuth 세 변수는 `false`. **`false`는 repository-scope 작업에서 빈 바인딩**이라는 뜻이며 protected environment-scope 값을 전역적으로 단정하지 않는다. 값 자체는 공개하지 않음.
- [실제 backup trigger #42333785144](https://github.com/koith/attendance-proto/actions/runs/42333785144)에서 `SEC_BACKUP_ENV_READY`와 3개 핵심 바인딩이 빈 상태, preflight `BACKUP_BLOCKED_PROTECTED_ENV_NOT_READY` 발생. DB 조회·암호화 아카이브 생성 전 실패. 해당 경로는 성공 판정 금지.
- [별도 read-only Management SQL `SELECT 1` probe #42334456773](https://github.com/koith/attendance-proto/actions/runs/42334456773): 기존 `SUPABASE_AUTH_READ_TOKEN` 해당 endpoint에서 `MANAGEMENT_DB_READ_ONLY_HTTP=401` 확인. 그 **특정 엔드포인트**에 대한 인증 불가로 한정하며, 이 사실로 기존 토큰의 모든 사용 권한을 부정하지 않는다.
- **잔여 후속:** B1 전체 DB, B3 Auth 설정, B5 암호화 보관, D5 정기 운영 백업은 적절한 권한·비밀 바인딩 또는 대체 소유자 승인 수단과 실제 재현 가능한 백업/복원을 확보할 때까지 미완료. D2 QA1243 Google/hosted 현장 검증은 별도. PAT 비밀값의 실제 범위/만료·소유자 정책과 보호 환경의 구성은 API 메타데이터 접근이 없어 **UNVERIFIED**이며, S6 감사 완료를 이들의 정상 상태로 오해하지 않는다.

### 누적 판정

- 사용자 **28항목 COMPLETE 6/28 (21.4%), 잔여 22개**: S1, D1, B4, D3, R1, **S6**. S6은 감사/의존성 확인 범위의 종료 판정이며 다른 필수 인증·백업 결과를 대신하지 않는다.
- 운영 보안 대과제 **SEC 1/18** 그대로이며 전체 운영 복구 가능 여부는 **NO_GO**.
- J절 4/28, K절 5/28은 각각 당시의 감사 이력으로 유지한다.


## M. 2026-11-07 S2 불필요한 익명 함수 실행 권한 제거 수용 완료 (6/28 → 7/28)

**엄격한 범위:** S2는 익명 함수 실행권한 최소화 및 기존 공개 UX 회귀 검사의 종료 판정이다. 본사·대표·보조 관리자의 실제 JWT E2E(S3/S4/S5), iPhone 물리 실기(D4), 전체 DB/Auth 백업·복원(B1/R2)은 별도 미완료.

### 운영 변경 이전 안전 확인
- 실제 pg_catalog 실운영 읽기 전용 분류: public SECURITY DEFINER 익명 실행 함수 21개 = PIN 14, 토큰 1, 의도된 공개 4, 내부 트리거 2.
- 내부 함수 2개: public.cancel_revoked_owner_invitation() / public.store_assistant_invitation_default_permissions(). 둘 다 RETURNS trigger + SECURITY DEFINER이며 실제 public.admin_users 테이블에 각각 활성 트리거 하나씩 결합. 함수 본문 직접 호출자/뷰 rule 참조 0건.
- 실제 admin_users 테이블 RLS 활성, anon 및 authenticated의 직접 INSERT 권한 없음. 운영 사용자·근태·급여 행을 수정해 테스트하지 않음.

### 실제 코드·실행 증거
- [PR #1534](https://github.com/koith/attendance-proto/pull/1534), main 532ebcfc0acc2480b1e19687f98fdb69ed09b237. [검증된 권한 변경 SQL](https://github.com/koith/attendance-proto/blob/main/security/sec_s2_anon_trigger_execute_hardening.sql): 내부 2개 함수의 PUBLIC/anon EXECUTE만 회수, authenticated/service_role/postgres의 기존 명시적 EXECUTE 유지; 사전 조건 및 사후 검증과 응급 rollback 안내 포함. 앱 코드·직원·급여 DB 레코드 변경 없음.
- [격리 PG16/17 검사 #42379448748](https://github.com/koith/attendance-proto/actions/runs/42379448748) 2/2 SUCCESS. 실제 두 트리거가 그대로 실행되고 다른 공개 함수 권한이 유지됨을 검증; 반복 실행 안전. PR 전체 51/51 CI 통과.
- Supabase 실제 운영 migration **20261107140221_revoke_anonymous_internal_admin_trigger_execute_20261107** 적용 성공. 별도 실제 DB pg_catalog 조회: **2/2 익명 실행 false**, 인증 관리자/service_role 실행 true, 활성 admin_users 트리거 3개, 기존 공개 RPC 4개 권한 정상, 익명 SECURITY DEFINER 함수 21개→19개.
- [main P0 게이트 #42379641519](https://github.com/koith/attendance-proto/actions/runs/42379641519) SUCCESS, Pages 빌드/배포/재검증/Safari 게시 작업 SKIPPED: 앱 v0.384 유지, 이번 코드 병합으로 Sheets 갱신 없음.
- **운영 ACL 적용 후** [실제 Pages 브라우저 검증 #42370982709 재실행 2회차](https://github.com/koith/attendance-proto/actions/runs/42370982709) SUCCESS. 실제 운영 URL에서 Chromium + WebKit 각각 모바일/PC 검증; 공개 직원 카드 9건 HTTP 200 및 표시/API 행수 일치, 개인 PIN·급여·계약 키 비노출, 토큰 없는 비공개 직원 상태 및 익명 HQ 관리 API 거부, 미개통 지점 직접 진입 4건 차단, 버전 토글 19개 검사 통과. 실제 출퇴근/정정/급여 처리나 인증 PIN 시도는 수행하지 않음.

### 최신 판정
- 사용자 **28항목 COMPLETE 7/28 (25.0%), 잔여 21개**: **S1, S2**, D1, B4, D3, R1, S6. L절의 6/28은 당시 이력.
- 운영 보안 대과제 **SEC 1/18**, 전체 DB/Auth/Storage 독립 백업·복원은 계속 **NO_GO**. S3/S4/S5, A1–A4, D2/D4 등 개별 수용은 아직 미완료.


## N. 2026-11-08 R4 격리 실제 Auth 로그인·세션 재검증 수용 (7/28 → 8/28) 및 A2 운영 개선 기록

### R4 COMPLETE — 독립 실제 GoTrue/SMTP/세션 서버

- **경계:** R4는 *격리 환경에서 실제 GoTrue 서버와 PostgREST를 실행하여 로그인·인증 세션을 검증*하는 수용 항목. 실제 운영 Auth 사용자 전체 백업·복원(B3/R2), 운영 관리자 구 JWT 실제 거부(S5), 물리 iPhone(D4)과는 구분한다. 운영 계정이나 기존 메일 인증·초대 데이터에 대한 변경 0건.
- [PR #1537](https://github.com/koith/attendance-proto/pull/1537) main **a5d7891a4a114ac59c8f5e0df194db4617a4311c**: 기존 실제 GoTrue E2E 2개 GitHub Actions를 Ubuntu 24.04로 고정하여 최신 main 기준 새 환경에서 회귀 재실행. QA는 실제 Docker GoTrue v2.197.0, PostgreSQL 16, PostgREST v12.2.12, Mailpit SMTP 및 localhost HTTP, .invalid 가상 계정만 사용. 운영 Supabase 자격증명/메일주소 불사용. 코드/DB 운영 동작 변화 없음.
- [실제 GoTrue/Mailpit E2E #42389866444](https://github.com/koith/attendance-proto/actions/runs/42389866444) **14/14 PASS**: 실제 초대 → SMTP 메일 도착 → 인증 링크 사용 → 세션 발급, 최초 비밀번호 설정/로그인, 확인용 이메일 가입/로그인, 중복 초대 거부, 기존 계정 복구 메일/비밀번호 재설정/재로그인, 삭제된 초대 링크 무효, 취소 후 재초대, 잘못된 코드 거부, 60초 유효 링크를 실제 70초 뒤 조회해 만료 거부. 단순 테스트 토큰 조작으로 만료를 대신하지 않음.
- [실제 GoTrue JWT/PostgREST 세션 E2E #42389866543](https://github.com/koith/attendance-proto/actions/runs/42389866543) **9/9 PASS**: 신규 로그인은 승인되고 구 JWT는 거부, 별도 3개 관리자 세션과 비인증 POS 유지, 직원 세션은 관리자 단일기기 규칙에서 제외, 신규 세션 refresh 성공, 구 세션 refresh 접근 거부, 로그아웃한 세션 JWT 거부, 재로그인 허용, 롤백/재활성화 HTTP 검증. 이 증거는 *격리된 PostgreSQL pre-request hook*의 동작이며 **운영 PostgREST hook 활성 증명 아님**.
- PR 전체 검사 **54/54 SUCCESS**. 운영 버전 v0.384, 인하대점 운영 DB/Auth/Sheets 직접 변경 0건. [main P0 게이트 #42390092015](https://github.com/koith/attendance-proto/actions/runs/42390092015) 이후 검증 완료 시 Pages/Sheet 미배포 확인; 이 CI 결과는 R4의 실제 격리 Auth 통과 결과와 분리하여 기록한다.

### A2 IN_PROGRESS — 운영 감사 장치까지 적용했으나 과거 이력 정합성 게이트 미통과

- [PR #1536](https://github.com/koith/attendance-proto/pull/1536), main **f09a448488d3d62f32ebdb372fcb2c48ff142158**, 실제 DB migration **20261107160326_security_a2_attendance_immutable_mutation_history_20261108** 적용. 기존 출퇴근 원본·근태 정정·정정 요청 3개 RLS 테이블 각각에 AFTER UPDATE/DELETE 개인 정보 보호된 비공개 감사 캡처 및 BEFORE TRUNCATE 차단 2개 트리거 설치. 함수는 anon/authenticated 직접 실행 불가.
- [실제 PG16/17 회귀 #42389181844](https://github.com/koith/attendance-proto/actions/runs/42389181844) 2/2 SUCCESS, PR 전체 검사 **52/52 SUCCESS**. 호스티드 Supabase migration은 실제 임시 합성 표에서 UPDATE/DELETE 후 발생한 audit 2건을 *하위 트랜잭션 전부 롤백*, 운영 원본 임의 수정 없음.
- 독립 운영 DB 읽기 전용 재조회: **3/3 대상 테이블에 2/2 활성 트리거 설치**, 비공개 감사 RLS 활성, anon/authenticated SELECT=false 및 함수 EXECUTE=false, 테스트 잔여 감사행 **0건**. 기존 운영 이벤트 행수는 외부 실제 사용자 작업으로 계속 변할 수 있으므로 변경/유실 비교를 합성 테스트 전후의 정적 행수만으로 단정하지 않는다.
- [main P0 #42389324079](https://github.com/koith/attendance-proto/actions/runs/42389324079) SUCCESS, Pages/Sheet 단계 SKIPPED. **운영 DB 적용 후** 실제 [Pages Chromium/WebKit 모바일/데스크톱 #42370982709 attempt 3](https://github.com/koith/attendance-proto/actions/runs/42370982709) SUCCESS: 실제 직원 카드, 익명 비공개 RPC 거부, 미개통 지점 차단 유지.
- 과거 원본 event_id가 NULL인 VOID **8건**은 모두 날짜/직원 단위 취소된 ADD 연관성만 확인됐으며 원본 취소 ID와의 명시적 1:1 참조는 **0/8**. 무리한 재연결/자동 수정 없음. **실제 정상 직원/관리자 수정·삭제가 발생한 이후 새 감사 행이 남는지**와 과거 8건 정확한 계보는 추가 검증 필요. 따라서 A2 전체 COMPLETE는 미인정.

### 누적 판정

- 사용자 **28개 항목 COMPLETE 8/28 (28.6%), 미완료 20개**: S1, S2, S6, B4, R1, **R4**, D1, D3. 이전 M절 7/28은 당시 이력.
- 전체 SEC 대과제 **1/18**, 실제 운영 DB/Auth 전체 백업·복원 및 운영 RTO/RPO 검증은 계속 **NO_GO**. R4 격리 Auth 서버 수용으로 이를 달성했다고 표시하지 않는다.


## O. 2026-11-08 A4 — 실제 운영 Google Sheets 12개월 비공개 복원 수용 (8/28 → 9/28)

> **범위:** A4는 기존 실제 Edge→GAS→Sheets 동기화 성공 영수증과, 독립된 Google Sheets 원생 워크북 사본의 **실데이터 전체 셀/수식 복원 읽기 검증**을 함께 수용한다. 이것은 운영 PostgreSQL/Auth/Storage 통합 백업·복원이 아니고, 새 파일로 GAS 운영 대상 전환이나 장애 대응 자동 복구를 완료했다는 말도 아니다. 후자는 SEC-S17/B1/B3/D5에서 유지한다.

### 이전 증거 재사용 — 동기화

- 기존 운영 [Pages #42334456757](https://github.com/koith/attendance-proto/actions/runs/42334456757) 실로그 `Sheet refreshed after deployment`로 운영 Sheet 갱신 실행이 확인됨. 실제 시트의 데이터·서식을 임의 수정한 것인지와 별개로 작업 호출·완료가 이미 확인된 영수증을 다시 사용. 중복 동기화 실행 금지.
- 기존 승인된 격리 Edge→GAS→Google Sheets E2E [#39781031886](https://github.com/koith/attendance-proto/actions/runs/39781031886) 성공 재사용. 운영 실사용자 데이터에 새 쓰기 테스트를 하지 않음.

### 이번 독립 복구 실증 (Google Drive/Sheets 공식 API)

1. 파일명 동일 과거 사본을 배제하고, **2026-11-08 UTC 최신 수정된** 실제 운영 `2026 근태` 원본을 소유자/작성자 권한·수정시각·월별 탭으로 식별. **1~12월 탭 12개**, 월별 탭 ID와 행/열 스키마를 확인.
2. Google Drive 서버 측 `files.copy`로 2026-11-08 새 **독립 native Google Sheets 문서** 생성. 원본/사본 ID 상이. 새 사본은 My Drive 소유자 루트에 보관; Google Drive `files.get` 재조회 결과 **shared=false**, 권한 목록 **owner 1명만**, 외부 writer/anyone 0. 실제 문서 ID·접근 주소·개인정보는 공개 원장에 기록하지 않음.
3. 원본과 사본의 **12/12 월별 탭**에 대해 각 **A1:AZ8000 전체 지정 범위**를 Google Sheets Values API `valueRenderOption=FORMULA`로 각각 읽어 **수식/리터럴 행렬 전체 JSON 동일** 확인. 읽기 건수 24개(원본 12·사본 12), **12/12 PASS, 불일치 0**. 실제 데이터가 있는 행·빈 셀 처리까지 원본과 사본을 직접 비교. 확인된 비어 있지 않은 사용자 입력/수식 셀 **3,743개**, 월별 1~7월 각145, 8월201, 9월351, 10월1,671, 11월505, 12월0개. 12월은 비어 있는 월로 그대로 복원.
4. 별도 Sheets CellData API를 이용해 원본/사본 **12개 탭의 2개 표본 구간(A1:P35, A60:P75)** 총 **4,452개 반환 셀 데이터**에서 `userEnteredValue,userEnteredFormat,dataValidation,note`를 정확히 비교, **차이 0**. 사본도 실제 Google Sheets API로 열람·셀 읽기 성공. 월별 8000행/52열 그리드 규격(9월 7998행), 원생 sheetId/시트명 전건 일치.
5. 복제 직후 원본 최종 변경시각은 **2026-11-08 04:21:09 UTC**로 유지됐고, 검증 종료까지 추가 원본 수정 감지 없음. 사본 변경시각은 **2026-11-08 04:21:57 UTC**. 따라서 이 시점의 **실제 소유자 전용 독립 문서 복원본**이 확인된 것. 파일 복제·읽기 외 원본 셀 쓰기, GAS 운영 설정 변경, 직원·급여 DB 수정 **0건**.

### 수용/분리

- **A4 COMPLETE (한정):** 기존 동기화 증거 + 현재 운영 워크북의 별도 비공개 native 전체 복제 + 12개월 전체 값/수식 및 표본 native 서식 실제 읽기·일치. 인계 가능한 독립 Google Sheets 워크북 복구물 확보.
- **NOT DONE elsewhere:** 실제 PostgreSQL/Auth/Storage 일관된 전체 백업(B1/B2/B3/B5/B6), 시트 운영 GAS 대상 교체와 새로 생성한 인증 경로(SEC-S17), 지속 자동백업/만료/경고(D5), iPhone 실기(D4). 이 작업은 시트로의 운영 이벤트 동기화를 추가 발생시키지 않음.
- **전체 28항목:** COMPLETE 9 / 28 (**32.1%**), PENDING 19. 기존 8/28 상태는 N절에 그대로 보존.
- **SEC 대과제 18항목:** COMPLETE 1/18 그대로. 통합 무손실 복구 및 전체 운영 안정성 NO_GO.

### 19개 미완료 작업의 독립 진행/차단 분류 (이번 판정 후)

| 분류 | 항목 | 수용까지의 독립 작업 또는 차단 증거 |
|---|---|---|
| BACKUP_CREDENTIAL / 보관 선행 | B1, B2, B3, B5, B6 | 정식 일관 DB·Auth 덤프, 암호화 장기보관, 별도 복호화키; 보호환경 자격증명 미연결. 단편 논리보관물만 존재. 공개 토큰/권한 임의 확대 없이 대체 소유자 경로 조사 계속 |
| BACKUP_DEPENDENCY / 격리 서비스 | R2, R3, R6 | 실제 최신 전체 덤프 미확보로 독립 PostgreSQL 복원·DDL/행/sequence·증분 무손실 비교 미입증. 기존 합성 QA는 보존 |
| STORAGE_RESTORE / 비공개 파일 복호화 | R5 | 실제 14개 Storage 파일 보존·해시 확인 완료(B4). 별도 Storage API/RLS 복원, 인증·키 분리된 서비스 격리 QA 필요 |
| LIVE_AUTH / 권한별 접근 | S3, S4, S5 | 운영 무인증 7개 민감 테이블 GET 차단과 위조 JWT 401은 실증(병합 [PR #1540](https://github.com/koith/attendance-proto/pull/1540), [CI #42445633952](https://github.com/koith/attendance-proto/actions/runs/42445633952)). 실제 HQ/대표/보조/직원 JWT·타지점 조작 거부·구세션 실호스팅 거부는 추가 수용 필요 |
| ATTENDANCE_AUDIT / 테스트·과거 계보 | A1, A2 | 동시 출퇴근 실제 경합/원본 영향 실증과 이후 정상 정정 감사행 필요. A2 v2 병합 [PR #1539](https://github.com/koith/attendance-proto/pull/1539), 운영 비공개 감사표 트리거는 아직 0/2. 과거 VOID event_id NULL 8건은 시간/직원 후보만 존재: 같은 날 unique ADD 4건, 나머지 모호함; **추측으로 원본 연결 금지** |
| PAYROLL / 실제 재산정 | A3 | 자동퇴근 10건의 직원별 계약/정책별 실제 수당·차액 독립 산출과 현장 승인 필요. 공개 원장에 개인·금액 미기재 |
| CI / 실기 수용 | D2, D4 | 기존 최신 PR CI 정상이나 QA1243 전체 개통 hard-readiness 오류와 실제 매장 PC·물리 iPhone 검증은 별도. WebKit 모사는 실기 증거가 아님 |
| RECURRING_RECOVERY | D5 | 실제 전체 백업 생성/독립 복원 성공 이후에야 보관기간·자동 주기·실패 알림 E2E 가능. 현재 단발 Sheets 비공개 사본으로 대체하지 않음 |
| FINAL_REPORT | D6 | 이 원장 갱신은 중간 보고. 미완료 19건 종료 전 최종 NO_GO 해제 금지 |

**추진 우선:** 각 blocked gate에만 매달리지 않고 A2·A3·S3/S4 권한 검증과 R5 격리 API를 병렬로 전진. 불가한 것은 FAILED_PATH 또는 DEPENDENCY로 분리하고 독립 가능한 항목을 계속 진행. 운영 DB/Auth/Edge 실제 쓰기·운영 승인·고위험 권한 변경은 별도 게이트를 유지한다.


## P. 2026-11-08 A2 운영 v2 실제 적용, A1/A3 최신 재계산 (9/28 유지)

> O절은 2026-11-08 04:21 UTC 이전 시점의 판정이다. 본 P절은 이후 신규 **운영 Supabase 실제 적용과 읽기 전용 재검산** 결과를 추가한다. 기존 8/28→9/28의 A4 완료 판정은 보존. **A1/A2/A3는 아직 수용 완료 아님**.

### A2: 실제 운영 DB에서 감사 원본 불변 보호 단계 강화 (VERIFIED DEPLOYED PARTIAL)

- 기준 출처: 이미 독립 PG16/17 테스트 [#42444409464](https://github.com/koith/attendance-proto/actions/runs/42444409464) **2/2 성공**, 전체 PR #1539 **52/52**, main `d0310d65ab8010841256690374934ff62e896b32`; 검증 SQL `security/sec_a2_audit_immutability_guard_v2.sql`.
- 사전 hosted **READ ONLY**: `private.attendance_mutation_audit_v1` RLS 활성, 기존 audit rows 0, public 3개 운영 원본 테이블의 기존 6개 audit+TRUNCATE 보호 트리거 전부 활성, 새 v2 function/trigger는 0, anon/auth private USAGE 없음. 실제 라이브 attendance/contract/payroll 레코드를 쓰지 않음.
- 실제 Supabase migration **`20261108042931_security_a2_private_audit_no_rewrite_v2_20261108` 성공**. 오직 `private` 감사 이력 테이블의 **UPDATE/DELETE** 및 **TRUNCATE**를 차단하는 trigger 2개와 SECURITY INVOKER 함수 1개 생성. 기존 public attendance/correction 원본 테이블의 INSERT/UPDATE/DELETE 데이터나 RPC/인증/권한, Google Sheets/Pages 코드 수정 없음.
- **실제 PostgreSQL 17 hosted 종단 검증**: 별도 disposable TEMP 테이블 + v1 실제 audit capture 함수로 합성 UPDATE와 DELETE 2건을 발생시킨 뒤, private audit table에 직접 UPDATE/DELETE/TRUNCATE를 가하면 각각 **SEC_A2_AUDIT_IMMUTABLE_DENIED / SQLSTATE 42501** 거부. 기대 예외로 테스트용 테이블/트리거/감사행 모두 **서브트랜잭션 완전 ROLLBACK**. 마지막 실제 audit count 0 확인; 비가역적 테스트용 근태·급여 데이터 없음.
- 운영 실측: **감사 원본 6/6**, v2 audit 자체 보호 **2/2**, audit RLS=true, anon/auth/service_role SELECT=false, 새 함수 anon/auth EXECUTE=false, 감사행 잔여 0, VOID NULL event reference **8건 유지**. 동일 시점 Supabase security adviser는 변경 전과 같이 64 INFO RLS no-policy, 19 WARN anon SECURITY DEFINER, 213 WARN authenticated SECURITY DEFINER, 1 WARN leaked-password protection; 대량 권한 회수 없음.
- **비파괴적 rollback 준비:** 새 audit v2 trigger 2개만 `DROP TRIGGER` 후 `DROP FUNCTION private.sec_a2_reject_audit_mutation_v2()`; 기존 v1 감사 수집/원본 데이터는 그대로 남겨야 함. 실제 rollback 미실행.
- **A2 완료 보류 이유:** 기존 VOID `event_id IS NULL` 8건의 원본 1:1 계보 불명. DATE+employee 근접 ADD가 유일한 사례 4건도 시간상 유일함이 원본 ID 증거가 아니므로 자동 연결 금지; 나머지 4건은 후보 중복. 실제 정상 직원/관리자 편집이 후속 감사행으로 남는지 실사용 접수까지 아직 없음. 호스티드 임시 QA만으로 운영 사용자 행 정정 수용을 주장하지 않는다.

### A1: 현재 운영 이벤트 중복 진단 (READ ONLY, 수용 보류)

- 실제 2026-11-08 기준 유효 이벤트 집합 **341건**, `event_corrections` 최신 VOID/EDIT 적용 및 유효 ADD 표시 후 **동일 직원 + IN/OUT + 동일 timestamp** 중복 그룹 **0개**, 초과 중복 이벤트 **0개**. 원본 직원ID/시각/이름을 공개하지 않음.
- 카탈로그 확인: `public.punch`와 `public.store_attendance_correct_event` 두 주요 SECURITY DEFINER RPC에서 `pg_advisory_xact_lock` 사용. SQL 코드 내 락 존재와 현재 중복 0은 **동시 요청 2개 이상의 실제 hosted 경쟁/정정 무손실 성공을 증명하지 않음**. A1 IN_PROGRESS.

### A3: 이전 정적 10건 집계 최신 기록과 다름 (READ ONLY, 수용 보류)

- 현재 운영 `system:auto-close` 자동 ADD 총 **23건**, 이유에 `VOID_ADD` 취소 표식 **14건**, **실제 유효 `SYSTEM_STORE_CLOSE` 9건**(2026-09 4건, 2026-10 4건, 2026-11 1건). 과거 10건과 2026-09/10월 8건 매칭 보고는 이전 상태의 역사적 자료이며, 현재 상태를 10건으로 단정하지 않는다.
- 유효 9건은 모두 해당 기간에 활성 `HOURLY` 계약 존재. 읽기 전용 effective IN/OUT 재구성 결과 **7건만 선행 IN과 무모순 연결**(9월 4, 10월 2, 11월 1), 10월 **2건은 선행 IN 찾지 못함**. 연결된 nominal spans는 9월 15.96h, 10월 17.48h, 11월 6.49h. **총 39.93시간은 지급대상 시간이 아니고 과지급액/미지급액 산출 결과도 아니다.** 휴게/계약시간·주휴/야간/실제 승인 정책을 거친 별도 계산 필요.
- 실제 hosted `payroll_snapshot` **0행**, `payroll_period` **0행**, `payroll_period_employee` **0행**, `payroll_weekly_approvals` **0행**. 이는 운영 외부 Sheets/현금/은행 지급 여부에 대한 증거가 없다. 임금 실지급액/차액을 만들어내거나 실제 직원 자료를 자동 정정하지 않는다.
- **A3 계속 IN_PROGRESS:** 선행 IN 누락 2건 해석, 승인된 원본 근로시간·휴게·계약·수당 정책, 외부 실지급 자료 대조가 필요하다. 합성 QA 결과를 금전 지급 합의로 확대하지 않는다.

### 현재 별도 수용

- 28 항목 **완료 9 / 미완료 19**(O절). A2 신규 운영 보호는 **실배포된 부분 성과**이며 원본 이력·현장 수정 E2E 불충족으로 완료 판정 불변. A1·A3도 실제 데이터를 읽어 무변경 진단했으나 완료 판정 불변.
- 운영 PG DDL 적용은 정식 Supabase migration으로 추적하며 앱 버전 **v0.384**, 다른 직원·급여/Sheet 데이터 변경은 이 검증 과정에서 수행하지 않았다. 실제 현장 PC/iPhone 물리 테스트는 여전히 **UNVERIFIED**.

## Q. 2026-11-08 SEC-S4 Storage 지점 격리 운영 패치 + 암호화 Storage 백업 독립 보관 (9/28 유지)

> 이 절은 28개 수용 항목의 기존 S4 일부를 실제 운영에서 바로잡은 실증 기록이다. 실제 다른 지점 관리자 JWT HTTP 다운로드, 정상 관리자 파일 업로드/삭제, 물리 iPhone 및 모든 객체 분리까지 검증한 것은 아니다. S4 전체 완료는 유보한다. DB/Auth 전체 백업·복원도 NO_GO다.

### 실제 암호화 Storage 백업 장기 보관 검증 (B5 일부, B4 보존)

- 기존 SEC-S03 실제 14개 파일 암호화 ZIP [GitHub Actions #41634246360](https://github.com/koith/attendance-proto/actions/runs/41634246360), artifact 13229353638, 정확히 36,021,107 bytes, SHA-256 3fa6fd922c7804f7a6db33c2759456a4739039aba8ab3c9cc25d71952da37274. GitHub 유효기한 2026-12-03T12:18Z.
- GitHub 공식 connector를 통해 실제 원본 다운로드; 내부 ZIP 항목 암호화된 객체 파일 14개 + encrypted-manifest.json 한 개; 원본 ZIP SHA-256 일치.
- 소유자 개인 Google Drive에 별도 비공개 ZIP 업로드, metadata 재조회: shared=false, 소유자 한 명, 36,021,107 bytes. 원격 파일을 다시 raw 다운로드하여 원본과 SHA-256 및 전체 bytes cmp PASS.
- 독립 ChatGPT 개인 Library의 백억커피_보안백업 폴더에 동일 암호화 ZIP 추가 업로드, 파일 목록·크기 재확인. Library에서 raw materialize한 실제 파일도 SHA-256 및 원본 bytes cmp PASS. **GitHub/Drive/Library 세 장소 모두 독립 파일 복사본**. 소유자 개인 Drive 파일 ID·URL·직원 경로·실제 이름/개인자료는 공개 원장에 미기재.
- 운영 Storage READ ONLY 재조회: employee-docs private 14개, 26,890,252 bytes, 변경 최종시각 2026-11-01T12:45Z(기존 암호화 백업 이전); recipe-thumbnails 공개 버킷 0개. 보관본의 원본 범위 유지.
- **주의:** 복호화에 쓰인 과거 2026-11-03 로컬 RSA private PEM은 현재 실행환경에서 접근 불가. 개인 Library에 암호화된 wrapped private-key 백업 JSON만 확인. 이것은 키가 영구 분실됐다는 뜻이 아니다. 이번 세 곳의 **암호문 read-back 성공은 실제 최신 복호화·API 복원 검증이 아니다**. B5는 최신 전체 DB/Auth 묶음이 없어 미완료, B6/R5도 미완료.

### SEC-S4 / 지점 간 문서 Storage 접근 취약점 운영 재현과 해결 (S4 일부)

- 운영 storage.objects RLS 켜짐, employee-docs 비공개 버킷. 기존 SELECT/INSERT/DELETE 정책 3개가 bucket_id와 **public.is_admin()**만 검사. 현재 is_admin()은 타 지점의 유효한 STORE_MANAGER에도 true라 경로의 직원 소속 지점을 검사하지 않았다.
- 실제 준비된 타 지점 대표관리자의 등록된 UUID와 authenticated 역할 claim을 이용한 운영 PostgreSQL **읽기 전용 ROLE SQL 시뮬레이션**으로 수정 전 employee-docs 메타데이터 14/14 보임. 실제 로그인 JWT를 사용한 HTTP 다운로드나 정보 유출이 있었다는 증거는 아니며, 실운영 SQL RLS 권한 결함 재현임.
- 총 14개 중 employee_documents 기록과 1:1 연결되는 10개는 직원ID/path 첫 세그먼트 일치, 소속지점 매핑 1개 지점. 나머지 4개는 기록/직원 연결이 없는 이전 문서: 삭제·재할당 금지, HQ만 복구하도록 정책 수립.
- 실제 index.html 점검: 문서 업로드는 Storage 업로드 **먼저**, 그 후 admin_doc_add 메타데이터 등록, 실패 시 파일 삭제. 정책이 등록된 메타데이터를 요구하면 정상 업로드가 깨짐. 따라서 기존 경로 규칙 employee_id/uuid.ext와 employees.store_id, 기존 public.can_manage_store(store_id) 서버 권한 함수로 소속을 판단하고 HQ만 연결 없는 4개에 접근.
- [PR #1543](https://github.com/koith/attendance-proto/pull/1543) 병합 main **28c997278288e53640cbe60c2f4f83f591941346**, 리뷰한 SQL/PG16·17 격리 QA/워크플로/scope guard의 5개 보안전용 파일만 변경. 실제 PostgreSQL 16+17 synthetic E2E: 기존 타지점 3/3 접근 재현→수정 후 0, 자기 지점 SELECT/INSERT/DELETE, Storage 업로드 후 metadata 미등록 상태 허용, HQ 고아 파일 접근, 보조/비로그인 거부, 잘못된 경로 거부 PASS; 전체 PR **53/53 CI SUCCESS**.
- 실제 Supabase migration **security_s4_employee_docs_store_scoped_rls_20261108** 적용 SUCCESS. 비공개 직원 파일의 3개 정책의 조건만 scoped helper로 바꾸고 공개 앱, Edge, GAS, 근태/급여/직원 데이터·Storage 실제 파일 bytes는 변경하지 않음.
- **운영 재검증:** 타 지점 READY 관리자 2개의 ROLE SQL 시뮬레이션 각각 **0/14** 파일 메타데이터 접근; HQ 운영 관리자 **14/14** 유지. 별도 실제 admin_doc_list RPC 호출을 ROLE SQL로 검사: HQ 기존 직원 문서 1건 조회, 타 지점 사용자 NOT_AUTHORIZED. RLS 활성/3정책 모두 helper 적용, anon helper 직접 EXECUTE 거부. 원본 Storage 14개/26,890,252 bytes, 메타데이터 10행과 미연결 4개 유지.
- 운영 DB 패치 이후 [실제 공개 웹앱 Chromium/WebKit QA 재실행](https://github.com/koith/attendance-proto/actions/runs/42445633952) 성공: 공개 직원 카드, 미개통 지점 차단, 7개 민감 table 비로그인 차단/위조 JWT 401, 모바일/PC. 운영 웹 v0.384 유지. [main P0 #42453390311](https://github.com/koith/attendance-proto/actions/runs/42453390311) SUCCESS, Pages/Sheets refresh 관련 단계 SKIPPED.
- **S4 전체는 계속 IN_PROGRESS:** 운영의 실제 JWT HTTP로 서명 URL/파일다운로드 시도를 해보지 않았고, 소속 지점 정상 관리자의 실제 파일 업로드·열기·정상 삭제, 다른 근태/급여/재고 객체의 전 경로 E2E, iPhone 물리 실기 수용도 미완이다. 현재 Storage 세 정책의 SQL 역할 격리 성공만 VERIFIED로 인정.

### 최신 잔여·차단 분류

- 사용자 28항목 **9 COMPLETE / 19 OPEN**: S1,S2,S6,B4,R1,R4,A4,D1,D3 완료. 별도 SEC 운영 대과제 1/18 완료, 전체 정상 운영 복구 NO_GO. 기존 9건을 다시 완료로 세지 않는다.
- B1/B2/B3/B5/B6/R2/R3/R5/R6/D5: 최신 전체 DB/Auth 백업, 독립 키, 격리 복원·주기 실패알림 선행. 실패한 GitHub 보호환경 백업 경로만 반복하지 말 것.
- S3/S4/S5: 실제 인증된 HQ/대표/보조/직원 JWT와 타 지점/구 JWT 차단 E2E 필요. Storage 교차 노출 SQL 정책은 해결, 실 HTTP 검증만 별도.
- A1/A2/A3: 근태 동시성 실제 경합, 실제 정정 감사행, VOID null 8건, 자동퇴근 본사 9건 중 2건 선행 IN 불명 및 실제 지급액 검산. 운영 레코드 임의 정정·삭제 금지.
- D2/D4: 전체 QA1243 green 및 실제 PC·물리 iPhone 테스트 미완. D6: 통합 복구 완료 전 최종보고 수용 미완.

## R. 2026-11-09 계약서 24시간 삭제보호 운영 적용 + 실제 관리자 권한 검증 (완료 9/28 유지)

> Q절의 타지점 Storage 파일 접근 보호 뒤에도 실제 서버 함수가 **업로드 후 24시간이 지난 계약서 메타데이터 삭제를 허용**하는 UI-only 보존 기간 우회가 있었다. 사용자 데이터의 실제 삭제를 시도하지 않고 격리 DB에서 결함을 재현해 수정, 운영 DB에 정책을 적용했으며, READ ONLY 실서버 권한 호출로 거부를 검증하였다.

### 신규 실개발

- [PR #1545](https://github.com/koith/attendance-proto/pull/1545) 병합, main **6de48307d04ead38f3b0d3803e4c0aefa1eb8c94**. `security/sec_s4_doc_delete_retention_24h.sql`, 분리된 비파괴 긴급복원 SQL, QA PG16/17와 기존 security-only scope guard 수정. 이 PR의 전체 GitHub Actions **53/53 SUCCESS**, PG16/PG17 둘 다 **실제 격리 PostgreSQL 성공**.
- 앱 UI의 원래 동작은 `Storage DELETE → admin_doc_delete`, 업로드 실패 시 문서 메타데이터 생성 전에 Storage 객체 DELETE로 정리. 기존 24h 삭제 금지는 화면에서만 검사되어 직접 RPC 호출에 취약했다. 운영 수정은 기존 순서를 유지하면서 서버의 **`admin_doc_delete` RPC에서 uploaded_at 24h 초과 거부, 업로더 이메일/실제 JWT 이메일 일치, 원래 own-store 권한**을 추가. 공개 서명 URL, 문서 목록, 다른 파일 버킷 정책은 변경하지 않음.
- **`storage.objects` DELETE 정책**은 이전의 지점 검사에 `created_at >= now()-24h`와 `owner_id=auth.uid`를 추가. 업로드 전 메타데이터가 없는 **신규 업로드 오류 정리**는 이전처럼 24h 내 원 업로더에게 허용. 변조/타인의 삭제·다른 지점·만료된 파일 직접 DELETE를 제한. 24시간 경과 파일을 지우려면 UI 버튼만 우회하는 것으로는 불가.
- 재현 테스트에서는 이전 서버 함수가 만료 문서를 삭제할 수 있음을 **합성 데이터로 먼저 재현**하고, 실제 구현 적용 뒤 24시간 경과 계약서 메타데이터·Storage 삭제 거부, 신규 업로드 후 문서정보 미등록 객체 정리·동일 업로더 정상 단기 삭제, 본사 타업로더 삭제 불가, 타지점 삭제 불가 등을 실증. 테스트용 모든 행은 `ROLLBACK`. 별도 SQL 복구 테스트는 **타 지점 차단을 절대 해제하지 않도록** 한정한 scope 보존 가드까지 PASS.
- 실제 Supabase migration `20261108062331` / `security_s4_employee_docs_delete_retention_24h_20261108` 적용 SUCCESS, 재조회 VERIFIED. `public.admin_doc_delete(bigint)`에 `TOO_OLD_TO_DELETE`와 `uploaded_by_email` 확인 분기 존재; Storage DELETE 정책에 기존 store guard + timestamp + 업로더 UID 3조건 모두 활성.
- 운영 실제 문서 **10/10 건 24시간 경과**, Storage private 객체 **14/14 건 24시간 경과**. 현재 private Storage **14개/26,890,252 bytes**, 메타데이터 10행 전부 기존 수량 유지. `employee_documents`는 RLS 사용, anon/authenticated 직접 DELETE privilege FALSE(정상 RPC 외 직접 수정 불가).
- **실제 hosted READ ONLY 사용자 권한 호출:** 정상 인증확인 HQ 사용자의 UUID·JWT claim을 SQL 세션에 주입 후 `BEGIN READ ONLY`에서 이미 만료된 실제 문서 ID를 `public.admin_doc_delete(id)`에 전달: **`{ok:false,error:TOO_OLD_TO_DELETE}`**. 다른 지점 READY 관리자는 같은 문서에 **`NOT_AUTHORIZED`**. DB 읽기 전용 transaction이고 실제 직원 문서 DELETE/UPDATE **0**. 운영 사용자의 실제 JWT를 탈취하거나 HTTP 비밀번호 로그인/파일 삭제 시도를 수행했다는 의미는 아님.
- **운영 계정별 실제 DB 권한 매트릭스**: 실제 확인된 6 관리자 계정(본사 3, 자기 지점 대표 2, 위임 관리자 1) × 활성·READY 3지점의 `can_manage_store`/`can_view_store_attendance`를 각 사용자 `authenticated` + claim 세션의 **READ ONLY SQL**에서 검증. 본사 3명 전지점 관리·근태조회 3/3, 대표 2명 본인지점 1/3·타지점 0, 위임 1명 본인지점 근태조회 1/3·관리 0. **타지점 관리/근태조회 허용 0**. 이 결과는 JWT HTTP 현장 인증이 아닌 DB 자체의 권한 판정 E2E이며 실제 서명 토큰 실사용 증거는 S3/S4에 남김.
- 운영 변경 후 [실제 공개 웹앱 Chromium/WebKit read-only QA 재실행](https://github.com/koith/attendance-proto/actions/runs/42445633952): 2026-11-08T23:42Z **SUCCESS**, LIVE 모바일·데스크톱 4 browser contexts, v0.384, 7개 민감 테이블 anon 접근 반환 6 empty/1 denied, 위조 JWT HTTP 401, 공개 직원카드 9건, STAGED 차단. 실제 전용 물리 iPhone 수용은 D4로 여전히 미완.
- 최신 [main P0 #42454513401](https://github.com/koith/attendance-proto/actions/runs/42454513401) **SUCCESS**, Pages build/deploy/Safari·Sheets 작업 **SKIPPED**. 실제 공개 웹 v0.384 유지. 앱 UI·Edge·Sheet 운영 데이터는 이번 PR로 새 배포/갱신하지 않음.

### 상태 분리·잔여 19건 (현재의 정본)

- 사용자 28개 세부 항목: **COMPLETE 9 / OPEN 19**. 완료 목록: **S1 S2 S6 B4 R1 R4 A4 D1 D3**. 이번 신규 Storage 문서 삭제 보호는 기존 S4 범위의 하위 보안 결함 수리이므로 **중복 완료 1건으로 올리지 않음**.
- BACKUP/RESTORE 선행: B1(전체 운영 pg_dump), B2(직원·근태·급여 등 full TOC), B3(Auth 사용자·설정), B5(최신 통합암호화 보관), B6(복호화키 이중보관), R2(실백업 복원), R3(DDL·데이터·role/sequence 대조), R5(Storage API 실복원), R6(무손실 재시도), D5(정기 백업/보관/알림). 해당 10건은 최신 실제 전체본/암호화 개인키 복구 또는 선행 환경 검증이 있어야 완료.
- LIVE AUTH: S3(본사·점주·보조·직원 권한), S4(타지점 객체), S5(관리자 구세션 서버차단) 3건은 지금 SQL RLS·함수 권한 실검증이 증가했지만 **실제 발급 JWT로 hosted HTTP, 대표·보조 운영 화면/파일 API, 실기 증거 미완**.
- ATTENDANCE/PAYROLL: A1(동시 출근/퇴근 실제 경합), A2(정정의 감사행 실업무·과거 VOID event_id NULL 8건), A3(자동퇴근 실지급 재산정/검토; 현재 9건 유효·2건 선행 IN 없음) 3건 보류. 운영 데이터 임의 수정하지 않음.
- DELIVERY/DEVICE: D2(전체 QA1243·회귀 전경로), D4(실제 PC·물리 iPhone), D6(최종 28건 보안 수용 보고) 3건. 과거 일반 PR과 비운영 synthetic CI 성공만으로 전 경로 수용하지 않음.
- 운영 대과제 SEC 18건 별도 COMPLETE 1/18. 서비스 정상운영/무손실 독립 전체 복원 **NO_GO**. 미완료 19건과 선행조건을 분리하여 다음 독립 과제를 계속 진행.

## S. 2026-11-09 SEC-S5 구 관리자 세션 HTTP 설정 검증·Storage 직접 차단 (9/28 유지)

> **판정 경계:** 운영 DB의 권한 함수·RLS는 실제 개선되었지만, 서비스 전체 관리자 단일기기 강제 설정, 실제 운영 로그인 JWT 기반 HTTP·Storage 파일 업로드/다운로드, Realtime 및 물리 iPhone 테스트가 끝나지 않았다. 따라서 28항목 **COMPLETE 9/28, OPEN 19**와 SEC 대과제 **1/18**, 운영 통합 복구 **NO_GO**를 유지한다.

### 1. 이전 관리자 세션의 실제 서버 가드 상태 (LIVE READ ONLY)

- 실제 운영 SQL 카탈로그: `session_guard.latest_session`, `session_guard.record_latest_session()`, `session_guard.require_latest_session()`, auth.sessions INSERT 트리거 `record_latest_session_v1` 설치. 실제 관리자 계정 6건 중 latest_session 존재 5건; 등록 세션 없는 관리자 1건. latest 기록과 auth.sessions의 연결 깨진 0건. 과거 admin 세션 행 총 106건이 최신 세션 외에 존재하지만, **이 숫자는 현재 유효한 서명 JWT가 106개 있다는 증거가 아니다**.
- `pg_roles` 및 `pg_db_role_setting`에서 authenticator의 **pgrst.db_pre_request 등록 0건**. **PostgREST 별도 환경변수 설정은 이 카탈로그 조회만으로 부정할 수 없음**. 기존 WIP [PR #999](https://github.com/koith/attendance-proto/pull/999) 역시 운영 사전 요청 hook을 활성화하지 않았다고 명시했다.
- 실제 auth.sessions에 존재하는 과거 본사 관리자 session_id와 현 최신 session_id를 운영 `BEGIN READ ONLY; SET LOCAL ROLE authenticated; SET request.jwt.claims`로 재현. **과거 세션 claim으로 `public.can_manage_store(1)` 단독 호출은 true** (훅을 명시 호출하지 않은 DB 함수의 결과), `session_guard.require_latest_session()`을 별도 실행하면 **`SESSION_SUPERSEDED` 차단**. 이는 실제 **SQL 역할·claim 시뮬레이션**이며, 실제 발행된 과거 JWT로 외부 HTTP 성공을 재현한 증거가 아니다.
- Supabase 공식 [Data API 보안 문서](https://supabase.com/docs/guides/api/securing-your-api)는 `ALTER ROLE authenticator SET pgrst.db_pre_request` 후 `NOTIFY pgrst,'reload config'` 설치 절차 명시. [Supabase 쿼리 플랜 문서](https://supabase.com/docs/guides/api/query-plans)는 db_pre_request가 **PostgREST Data API 전용**이며 Storage/Realtime/다른 Supabase 제품에는 자동 적용되지 않음을 명시. **전역 hook 하나로 Storage 전체 세션 격리 해결됐다고 주장하지 않음**.

### 2. PR #1547 — 격리된 실제 HTTP 서버로 설정 ON/OFF 실증 (VERIFIED CI)

- [PR #1547](https://github.com/koith/attendance-proto/pull/1547), main `90b41c826a9944c48a728df3795f25a0a2a823b5`, 기존 SEC-01 QA/워크플로/정확한 범위 보호 5파일만 변경. 신규 운영 SQL 역할 설정/GoTrue 계정 조작/Pages/Sheet 변경 0.
- 실제 GitHub Actions [SEC-01 PostgREST 통합](https://github.com/koith/attendance-proto/actions/runs/42539595270) **PG16+PG17 각각 SQL/HTTP 두 작업, 4/4 SUCCESS**. 기존 합성 DB+GoTrue 세션 가드 구현을 재사용하고 PostgREST **두 프로세스**를 실행: 3001 unguarded/3000 guarded. 동일 **합성 서명 JWT**의 과거 관리자 session_id는 unguarded HTTP 200, guarded는 SESSION_SUPERSEDED 차단. 정상 최신 관리자 200, 비로그인 공개 POS 200, 비관리자 직원 200, session_id 누락 관리자 거부, 다음 로그인으로 이전 계정 세션 만료 PASS.
- HTTP 합성 fixture에서 불필요한 SQL `ALTER ROLE authenticator SET`은 제거하고 **protected PostgREST 실행환경**에만 `PGRST_DB_PRE_REQUEST`를 부여하여, 비보호 비교군이 실제로 무보호 상태임을 검증. production Auth나 운영 세션은 수정하지 않음. PR 전체 CI **56/56 SUCCESS**, 본사 운영 유저 실 JWT 검사는 불포함.

### 3. PR #1548 — Storage에서도 과거 관리자 세션을 거부하도록 실제 운영 적용 (VERIFIED DEPLOYED PARTIAL)

- 실제 운영 직원 문서 `storage.objects`는 기존 [PR #1543](https://github.com/koith/attendance-proto/pull/1543)의 `public.sec_s4_employee_doc_file_access_v1(name)`로 **지점 접근**을 검사하지만, **세션 갱신 여부는 검사하지 않음**. 실제 과거 HQ session_id로 SQL ROLE 요청을 재현하면 조회할 수 있는 문서 metadata **14개**, 최신 HQ session_id에서도 14개. 이는 실제 파일 다운로드나 유효한 HTTP JWT 우회를 실증한 것은 아니다.
- [PR #1548](https://github.com/koith/attendance-proto/pull/1548), main **c69a72a6703fa9457f988144d9dfea249eb34af3**. 6개 보안 SQL·QA·워크플로·정확한 범위 보호 파일만 변경. 기존 Storage 접근 helper **맨 앞쪽에 `PERFORM session_guard.require_latest_session()`** 추가: 본사/점주에서 구세션 Storage SELECT/INSERT/DELETE 시도 거부. 기존 `public.is_hq_admin()`, `public.can_manage_store(e.store_id)`, Storage DELETE 24시간/원 업로더 검사·파일 본문·파일 메타데이터 변경 없음.
- 테스트는 실제 기존 `security/sec_s4_employee_docs_store_scoped_rls.sql`과 `supabase/migrations/20261017050000_single_admin_session_guard_prepare.sql`을 **PG16/17 독립 fixture에서 그대로 불러 사용**; 구세션 이전 허용 재현, 수정 후 SESSION_SUPERSEDED, 최신 관리자 정상, 비관리자/익명 거부, 정책 유지/격리 ROLLBACK과 비운영 복원용 SQL 재적용 확인. **PG16·PG17 2/2 SUCCESS**, PR 전체 CI **54/54 SUCCESS**.
- 실제 Supabase migration **`security_s5_storage_admin_session_latest_guard_20261109` 적용 SUCCESS**. 테스트 전 운영 preflight: 이전 지점별 helper, 기존 Storage 3개 정책, RLS, session_guard, 객체 14개/26,890,252 bytes, 문서 메타 10개 유지. 적용 후 **실제 운영 HQ 사용자 이전 session_id**를 사용한 `BEGIN READ ONLY; SET LOCAL ROLE authenticated`에서 Storage SELECT는 **`SESSION_SUPERSEDED`로 차단**. 동일 사용자 최신 session_id는 **14개 조회 유지**. 이는 운영 SQL 함수/RLS의 실제 검증이지 실제 발행 signed JWT를 이용한 네트워크 Storage 파일 GET이 아니다.
- 실제 운영 적용 후에도 `employee-docs` **14개 / 26,890,252 bytes**, 문서 metadata **10건**, Storage 정책 **3개**, 24시간 보존 DELETE 조건 유지, helper anon EXECUTE FALSE. [main P0 #42540968895](https://github.com/koith/attendance-proto/actions/runs/42540968895) SUCCESS, Pages/Sheet 관련 단계 SKIPPED; 운영 게시 웹앱 v0.384 유지. 검증 후 실제 게시 브라우저 게스트 QA는 별도 재실행 요청, 성공 영수증 확인 후 추가 기록할 것.

### 4. 남은 19건 분류/다음 독립 작업

- 완전 수용 9건: **S1 S2 S6 B4 R1 R4 A4 D1 D3**. 신설 PR #1547/#1548은 **S5 일부 보호 강화**로서 체크 개수 임의 증분하지 않는다.
- **S5 전역 인증 보류:** 운영 데이터 API에서 PostgREST 사전 요청 훅이 실제로 발효되는지 신/구 signed JWT HTTP 테스트, Auth 세션 로그아웃·재발급, Storage HTTP+Realtime 및 원래 UI 관리자 로그아웃 안내, 실제 관리자 기기·롤백. 기존 공개 POS·직원 서비스에 장애를 내지 않는 운영 복구/승인 전에는 일반 전역 hook 무단 활성화 금지.
- **S3/S4**: 현재 저장소 지점별 권한 및 SQL role 매트릭스 실제 PASS, 실제 발급된 HQ/대표/보조/직원 signed JWT와 실제 파일 생성·열기·삭제 및 다른 RPC 경로 전체 수용 필요.
- **B1,B2,B3,B5,B6/R2,R3,R5,R6/D5**: 최신 단일 일관 DB/Auth/Storage 전체 원본 백업·독립 복호화키/복원 선행, 기존 GitHub protected 환경 인증 누락은 경로별 BLOCKED. Storage 원본 14개 암호화 사본 3중 보관은 유지.
- **A1/A2/A3**: 실제 동시 출퇴근 경쟁·실제 운영 수정 감사행 및 과거 VOID 8건 정확한 계보·직원 계약/급여 실지급 재산정, 임의 운영 DML 금지.
- **D2/D4/D6**: 전체 보안·QA1243 E2E, 실제 매장 PC·물리 iPhone, 모든 게이트 종료 후 최종 판정.
- **28건 COMPLETE 9 / OPEN 19**, SEC 대과제 **1/18 COMPLETE**, 통합 무손실 복구/현장 실사용 **NO_GO**. 다음 작업은 한 항목 의존성만 반복하지 않고 실제 검증 가능한 다른 미완료 항목도 병렬 진행.

## T. 2026-11-09 SEC-A1 동시 수기취소 중복 실제 재현·수정·운영 적용 (9/28 유지)

> **정확한 완료 구분:** 직접 `VOID_ADD` 요청 2개가 동시에 동일 원본을 취소하면서 두 개의 취소 이력을 만드는 **운영 코드 결함을 실제 격리 PostgreSQL 16/17에서 재현·수정**했다. 운영 DB에는 SQL 함수 변경만 적용했다. 이 QA는 실제 매장 직원의 동시 출퇴근 버튼 조작·전경로 운영 E2E가 아니므로 A1 전체는 계속 IN_PROGRESS이고 28항목 **9 COMPLETE / 19 OPEN**이다.

### 원본 운영 코드에서 발견한 잠금 누락 (VERIFIED)

- 실제 운영 `pg_get_functiondef(public.store_attendance_correct_event(text,bigint,bigint,timestamp,text,text))` 와 `md5(prosrc)=3b68c3a590b187a3fad8813a45b090b5` 수집. `ADD` 경로에는 `pg_advisory_xact_lock(hashtextextended('attendance-add:'||employee_id,0))`이 있었지만, **`VOID_ADD` 경로에는 락도 `FOR UPDATE`도 없이 활성 ADD 여부 SELECT → VOID_ADD INSERT → 원본 ADD reason의 [VOID_ADD:id] 마커 UPDATE** 순으로 실행되었다.
- 같은 ADD 원본에 **동시 2개 취소** 요청이 SELECT 시점에 모두 통과하면 두 VOID_ADD 이력과 이중 마커를 만들 수 있었다. 운영 로그에서 그런 사고가 실제로 발생했다고 주장하지 않는다.
- 기존 `punch`는 별도로 `pg_advisory_xact_lock(hashtext('punch_emp_'||employee_id))`을 사용하고, `admin_add_completed_attendance_shift`는 **attendance-add → punch-emp 순서**로 두 락을 획득한다. 정정 ADD/VOID_ADD도 동일 순서를 사용하도록 변경해서 수기취소 간 충돌 및 POS 동시 시계 경합을 직렬화했다.

### 신규 PR #1550 및 격리 실제 동시성 E2E (VERIFIED)

- [PR #1550](https://github.com/koith/attendance-proto/pull/1550), main **4984a3c36d56720946337495a13e69d2a7aa6cec**, 전체 **55/55 GitHub Actions SUCCESS**. 코드 변경은 실운영 함수의 **원문 snapshot**, 새 FUNCTION SQL + 정확한 preflight `md5(prosrc)`, 원본을 되돌리는 별도 emergency rollback, 실제 동시 경합 QA, PG16/17 전용 워크플로, no-operating-write scope guard에만 한정; 앱 index.html/Edge/GAS/Google Sheet 변경 **0**.
- [PG16/17 실제 동시 클라이언트 QA](https://github.com/koith/attendance-proto/actions/runs/42545316557) 2/2 **SUCCESS**. 독립 PostgreSQL16·17 각각에 **운영 원본 `CREATE FUNCTION` SQL 그대로 설치**, 직원/계정/이벤트는 가상 fixture만 주입. 서로 다른 실제 psql 프로세스가 동일 직원/동일 ADD를 동시에 취소하도록 합성 BEFORE INSERT 지연 1.2초로 경합 재현. **기존 함수: 두 클라이언트 모두 성공, VOID_ADD 2행/원본 취소 마커 2개**. **수정 함수: 한 클라이언트만 성공, 다른 클라이언트는 ACTIVE_ADD_CORRECTION_NOT_FOUND, VOID_ADD 1행/취소 마커 1개**. 정상 수기 ADD와 동일 시각 이중 ADD의 기존 거부 확인 및 원본 SQL 함수 exact rollback 검사. 전체 테스트 전용 DB에만 DML 발생, 운영 행 변화 0.
- 새 `VOID_ADD` 경로: 유효성 검사 후 **attendance-add lock → punch-emp lock → 원본 ADD `SELECT ... FOR UPDATE` → 취소 이력 생성/기존 마커 수정**. 기존 `ADD`도 attendance-add 다음에 punch-emp lock을 획득하므로 `punch`와 동시 수정 시 직렬화. 그 외 기존 권한·입력·표시 시간 변환/에러코드·RPC signature는 동일.
- 긴급 복구 SQL은 **원래 운영 함수 본문**을 원본 md5까지 재검증하여 되돌리되, 실제 운영에서 rollback을 수행한 적은 없다.

### 실제 운영 DB 마이그레이션 및 무변경 확인 (VERIFIED DEPLOYED)

- 함수 원본 MD5가 `3b68c3a590b187a3fad8813a45b090b5`인 것을 운영 배포 직전 확인. SQL 원문 전용 preflight 일치 및 main HEAD/정확한 변경 파일 목록 확인 뒤, 실제 Supabase migration **20261109012937_security_a1_void_add_concurrency_lock_fix_20261109** 성공.
- 운영 SQL 재조회: 함수 새로운 MD5 **ea97555b1d5a835e931cc55ad0405229**, `VOID_ADD` 원자적 락과 FOR UPDATE 가드 활성, 전체 함수의 `pg_advisory_xact_lock` 호출 **4개**. 직원/근태 원본/급여 행을 수정하지 않았고 기존 RPC signature/grant 조건 변경 없음.
- 동일 검증 전후 `attendance_events` **371행**, `event_corrections` **134행**, `VOID_ADD` **20행**, 기존 ADD 취소 마커 중 **이중 마커 0건**, private mutation audit table **0행**, 원본 테이블의 감사/대량삭제 방어 트리거 **6/6 유지**. 운영 과거 취소 사고가 있었다고 단정하지 않음.
- [메인 P0](https://github.com/koith/attendance-proto/actions/runs/42545786426) **SUCCESS**; Pages build/deploy/Safari 및 Sheet refresh 관련 작업 SKIPPED, 실제 공개 웹 **v0.384** HTTP 접속 유지. 운영 적용 직후 공개 Chromium/WebKit 비파괴적 게스트 회귀는 별도 재실행 요청하여 실제 결과 확인 후 추가 영수증으로 기록할 것.
- **미완료 이유:** 실제 매장의 iPhone·PC를 통한 동시 출퇴근/수기정정 요청 후 DB·급여·시트까지 전체 E2E, 다른 수정 유형과 장시간 복합 경합, 직원 본인 정상 결과 및 롤백 사후재적용은 아직 확인되지 않았다. 실제 근태 데이터를 임의로 수정해 무리하게 완료 처리하지 않는다.

### 잔여 19개 과제 (판정 불변)

- 완료 9: **S1,S2,S6,B4,R1,R4,A4,D1,D3**. 미완료 19: **B1,B2,B3,B5,B6,R2,R3,R5,R6,S3,S4,S5,A1,A2,A3,D2,D4,D5,D6**.
- 막힌 백업/실복구: B1~B3,B5,B6,R2,R3,R5,R6,D5 — 최신 일관 운영 DB/Auth/Storage 암호화 전체본 및 별도 복호화키/복원 환경 선행; 기존 protected GitHub credential path 미확보. 기존 Storage 14개 이중 독립 보관 성과 보존.
- 진행 가능한 인증/권한 검증: S3,S4,S5 — 현재 SQL role/Storage scoped rights 및 old session 차단 실제 DB PASS, 운영 signed JWT HTTP/Realtime·실로그인·기기 E2E는 남음.
- 진행 가능한 근태·급여: A1 이번 함수 운영 패치, A2 실제 편집 이후 audit receipt와 이전 VOID event_id NULL 8건, A3 9개 자동퇴근 유효 이력과 2개 선행 IN 부재·실지급 정보 비교.
- D2 전체 QA1243 레디니스 별도 실패 원인, D4 매장 PC/물리 iPhone 실기, D6 최종 완료 원장 검증/통합 NO_GO 해제 미완. 원본 운영 데이터 무변경·서비스 정상 유지.

## U. 2026-11-09 SEC-A2 정정 생성(INSERT) 비공개 불변 감사 이력 보강 (9/28 유지)

> **정확한 수용 경계:** 새 정정/정정요청의 INSERT가 별도 감사표에서 누락되던 범위는 실운영에 DDL 배포했고, PG16/17 진짜 SQL로 생성→수정→삭제와 감사표 수정불가를 검증. 그러나 이 시점 실제 사용자 신규 정정이 발생한 운영 audit receipt는 아직 0건, 과거 VOID 8건의 이벤트 연결은 미해결. A2 전체는 **IN_PROGRESS**, 사용자 28개 중 **9 COMPLETE / 19 OPEN** 그대로.

### 발견 사실 (실제 운영 SQL 카탈로그)

- 기존 `private.attendance_mutation_audit_v1`은 RLS+비공개, 3개 원본 테이블 `attendance_events`, `event_corrections`, `correction_requests` 각각 `AFTER UPDATE OR DELETE` 감사 트리거 및 TRUNCATE 방어 트리거 총 **6개**. 개인/일반 로그인 직접 SELECT 불가. 감사표 자체에는 UPDATE/DELETE와 TRUNCATE를 막는 **2개 v2 트리거** 활성.
- 별도 감사표 기존 operation CHECK는 **UPDATE/DELETE만 허용**, row_before는 NOT NULL. 즉 `event_corrections` 수기 정정과 `correction_requests` 직원 정정요청의 새 **INSERT는 source 자체에는 남지만 private 감사지문 이력은 생성하지 않음**. 기존 감사표 0행은 사고 발생 증거가 아니라, 현재 추가 AFTER INSERT 이력이 없었다는 운영 실측 상태.
- 운영 기존 `event_corrections`의 `action='VOID' AND event_id IS NULL` **8건**은 모두 2026-10에 생성, new_event_at·new_event_type NULL, reason에 [VOID_ADD:] 표식 없음. 실제 이벤트 참조 0건이며 과거 수기정정이나 지급액과 무조건 연결하지 않는다. **임의 재연결·삭제·급여 변경 금지**.

### 새로운 실개발 + 실 PostgreSQL 격리 검증

- [PR #1552](https://github.com/koith/attendance-proto/pull/1552) merged main **5a40968c496420d0de707f9fc7a01c1fb0dc34c1**, 전체 PR CI **56/56 SUCCESS**.
- 수정 범위는 `security/sec_a2_correction_insert_audit_v3.sql`, 데이터 보존형 별도 rollback, 합성 fixture, PG16/17 workflow, no-operating-write scope 가드 총 **6개의 보안전용 파일**. 공개 앱 `index.html`, Edge/GAS, Sheets, 직원/급여·근태 데이터 변경 0.
- 새 이력은 기존 보호된 `private.attendance_mutation_audit_v1` 사용. operation CHECK에 **INSERT 추가**, row_before NULL 허용, **INSERT/UPDATE/DELETE의 before/after JSONB형태 CHECK** 추가; `public.event_corrections` 및 `public.correction_requests` **AFTER INSERT** 트리거 2개, 내부 `private.sec_a2_capture_correction_insert_v3()` 실행권한 anon/auth/service_role/public REVOKE. 생성 때 `row_before=NULL, row_after=NEW` 기록. 원본 수정/삭제 전용 트리거·기존 감사표 불변 방어는 변경하지 않음. 초기부터 과거 8건을 소급 변경/감사 위조하지 않음.
- 실제 [PG16/17 격리 SQL CI](https://github.com/koith/attendance-proto/actions/runs/42571181889) **2/2 PASS**. 기존 v1+v2 SQL을 그대로 불러 source INSERT 생성 시 private 감사 0건을 재현. 새 v3 실행 뒤 새 정정/직원 요청 CREATE 2건, UPDATE 1건, DELETE 1건이 **private 4행**으로 남는지 확인. 비공개 직접 권한, 감사행 UPDATE/DELETE 금지, 이전 SQL rollback을 적용해도 이전 4행은 그대로 보존되는지 확인. 전체 테스트는 가상 직원·가상 요청만 활용, 독립 PG transaction `ROLLBACK`으로 끝냄.
- 별도 rollback은 기존 감사표의 새 INSERT 행을 삭제할 수 없도록 의도적으로 제약의 새 구조는 보존하고 새 INSERT 트리거·함수만 비활성화. 이미 발생한 감사 이력 손실을 허용하는 잘못된 다운그레이드가 되지 않도록 설계.

### 실제 운영 Supabase 적용·검증

- 실운영 배포 전 가드: 기존 감사표 0행, 이전 6개 소스 트리거 활성, audit immutability 2개 활성, 기존 operation constraint UPDATE/DELETE, row_before NOT NULL, 신규 함수·트리거 미존재, public/anon/authenticated 감사표 읽기 권한 없음 확인.
- 실제 `security_a2_correction_insert_append_only_audit_20261109` Supabase migration 적용 **SUCCESS**. 적용 후 PostgreSQL 카탈로그에서 event_corrections/correction_requests의 새 AFTER INSERT trigger **2/2 enabled**, 이전 UPDATE/DELETE/TRUNCATE trigger **6/6**, private immutability **2/2** 유지, operation check INSERT/UPDATE/DELETE, row-shape check 존재, row_before NULL 허용, anon/auth 직접 audit SELECT 및 trigger function EXECUTE 권한 false.
- 바로 적용 후 `event_corrections` **134행**, `correction_requests` **1행** 이전과 동일, `private.attendance_mutation_audit_v1`은 **0행**. 즉 **새로운 실제 정정 발생 시 최초 audit INSERT receipt**는 아직 없음. 적용 중 운영 POS 근태 raw event 수는 이전 371→374로 증가했으나 이는 정상 매장 업무와 겹치는 시간이며 이번 migration이 attendance_events를 수정한 것은 아니다. 운영데이터를 일부러 INSERT/DELETE하여 테스트하지 않음.
- [main P0](https://github.com/koith/attendance-proto/actions/runs/42571421365) SUCCESS, Pages build/Deploy/Safari/Sheet 갱신 SKIPPED, 실제 운영 페이지 v0.384 웹 HTTP 로드 정상. 보안 migration 후 hosted 공개 Chromium/WebKit 브라우저 READ ONLY 재실행 #42445633952은 별도 검사 중; PASS를 얻으면 추가 Issue receipt로 기록한다.

### 추가 읽기 전용 A3 / 미완료 구분

- 2026-11-09 운영 `event_corrections`에서 auto-close 기록 총 **23건**(유효 SYS_STORE_CLOSE 기준 **9건**) 관찰, `payroll_snapshot`, `payroll_period`, `payroll_period_employee` 3곳 모두 **0행**. 운영의 실제 확정 지급액·직원별 정산 내역이 이들 테이블에 없으므로 시트/계약·지급자료까지 대조하지 않으면 급여 일치 A3 COMPLETE 판정 불가.
- 28 세부 항목 **COMPLETE 9 / OPEN 19**. 완료 S1 S2 S6 B4 R1 R4 A4 D1 D3. **BACKUP/RESTORE/B1,B2,B3,B5,B6,R2,R3,R5,R6,D5**는 통합 최신 전체 원본·독립 키·완전 실복원 선행. **S3 S4 S5** 실제 운영 JWT/Storage/Realtime·권한별 현장 로그인. **A1 A2 A3** 실 사용자 동시 경합·새 정정 audit receipt·과거 8건·정확한 지급 자료. **D2 D4 D6** 전체 QA1243·실물 iPhone/PC·완료 판정. 운영 보안 SEC 18 대과제 **1/18**, 서비스 최종 복원/보안 **NO_GO** 유지.

## V. 2026-11-09 B5 암호화 DB 에스크로 56/56 실수신·SHA-256 완전검증 및 Free 백업 정책 (9/28 유지)

> 아래는 구버전 암호화 **사본의 무결성·보관 사실만 실검증**한 결과다. 복호화키를 가지고 최신 운영 pg_dump·DDL/sequence/Auth/Storage 전체본을 다시 복원한 것이 아니므로 B1/B2/B3/B5/B6/R2/R3/R5/R6/D5는 모두 미완료로 유지한다. 개인 Google Drive 파일의 ID/URL·암호문/계정정보는 공개 원장에 기록하지 않는다.

### 실제 비공개 보관본 원격 무결성 (VERIFIED)

- Google Drive 개인 소유자 1명, `shared=false`, 파일 유형 native Google Sheet, 제목의 `PRIVATE - attendance-proto encrypted logical DB escrow 2026-11-03`는 이전의 DB 논리 에스크로용 기록. 이 자체는 암호문 저장 용기이며 실제 pg_dump/custom archive임을 입증하지는 않음.
- metadata로 실제 단일 `Sheet1` 확인 후 첫 줄을 읽어 `PGP_ESCROW_V1`, SHA-256 64자 hex manifest, `500427` 암호문 크기, `56` 분할 조각 선언 확인. 56개 셀 전체를 **여러 개의 범위 읽기로 전수 회수**, 조각 누락 0, 각 55개 앞 조각 12,000문자, 마지막 7,236문자, 총 base64 667,236문자(= 500,427 raw bytes의 적정 base64 길이)로 복원.
- 보안된 실행 내부에서만 base64→`Uint8Array`로 **500,427 bytes** 재조립. 독립 JavaScript SHA-256 구현을 공식 `abc` 표준 테스트 벡터로 먼저 검증한 뒤, 실제 raw 암호문 SHA-256을 계산해 보관본 1행에 저장된 64자리 해시와 **완전 일치 확인**. 암호문·개인키·직원/급여 평문은 출력·공개·타 저장소 전송하지 않음. 이는 단순 파일명/셀 개수 확인을 넘어 **원격 암호문 전체 무결성 검증**이다.
- 그러나 PGP 복호화, 98개 기존 운영 논리 테이블/42,235행의 정확한 스냅샷 버전/범위, 실제 데이터·DDL·권한·시퀀스 포함 여부 및 격리 PostgreSQL 복구까지 이번에는 입증하지 않았다. `PGP_ESCROW_V1` 사본은 11월 3일 보관본이라 11월 9일 현재 최신 운영 원본과 동일하다고 할 수 없다.

### 실제 요금제와 B1·D5 자동백업 의존성 (VERIFIED)

- Connected Supabase `get_project`에서 운영 프로젝트 active healthy, 실제 Supabase `get_organization` 결과 `plan=free` 확인. 공개 문서 [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) (2026-11-05 갱신) 및 [Free-plan backup FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups) (2026-10-30 갱신): **Free에는 자동 일일 DB 백업이 제공되지 않음**. 외부 GitHub Actions의 별도 백업 자동화가 실제 동작해야 한다.
- 별도 2026-11-09 공식 확인: Free라도 Supabase CLI `db dump` 또는 `pg_dump`로 **사용자 권한 범위 내 자체 정기 백업이 가능**하므로, 자동 백업을 위해 무조건 유료 전환하거나 PITR 구매가 필요한 것은 아니다. 현재 GitHub 보호환경의 `SUPABASE_DB_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ACCESS_TOKEN` + `SEC_BACKUP_ENV_READY` 값이 실제 성공 실행에서 바인딩되지 않은 문제는 기존 SEC-S6 조사·백업 작업 실패에 남아 있다. 재접속 자격증명 확보/안전한 저장과 실제 전체 pg_dump가 필요하다.
- Supabase의 내부 WAL archive counter는 사용자 보유의 복원 가능한 프로젝트 전체 백업·가용 PITR을 보증하지 않는다. **기존 암호화 논리 사본의 SHA-256 일치와 운영 전체 무손실 복원 PASS는 엄격히 분리**.
- 따라서 완료 **9/28** (S1,S2,S6,B4,R1,R4,A4,D1,D3), 미완료 **19** 그대로. 진짜 백업을 만들거나 현장 사용자가 실제 정정을 수행하기 전에는 B5·A2를 COMPLETE 처리하지 않는다.

## W. 2026-11-09 운영 DB 신규 암호화 스냅샷: B2/B5 범위 수용 (완료 11/28)

> **최신 판정(기존 I~V 과거 판단보다 우선): 28개 중 11 COMPLETE / 17 OPEN.** 이번에는 실제 운영 데이터의 101개 테이블을 2026-11-09 새로 수집하고, 두 개의 소유자 통제 저장소에서 암호문 바이트와 해시를 비교한 후, 키를 이용해 **실제 42,329개 JSON 행을 전수 파싱하고 독립 메모리 DB에 재적재**했다. 따라서 *데이터 포함 범위*인 B2, *암호화 장기 보관*인 B5는 수용한다. 그러나 이 커스텀 논리 데이터본은 PostgreSQL native pg_dump/pg_restore 백업이 아니며 DDL·역할·서비스를 실제 PostgreSQL로 재구성한 증거는 없다. B1/B3/B6/R2/R3/R5/R6/D5 및 SEC-S01/S04의 완전 복구는 **NO_GO** 그대로.

### 독립 수행 영수증 — B2 실제 행 내용 포함 수용

- 실제 프로젝트 운영 PostgreSQL에서 `public`, `auth`, `storage`, `private`, `session_guard` **5개 스키마 / 일반·파티션 본체 101개 테이블**를 단일 **SELECT**로 JSON row+XML 래핑해 수집; 원본 근태·급여·Auth/Storage 데이터 수정/삭제 **0**.
- 스냅샷 포맷 `baekeok-readonly-encrypted-logical-db-snapshot-v1`, 캡처시간 **2026-11-09 10:41:09 UTC (19:41 KST)**, PostgreSQL 17. 원시 JSON 약 **15,402,756 bytes**. 암호화된 스냅샷에서 키로 복호화 뒤 실제 각 행 JSON 유효성까지 전수 검사했으며 **101/101 테이블, 42,329/42,329 행** 파싱 PASS. 테이블 분포: `public=61`, `auth=27`, `storage=10`, `private=2`, `session_guard=1`.
- 감사된 중요 테이블은 `public.employees`, `public.attendance_events`, `public.event_corrections`, `public.stores`, `public.admin_users`, `public.employee_documents`, `public.payroll_period`, `public.payroll_period_employee`, `public.payroll_snapshot`, `auth.users`, `auth.sessions`, `auth.refresh_tokens`, `storage.objects`, `private.attendance_mutation_audit_v1`. 이들 미존재/중복/컬럼 메타 누락일 경우 검증기가 FAIL-CLOSED.
- 스냅샷에는 구조 메타데이터 **함수 305개, 시퀀스 37개, 확장 7개**, 뷰·인덱스·트리거·RLS 정책·제약조건·컬럼 정의·schema/role/membership 정보 포함. 검증기는 외부 직원 원문을 출력하지 않음.
- 독립 재적재 검증: 암호문에서 복호화한 각 행을 **SQLite `:memory:`의 `restored` 테이블에 42,329행 전건 재삽입**, 원본 스냅샷 각 테이블별 행 수와 격리 DB 재적재 결과를 비교해 101개 모두 PASS. 이 테스트는 데이터 사본의 재사용·파싱가능성을 실증한 것이지 PostgreSQL DDL/권한/서비스 완전 복원 검사가 아님.
- Native `pg_dump` 목차와 트랜잭션 전체 시점/role/config 재구성은 미입증이므로 **B1/R2/R3 및 SEC-S01을 수용하지 않음**. 새 스냅샷 캡처 이후 운영 중 발생한 새 출퇴근은 포함되지 않으므로 최신 실시간 전체 운영 상태라고 주장하지 않음.

### 독립 수행 영수증 — B5 암호화·소유자 통제 보관 수용

- PostgreSQL `pgp_sym_encrypt` AES256 + 압축, 난수 64hex 복호화키는 SQL 커밋에 넣지 않고 별도 보관. **암호문 505,769 bytes**, SHA-256 **`89e07dddad243131f220f4612fe359a7a2ff04797c8ff3f65e82953b97811cd3`**.
- 사용자 소유 **비공개 Google Drive** native Sheet는 57개 분할 12,000문자 셀, 총 base64 **674,360 chars**. Drive owner 1명, `shared=false` 확인. 이후 Sheet에서 **57/57 셀 전부 다시 조회**, 별도로 Drive CSV export를 실제 다운로드해 복호화 없이 base64 디코딩→SHA256 검증.
- 사용자 개인 **ChatGPT Library /Attendance-Recovery**에 별도 완전한 encrypted `.pgp` 백업(505,769 bytes) 보관. 동일 세션 새로 materialize한 Library 사본과 위 Drive CSV export에서 복원한 암호문 **505,769 byte 전부 단위로 일치**, SHA-256도 동일.
- 별도 개인 Library에 키 JSON 저장 후 **Library에서 새로 materialize한 키**로 암호문 GPG 실제 복호화 성공. 단, 동일 Library 서비스 내 키·암호문이 함께 있으므로 **키 오프라인 독립 이중 보관(B6)** 이 검증됐다고 주장하지 않음. 공개 GitHub/Issue에는 Drive 개인 파일 ID/URL, 키·암호문·직원·급여 원문 없음.
- 과거부터 별도 암호화 원본으로 보존된 Storage **14/14 실제 파일**은 기존 B4 COMPLETE 증거를 유지. 새 DB SQL 스냅샷의 Storage는 *메타데이터*이고 파일 본문은 기존 별도 암호화 Storage 사본이다. 두 자료가 하나의 동일 시점 트랜잭션으로 보장되거나 API 복원이 완료됐다는 의미는 아님(R5 미완).
- 재사용 검증기 `scripts/security/sec_b1_verify_encrypted_logical_backup.py`: 잘못된 키, 변조된 ciphertext SHA, 키 JSON 형식 오류를 모두 거부하고 정상 합성 백업 검증 4/4 통과. 실제 비공개 백업에도 동일 검증기 사용, 결과 101개 테이블/42,329개 행 PASS. 보안전용 synthetic GitHub CI는 **공개 저장소에 실제 암호문/키를 업로드하지 않음**.
- **B5 범위는 보관 자체까지 COMPLETE**. 백업 *자동 실행·보관주기·실패 알림(D5)*, 최신 DB/Auth/Storage 통합 시점과 전체 복구 가능 판정(B1/B3/B6/R2/R3/R5/R6)은 별도 수용 조건으로 남긴다.

### 28개 최신 수용 체크 (11/28)

| 업무 | 최신 판정 | 정확한 수용 범위 / 남은 검증 |
|---|---|---|
| B1 | **OPEN** | 정식 pg_dump / 완전한 트랜잭션·DDL·role 복구 가능 전체 백업 미검증 |
| B2 | **COMPLETE** | 101 테이블 / 42,329 실제 행, 필수 직원·근태·급여·Auth·Storage 자료 포함, 격리 메모리 재적재 완료 |
| B3 | **OPEN** | Auth 운영 외부 설정/GoTrue 서비스 재구성 미검증 |
| B4 | **COMPLETE** | 기존 암호화 Storage 실제 14개 파일 완전성 수용 유지 |
| B5 | **COMPLETE** | 최신 암호화 DB 사본 Drive+Library 독립 재수신, 바이트·해시 일치, 별도 Storage 보관 |
| B6 | **OPEN** | 별도 복호화 성공, 오프라인 독립 키 이중 보관 미검증 |
| R1 | **COMPLETE** | 격리 복구 환경 준비 |
| R2 | **OPEN** | 실제 PostgreSQL 전체 DB DDL·데이터 복원 미완 |
| R3 | **OPEN** | PostgreSQL ACL·sequence·role·row 전체 대조 미완 |
| R4 | **COMPLETE** | 격리 GoTrue 세션 실인증 검증 |
| R5 | **OPEN** | Storage 객체 본문 및 API 실제 서비스 복구 미완 |
| R6 | **OPEN** | 실제 운영 중 델타 무손실 재적용 미완 |
| S1 | **COMPLETE** | 익명 SECURITY DEFINER 분류 |
| S2 | **COMPLETE** | 익명 불필요 권한 회수 |
| S3 | **OPEN** | 운영 본사·점주·보조·직원 전체 signed JWT E2E |
| S4 | **OPEN** | 타 지점 권한별 전체 HTTP 데이터/Storage 접근 검증 |
| S5 | **OPEN** | 모든 관리자 API 단일기기 강제 및 구세션 실HTTP 검증 |
| S6 | **COMPLETE** | GitHub secret/PAT 의존성 전수 감사 |
| A1 | **OPEN** | 중복 VOID_ADD 운영 코드 수리됨, 실제 매장 단말 경합·급여/Sheet 검증 미완 |
| A2 | **COMPLETE (기록 보존·불변성·실정정 감사 영수증 검증)** | 운영 `event_corrections` 자동퇴근 ADD 실제 INSERT 감사 1건 내용·PK 일치; 비공개 append-only/권한/두 INSERT 트리거 정상; 과거 VOID 8건 운영/3 실제 백업 동일 보존·원본 미연결 무효 효력. 업무상 삭제 의도·실제 급여 영향 별도 SEC-S12/A3 확인 대상으로 남기고 데이터 임의 수정 없음. §AC |
| A3 | **OPEN** | 자동퇴근 9건 정산·실제 지급액 검산 미완 |
| A4 | **COMPLETE** | 시트 동기화·복구 지정 범위 수용 유지 |
| D1 | **COMPLETE** | 복구 PR 병합 |
| D2 | **OPEN** | 전체 QA1243·기능별 E2E 종단검사 미완 |
| D3 | **COMPLETE** | 게시 앱 배포 확인 |
| D4 | **OPEN** | 실제 매장 PC / 실물 iPhone 검증 영수증 없음 |
| D5 | **OPEN** | 최신 백업의 반복 주기 자동화와 실패 알림 검증 미완 |
| D6 | **OPEN** | 전체 28개 수용 후 최종 판정 |

최신 **COMPLETE = B2, B4, B5, R1, R4, S1, S2, S6, A4, D1, D3 (11/28)**. 남은 **OPEN = B1, B3, B6, R2, R3, R5, R6, S3, S4, S5, A1, A2, A3, D2, D4, D5, D6 (17건)**. 별도 SEC 18개 대과제 **1/18** 유지. 실제 PostgreSQL/GoTrue/Storage 완전 복구 최종 **NO_GO**. 본 섹션은 앞선 과거 상태기록을 삭제하지 않으며 최신 시점 판정만 갱신한다.


## X. 2026-11-11 R6 실제 운영 변경분 재적용 수용 — 11/28 → 12/28

> **정본 최신 완료 판정: COMPLETE 12 / OPEN 16.** R6의 수용 범위는 *실제 운영 백업 두 시점의 최종 행 상태를 독립 데이터베이스에 무손실 재적용하고 원본 불변·오류/재시도 방어를 검증한 것*이다. 이는 R2/R3의 실제 PostgreSQL 17 전체 복구, D5의 정기 백업·실패 알림, 임의 시점 PITR 또는 미래 변경분의 연속 무손실 보장과 다르다.

### 실제 소유자 비공개 암호화 스냅샷 두 건 — 전수 검증

- 출발점: **2026-11-09 10:41:09 UTC**, 실제 운영 5개 스키마/101개 테이블/42,329행. 보관본 2026-11-09 별도 오프라인 암호문에서 실제 복호화 및 행 JSON 파싱 검증 완료(이전 W절).
- 도착점: **2026-11-11 09:45:07 UTC**, 운영 Supabase에서 기존 승인된 백업전용 **읽기 전용 SELECT 1회**로 캡처한 새 암호화 스냅샷. 원본 SQL 결과는 57개 암호화 조각, **508,372 ciphertext bytes**, **15,434,364 plaintext bytes**. 암호문 SHA256 `5127e30e647f104161d9132e955f7c1109cdc1c5781cf084100442ee632363f8`.
- 사용자 소유 비공개 Google Drive에 새 암호화 조각 57개 저장, Google Sheets CSV로 **57/57개 전부 재수신**, base64 디코딩 후 ciphertext SHA256/길이 일치. 별도 ChatGPT 개인 Library에서도 encrypted `.pgp` 재다운로드 후 전체 바이트와 SHA256 일치.
- 해당 새 암호화 스냅샷을 비공개 임시 실행 공간에서 실제 GPG 복호화, 모든 101개 테이블의 JSON 행 **42,373/42,373개 파싱 PASS**, 함수 305개, 시퀀스 37개, RLS 정책 6개, 제약 정의 383개 확인. 평문·복호화키·실제 직원/급여/Auth 행은 공개 저장소/이슈/CI로 전송하거나 영구 파일로 출력하지 않음.

### R6 실제 운영 증분 비교·암호화·재적용 영수증 — VERIFIED

- 독립적으로 복호화한 두 시점의 실제 101개 테이블 **모든 기본키**를 대조하여 신규 **44행**, 수정 **12행**, 삭제 **0행**(합계 순증 44행), 변경 대상 12개 테이블 확인. source 42,329 → target 42,373; PK가 없는 테이블/중복 PK 0.
- 각 변경에는 원본 PK, 변경 전 행의 SHA256, 변경 후 원본 JSON, 출발·도착 스냅샷 SHA256을 결속한 비공개 증분 manifest를 생성. **실제 행과 PK는 개인 Library의 AES256 OpenPGP 암호문 안에만 보관**. 증분 파일은 5,250바이트.
- 첫 검증: 이전 실제 스냅샷 42,329행을 **독립 SQLite `:memory:` SQL 데이터베이스**에 넣고, 암호화 증분을 별도 GPG 복호화하여 44 INSERT/12 UPDATE를 **SQL 트랜잭션으로 적용**. 결과 101개 테이블의 모든 기본키·행 내용이 최신 실제 백업 42,373행과 **전부 동일 PASS**.
- 두 번째 실행: **동일 증분 재시도 후 신규 변경 0개**, 최신 101개 테이블의 행 내용 전부 동일 PASS (중복 생성·수정 없음).
- 오류 주입: 수정 대상의 기존 행을 임의 변조한 후 증분 재적용 시 **충돌 거부와 SQL SAVEPOINT 롤백 PASS**. 롤백 후 원래 42,373행 최신 기준과 전부 일치. 이전 원본 스냅샷은 수정하지 않음.
- 키 분리 강화: SQL 캡처 경로에 한 번이라도 사용한 이전 키와 혼동하지 않도록, **로컬 CSPRNG로 생성한 신규 64hex 키를 운영 SQL에 전달하지 않고** 11/09 스냅샷, 11/11 스냅샷, R6 증분을 각각 재암호화. 원래 키로 신규 파일 복호화 FAIL, 신규 키로 각각 복호화 PASS. 세 암호문과 새 키는 사용자 개인 비공개 Library에 보관, 별도 재다운로드 SHA/실복호화/SQL 재적용 검증까지 PASS.

비공개 보관본 검증 식별자 (파일·비밀·원문 내용 공개 없음):
- 11/09 isolated-rewrap ciphertext SHA256 `bcc6c88c3dd1856a8202ee633f58f44274eb633f96646828db8d8a76e0ebc0e3`
- 11/11 isolated-rewrap ciphertext SHA256 `44411c21e49053e68a1178cd6c1516d3cc58833d68a4417ff235b314aa265efd`
- 실증분 isolated-rewrap ciphertext SHA256 `54c8c575cad5953522291b668eef582562df114569f953729d4ce20250258241`

### 제한과 최종 업무 체크

- **R6 COMPLETE** — 실제 운영 두 백업 시점의 최종 데이터 상태에 대한 무손실 증분 재적용·재시도 불변성·충돌 롤백 검증 완료. 임의 중간 시점에 발생했다가 사라진 이벤트의 전체 이력, 다음 정기 백업 이전에 발생할 데이터, 서비스 복구 시 WAL 재생은 이 영수증으로 입증되지 않는다. 그러한 무손실 보장은 **B1, R2, R3, D5**에서 계속 검증한다.
- **B1 OPEN:** 실제 정식 PostgreSQL `pg_dump` 전체 복원가능 덤프 미확보.
- **R2/R3 OPEN:** 독립 **PostgreSQL 17**에서 실제 백업의 전체 DDL/ACL/RLS/Auth/Storage 서비스 복원·원본 대조 미완. 이번 SQLite는 실데이터 증분만 검증한 별도 격리 엔진.
- **D5 OPEN:** 주기별 자동 실행/보관/실패 알림 실운영 E2E 미증명. 11/11 수동 캡처 한 번만으로 정기 백업 COMPLETE 주장하지 않음.
- **B6 OPEN:** 신규 로컬 키로 복호화 PASS이나 **사용자 단말에 오프라인 독립 키 이중 보관**의 수용 증거는 아직 없음.
- 운영 DB/Auth/Storage, 실제 근태·급여·Google Sheets 원본, Pages 배포에 DDL/DML 변경 **0**. 비공개 암호화 백업·증분 사본만 추가.

현재 **COMPLETE = B2, B4, B5, R1, R4, R6, S1, S2, S6, A4, D1, D3 (12/28)**. 남은 **OPEN = B1, B3, B6, R2, R3, R5, S3, S4, S5, A1, A2, A3, D2, D4, D5, D6 (16건)**. 별도 SEC 대과제 1/18, 전체 통합 복구 **NO_GO** 유지.


## Y. 2026-11-13 SEC-S07 익명 SECURITY DEFINER 최소권한 수용 — 보안 18개 중 완료 1→2

- **실행 대상/근거 분리:** 기존 사용자 세부 복구 28항목 중 S1(분류)·S2(익명 불필요 실행권한 회수)는 이미 COMPLETE로 인정되어 있음. 이를 별도 원본 보안 18개 대과제의 SEC-S07 종료 조건과 대조해 이번에 독립 판정을 수행했다. 기존 S1/S2의 **28항목 완료 건수를 다시 중복 증가시키지 않는다**.
- **운영 DB 직접 읽기 전용 실증 (2026-11-13 KST):** `pg_proc` / `pg_namespace` / `has_function_privilege`와 실제 `pg_trigger`를 SELECT하여, `public` SECURITY DEFINER 중 익명 EXECUTE 가능한 서명은 **19개**, 익명 EXECUTE 가능한 트리거 함수는 **0개**, 운영 내부 함수 `cancel_revoked_owner_invitation()`과 `store_assistant_invitation_default_permissions()`는 각각 **anon 실행 false**, **authenticated 실행 true**, **실제 활성 트리거 연결 true**를 확인했다. 생산 레코드와 사용자·관리자·Auth 데이터 변경 0.
- **전체 21개 원위험 분류:** 이전 승인된 운영 S1 카탈로그에서 PIN 검증 필수 14개, POS 토큰 필요 1개, 공개 목록/레시피 4개, 내부 트리거 2개로 정확히 분류. 비의도적 익명 직접 호출이 가능한 내부 트리거 2개는 [PR #1534](https://github.com/koith/attendance-proto/pull/1534), 운영 migration `20261107140221_revoke_anonymous_internal_admin_trigger_execute_20261107`에서 **PUBLIC/anon EXECUTE 제거**를 이미 실제 적용했다. 나머지 19개는 기존 인증 PIN·토큰 또는 의도된 공개 화면 경계에 속하므로 무차별 REVOKE로 공개 기능을 파괴하지 않는다.
- **실 DB/브라우저 회귀 재사용:** [GitHub Actions #42379448748](https://github.com/koith/attendance-proto/actions/runs/42379448748) PostgreSQL 16+17 두 job **2/2 SUCCESS**. 익명 거부 후에도 관리자 트리거 작동 및 기존 공개 RPC 보존. 실제 게시 Pages [#42370982709 attempt 3](https://github.com/koith/attendance-proto/actions/runs/42370982709) SUCCESS: 공개 직원 카드 HTTP/표시, PIN·급여 비노출, 익명 관리 비인가와 미개통 지점 접근 차단을 Chromium/WebKit 모바일·PC에서 통과. 기존 PR #1534 전체 **51/51** 검사 성공 기록 확인.
- **수용 기준:** SEC-S07 "익명 SECURITY DEFINER 함수 분류/불필요 권한 최소화/회귀" 충족. 전체 `authenticated` 고권한 함수 감사(**SEC-S08**), 실제 서명 JWT 경계(**S3/S4/S5**, SEC-S05/06/09), 물리기기(**D4/S18**)를 SEC-S07로 확대해 완료 처리하지 않는다.
- **서로 다른 원장 정산:** 보안 대과제 18개 **COMPLETE 2 / OPEN 16**(SEC-S03·SEC-S07), 사용자 세부 보안·복구 28항목 **COMPLETE 12 / OPEN 16**(변경 없음). 전체 운영 시스템 복원 GO 판정은 계속 **NO_GO**.


## Z. 2026-11-13 SEC-S16 — 실제 운영 3시점 연속 무손실 증분 복구 수용 (SEC 2/18 → 3/18)

> **정확한 수용 범위:** 정본 SEC 18개 대과제의 "운영 중 실제 신규 데이터 변경분 보존·재적용과 개발/운영 DB 분리"를 최신 실제 보관본 3개에 대해 수용. 운영 PostgreSQL 전체 서비스·Auth·Storage를 재기동하거나 실제 급여 지급액을 검산했다는 뜻이 아니다. 세부 복구 원장 28개 중 R6는 **이미 COMPLETE**였으므로 완료 건수를 중복 증가시키지 않는다.

### 재검증한 실제 암호화 운영 백업 — 운영 DB 읽기/쓰기 0

- 소유자 비공개 Library 원본의 암호문을 격리 로컬 실행 공간에서 별도 복호화: **2026-11-09 10:41:09 UTC** 101테이블/42,329행, **2026-11-11 09:45:07 UTC** 101테이블/42,373행, **2026-11-11 15:31:32 UTC (11-12 00:31 KST)** 101테이블/42,376행. 셋 모두 복호화 후 row-JSON 완전 파싱, 테이블별 PK 구조·중복·행 수 검사 PASS. 11-12 암호문 SHA-256: `a2a09af8060f7e58d9d3f05a1cd363c07d332c0119b08c1327e6abdd431adbef`.
- 기존 11-09→11-11 실제 암호화 증분(원장 §X): **44 INSERT + 12 UPDATE**, 실제 12개 테이블 변경. 독립 파서로 GPG 복호화 후 **SQLite `:memory:`의 PK/행 전체 트랜잭션 복원**. 기존 원본 row의 SHA-256 사전 일치 확인 뒤 INSERT/UPDATE, 도착지 42,373개 **모든 PK와 정규화한 실제 행 내용 동일** PASS; 같은 증분 재적용 시 신규 변경 0, 임의 원본 행 변조 시 해시 충돌 거부·SQL SAVEPOINT 전체 롤백·복원 42,373행 그대로 PASS.
- 11-11→11-12 실제 보관본 비교에서 새로운 **3 INSERT(`public.attendance_events`) + 2 UPDATE(`public.sheet_sync_change_state`, `public.sheet_sync_month_state`)** 검출. 새 증분은 임의로 만든 테스트 레코드가 아니라 **기존 운영 두 스냅샷 사이에 실제 바뀐 행**이며, 소유자 비공개 라이브러리에만 개인 데이터가 있는 원문과 PK/원본 해시를 AES256 GPG로 암호화해 저장. 이 증분을 42,373행 복원본에 적용하여 **42,376/42,376행 정확 일치**, 재실행 시 변경 0. 이전 구간에는 실제 근태·계약/근무요일·직원·Auth 세션·시트 동기화 상태 변경이 포함됨. 실제 급여 마감 지급 내역의 별도 확정/정산은 **A3·SEC-S11/12 미완료** 유지.
- 신규 개인 암호화 산출물: `/Attendance-Recovery/baekeok-production-delta-20261111-to-20261112-20261113-private-encrypted.pgp` (1,002 bytes), SHA-256 `5faad367a6e5159150ca54d1e9aab9f9b53ec543953ed446ecf387a923b4fc2f`. 개인 Library upload 성공 후 **새로 재다운로드한 1,002바이트 전수 비교·SHA 일치** 검증. 재검증 도구 `/Attendance-Recovery/tools/sec_s16_private_three_snapshot_replay.py` 별도 개인 보관. 공개 GitHub에 직원/급여 행·개인 키·암호문·복호화 결과 원문 0.
- **운영 데이터·외부 설정 변경 없음:** 본 복구 재생에 사용한 데이터는 소유자 비공개 보관본만이며, **운영 Supabase DB/Auth/Storage DML·DDL, 실제 근태·급여, Google Sheets, Pages, Secrets/PAT 변경 0**. 별도 사전 현황 조사에서 운영 PostgreSQL의 카탈로그·감사 집계를 **읽기 전용 SELECT**로 조회한 사실은 명확히 구분한다. 외부 공개 저장소는 이 메타데이터·건수·SHA·안전 한계 문서만 변경.

### 누적 완료 및 재수용 불가 범위

- **SEC-S16 COMPLETE**: 지금까지 실제 생성된 2개 연속 백업 간 변경분의 원본 불변·실행 전 SHA 결속·재적용·충돌 거부·재시도 무변경성을 실제 암호화 운영 사본 3개로 재현. R6와 동일한 데이터 보존 원리이지만 더 최신 시점에서 독립 재수행했고 개인 보관본에 새 증분을 추가함.
- **중요한 제약:** 실제 미래 운영의 임의 컷오버 시점에 발생했다가 사라지는 중간 이벤트, WAL/PITR, 별도 관리자 Auth 세션 및 Storage API 복구, 전체 PostgreSQL17 DDL·역할·ACL/시퀀스 복원, 물리 매장 PC/iPhone 실운영, 확정 지급액을 포함한 정산 일치는 입증하지 않았다. 이것은 `B1/R2/R3/R5/S3/S4/S5/A3/D4/D5` 및 `SEC-S04/S06/S09/S11/S12/S18`의 완료를 대신하지 않음. 최종 복구 **NO_GO** 유지.
- **서로 다른 정본 원장 분리:** 운영 보안 18대 과제 COMPLETE **3 / OPEN 15** (SEC-S03·SEC-S07·**SEC-S16**), 사용자 세부 28과제 COMPLETE **12 / OPEN 16** (R6 이미 완료; 이번 신규 완료 0). 기존 18/28의 역대 수치는 당시 상태 기록으로 그대로 보존.


## AA. 2026-11-13 SEC-S08 운영 authenticated SECURITY DEFINER 214개 전수 감사 수용 (SEC 3/18→4/18)

- **정본 판단 범위:** 2026-11-03의 213개는 구버전 카탈로그 수량이다. **2026-11-13 현재 214개**를 전수 조사했고, 운영 SQL로 단순 건수뿐 아니라 함수 **214개 각각의 정의 본문, 오버로드 서명, EXECUTE ACL, 반환형, SET search_path, 호출된 권한검사 함수**를 분류했다. 운영 사용자/급여/인증 토큰 원문·개인정보를 조회/반출하지 않았다.
- **재현 가능한 실제 운영 영수증:** `security/readonly_sec_s08_authenticated_acl_20261113.sql` (SELECT 전용)을 PostgreSQL 17 운영 Supabase SQL 인터페이스로 실행한 후, **GitHub 브랜치에 업로드된 정확한 파일을 다시 읽어 그대로 재실행**했으며 동일한 통계 결과를 확인했다. 정적 문자열 검사만으로 안전성을 확정하지 않고, 핵심 검사 호출 대상인 `public.is_hq_admin`, `public.can_manage_store`, `public.store_scope_can`, `pin_private.verify`, `public.staff_stocktake_verify`의 실제 운영 정의도 별도 확인했다. 메일 확인·계정 삭제/차단·관리자 역할·지점 일치·PIN bcrypt·지점 상태 및 위임 범위 검사 등이 코드에 존재한다. 이는 실제 JWT 서명 HTTP 테스트와 구별된다.
- **전수 결과:** PUBLIC 스키마 SECURITY DEFINER이면서 authenticated EXECUTE인 서로 다른 OID **214**(SQL 13, PL/pgSQL 201). authenticated 전용 **195** 중 코드에서 인증·관리/지점 범위 검사를 호출하는 함수 **193**, 내부 트리거 전용 함수 **2**(일반 HTTP 직접 RPC 반환형이 아님; 운영 트리거 2개 활성 연결, anon EXEC 불허). 익명과 authenticated 모두 호출 가능한 **19** 중 의도된 공개 목록·카드·레시피 **4**, 직원 PIN 실검증 흐름 **14**, 64hex POS 토큰의 SHA256 digest 인증 흐름 **1**. 14개 모두 호출 본문에 `pin_private.verify` 또는 `staff_stocktake_verify` 및 실패 처리 경로를 확인. 관리 관련 이름 접두함수 **184**: admin_ 133 / hq_ 27 / store_ 24.
- **보호 표면 검증:** 전수 함수 미분류 **0**, 익명/인증 스키마 `public`·`extensions` CREATE 권한 모두 **false**, 고정된 `search_path`가 없는 함수 **0**, 실행 함수 코드에 `raw_user_meta_data`/`user_metadata`를 직접 권한 근거로 참조한 함수 **0**. 함수 출처 없는 신규 익명 접근은 SEC-S07(이미 COMPLETE)의 19개 분류와 일치. [SEC-S07 운영 SQL+실환경/PG16/17 QA](https://github.com/koith/attendance-proto/pull/1574) 증거는 별도로 유지.
- **완료 기준과 제한을 명확히 분리:** SEC-S08이 요구하는 `authenticated EXECUTE 보유 함수 전수 권한·코드 감사`는 **COMPLETE**. 검사 결과가 정적 보안가드 검증에 해당하며 사용자별 실제 서명 JWT 악용 가능성, 모든 조합의 고권한 호출, 타지점 Storage/Realtime·관리자 이전 JWT 차단은 **SEC-S05/06/09 및 S3/S4/S5 OPEN**; 무작정 EXECUTE 회수해 정상 공개 POS 기능을 손상시키지 않는다. PostgreSQL 코드/ACL 쓰기 **0**, 운영 근태·급여·Auth/Sheets 변경 **0**.
- **이중집계 금지:** 보안 대과제 **COMPLETE 4 / OPEN 14** (SEC-S03, SEC-S07, **SEC-S08**, SEC-S16). 세부 복구 28항목 **COMPLETE 12 / OPEN 16** 그대로; 전체 복구 GO 여부 **NO_GO**.


## AB. 2026-11-13 SEC-S05 운영 익명/비로그인 관리자·근태·급여 접근 차단 HTTP 실증 (SEC 4/18→5/18)

- **검증 목적/정확한 수용 범위:** 비로그인·익명·위조 JWT가 운영 중인 근태·급여·HQ/지점 관리자 자료를 읽거나 비인가 관리자 RPC를 실행할 수 있는지를 **실제 호스팅 데이터 API와 실제 게시 Pages**에서 검증. 이미 수용된 SQL 함수 카탈로그 SEC-S07/S08의 214개 집계 및 보호 코드 내용과 합쳐 익명 경계 판정. 실제 관리자/보조/직원 역할의 서명된 JWT 경계(SEC-S06/09, S3/S4/S5)나 물리기기 검증(D4)은 여기에서 완료 처리하지 않는다.
- **실행 직전 운영 SQL 사전 게이트:** `security/readonly_sec_s05_unauthorized_rpc_preflight_20261113.sql` (실운영 PG17 SELECT만 실행)를 GitHub 파일 그대로 조회해 DB에 실행. `admin_list_admins`, `admin_list_auth_users`, `admin_list_all_employees`, `admin_employee_contract_statuses`, `admin_payroll_period`, `admin_events`, `hq_store_catalog`, `store_limited_employee_list`, `store_attendance_events`, `admin_store_payroll_contracts_v4` **10/10** 실제 정의 존재/SECURITY DEFINER, `anon EXECUTE=true` **0/10**, DML/side-effect 본문 **0/10**. 없는 함수 0/10. 이 선행 검증 없이 운영 쓰기 가능 함수를 HTTP에서 호출하지 않는다.
- **실제 HTTP 증거:** [PR #1577](https://github.com/koith/attendance-proto/pull/1577)의 [Live version-controls QA](https://github.com/koith/attendance-proto/actions/runs/43341180732) `live-controls` SUCCESS. 운영 PostgREST에 존재하는 위 10개 읽기 전용 RPC를 **정상 공개 anon bearer / Authorization 없는 apikey / 인증 사용자를 사칭한 서명 위조 JWT** 3모드로 30회 호출. **30/30 HTTP 401 또는 403**이었고 응답 원문·개인정보·관리자 자료는 읽거나 출력하지 않았다. 404 오류나 200 빈 결과는 성공으로 인정하지 않는 fail-closed 테스트다.
- **실제 민감 테이블 및 위조 JWT:** 기존 `qa_live_anonymous_sensitive_readonly_v1.mjs` 동일 실서비스 실행, 익명에게 중요한 7개 테이블 중 **RLS 200 빈 배열 6개, 명시 거부 1개, 반환 레코드 0건**, 위조 JWT의 `admin_users` GET은 HTTP **401**. 외부에 개인정보·급여 값 출력 0.
- **의도된 공개/직원 PIN 경계 비회귀:** 실운영 함수 카탈로그 214개 전수(SEC-S08) 및 익명 허용 19개(SEC-S07)에서 **공개 서비스 UI 4, 유효 PIN 요구 14, POS 토큰 요구 1** 분류·검증을 이미 통과. 이들은 익명임을 이유로 일괄 REVOKE하면 직원 출퇴근과 공개 화면이 고장나므로 변경하지 않았다. 게시 Pages **v0.385** Chromium/WebKit PC/모바일에서 공개 직원 카드 4회 정상, 미개통 STAGED 화면 4회 접근 차단, 실제 공개 RPC·화면 데이터 일치. 테스트 코드에서 미승인 운영 변경 호출은 브라우저 라우팅에서 실행 전 차단.
- **안전/제약:** 실근태, 급여, 직원, Auth 사용자/세션, Storage, Google Sheets, Supabase 운영 구성 변경 **0**. 익명 HTTP 테스트는 위 *읽기 전용* 관리자 RPC 10개만 POST하고, 사용자의 실제 ID·PIN, 근무 이벤트 ID·개인 값은 포함하지 않았다. PIN 기반 직원 `punch`의 잘못된 PIN에 의한 **실운영 변경 시도는 고의로 생략**했으며, 함수 내부 검증/PG16·17 격리 QA는 기존 SEC-S07/S10 근거로 유지한다. 따라서 모든 가능한 악성 요청에 대한 수학적 증명이 아니며, 실제 서명된 고권한 JWT·타지점 공격 검증을 대신하지 않는다. 반증 가능성이 남는 SEC-S06, SEC-S09, S3/S4/S5는 모두 OPEN.
- **릴리스/재현 증거:** 공개 자격증명은 기존 게시 앱에서만 읽고 CI 로그에 출력하지 않으며, `qa_live_sec_s05_unauthorized_rpc_readonly_v1.mjs`는 검증된 10개 화이트리스트만 호출. 신규 안전경로는 `scripts/security/no_operating_write_scope.mjs`에 **정확한 두 파일**만 추가, 범위 회귀 테스트 및 [PR #1577](https://github.com/koith/attendance-proto/pull/1577) **61/61 모든 Actions SUCCESS**(본 원장만 추가되기 전 검증 HEAD). 문서 합류에 대한 최종 PR CI와 merge SHA는 후속 검사로 확인.
- **중복집계 방지:** 보안 대과제 COMPLETE **5 / OPEN 13** (SEC-S03·**S05**·S07·S08·S16). 개별 28개 보안·복구 COMPLETE **12 / OPEN 16**(S3/S4/S5 여전히 OPEN). 전체 서비스 완전 복구 가능 여부는 **NO_GO** 그대로.


## AC. 2026-11-13 A2 — 운영 정정·삭제 이력 보존과 8건 원본 미연결 VOID 실증 (세부 12/28→13/28)

> **수용 대상은 A2의 데이터 무결성·감사 보존 기능이다.** 실제 급여 차액 계산, 근태 정정의 업무 의도/승인, 미완료된 관리자 실제 JWT·실물 단말, 미래 사건까지 포괄해 완료 처리하지 않는다. 8건을 임의로 유효 삭제로 재연결하지 않고 이력으로 보존한다.

### 1. 실제 운영 DB(읽기 전용)에서 다시 실행한 감사 영수증

- 원장 공개 검증 SQL `security/readonly_sec_a2_live_audit_orphan_custody_20261113.sql`을 GitHub 브랜치에서 다시 읽어 **운영 Supabase PostgreSQL에서 SELECT만** 실행: 감사행 1개, 실제 운영 `public.event_corrections`의 자동퇴근 `ADD` INSERT 1건과 `source_pk` 및 **전체 `row_after = to_jsonb(현재 원본)` 1/1 정확 일치**, `row_before IS NULL`(INSERT), `observed_at >= created_at` 1/1, 조작된 행 형식 0. 시스템 자동동작이어서 신원 없는 `actor_uid`은 정상적인 별도 정보이며, 사람이 서명된 JWT로 정정한 실거래의 신원 귀속 성공을 주장하지 않는다.
- **실운영 보호 기구:** `event_corrections`와 `correction_requests` INSERT 감사 트리거 **2/2 활성**, `attendance_events`·`event_corrections`·`correction_requests` UPDATE/DELETE 및 TRUNCATE 방어 트리거 **6/6 활성**, `private.attendance_mutation_audit_v1` UPDATE/DELETE 및 TRUNCATE 불변성 트리거 **2/2 활성**. anon/authenticated의 private 스키마 USAGE와 감사 테이블 SELECT 4개 모두 **false**. 기존 PG16/17 **실격리 합성 INSERT+UPDATE+DELETE 감사, 비인가 수정·삭제 거부, rollback 역사 보존** E2E는 재사용. 실제 운영 감사행 수정/삭제/추가 테스트는 절대 실행하지 않음.

### 2. 미해결 과거 VOID 8건 — 실제 보관 상태까지 조사

- 운영 `public.event_corrections`에서 `action='VOID' AND event_id IS NULL`인 **정확히 8건** 확인. 8/8의 `event_id=NULL`, `new_event_at=NULL`, `new_event_type=NULL`, 사유 텍스트 8/8 보존. 원본 출퇴근 이벤트·추가 정정 원문에 연결된 포인터 0. 따라서 이 8건은 현재 유효 펀치 원본을 **직접 삭제한 기록이 아니다**. 실제 운영 `sheet_month_attendance_projection` 및 `substitution_is_working` 함수는 원본 수정/무효를 `event_id IS NOT NULL`로 연결하고 신규 펀치는 `action='ADD'`만 추가하는 코드 조건이 있어, 이 8개 `VOID`를 유효 펀치 입력으로 처리하지 않는다.
- 실제 소유자 비공개 AES256 암호화 운영 보관본 **11/09, 11/11, 11/12 총 3개**를 로컬 메모리에서 각각 별도 GPG 복호화. 각 시점 `event_corrections` 전체는 **134 / 135 / 135행**, 이 가운데 `VOID+event_id IS NULL` 8건씩 존재. 8건 모두 **3시점에서 모든 JSON 필드·PK 완전 동일**. 비공개 포렌식 검증 도구 `/Attendance-Recovery/tools/sec_a2_private_orphan_custody_verify.py` 실행 **PASS**, 11/09 감사 auto-close 영수증 0 / 11/11 1 / 11/12 1건; 공개 기록에는 실제 ID·사용자·사유·직원 데이터·개인 키·원문을 포함하지 않는다. 개인 Library에 툴 업로드 후 재다운로드해 **파일 전체 바이트/SHA256 일치** 확인.
- **결과와 한계:** 원본에 연결되지 않은 과거 `VOID` 행을 현재 계산에서 무시하더라도, **그 당시 실제 어느 근태 기록을 삭제하려 했는지는 이 데이터만으로 단정 불가**. 이 8건을 실제 삭제로 간주해 인위적으로 근태·급여를 변경하면 데이터 변조가 되므로 절대 실행하지 않음. 당시 요청·지급액의 적정성과 원본 수정이 필요한지는 기존 **SEC-S12·A3(근태 정정·급여 차액 확인/승인)** 절차에서 별도 검증한다. *A2 기록 보존 수용*은 이 업무상 승인·오류 정정을 대신하지 않는다.

### 3. 최종 구분과 배포 안전성

- 신규 세부 복구 완료: **A2 1건**, 상세 28항목 **13 COMPLETE / 15 OPEN**. 기존 완료 12개 B2/B4/B5/R1/R4/R6/S1/S2/S6/A4/D1/D3 그대로 유지. 별도 보안 대과제 **SEC 5 COMPLETE / 13 OPEN** 변동 없음; **B1/R2/R3/R5/B6/D5/S3/S4/S5/A3** 등 필수 복구 게이트는 계속 OPEN, 전체 시스템 복구 **NO_GO**.
- 운영 SQL DML/DDL, 정정·급여 기록, 인하대 직원 또는 사용자 인증, Google Sheets, Storage, Pages 앱 소스/버전 변경 **0**. 작업은 공개 SQL과 정본 감사 영수증·private-only 검증기, 엄격한 안전 경로 테스트만 추가. 실제 정상 서비스의 기록은 고치거나 지우지 않았음.
