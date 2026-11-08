# 백억커피 운영 보안·안정화 전용 업무원장 (2026-11-03)

> **보안·운영 안정화 전용 정본 / SEC-LEDGER v1**. 기존 `PROJECT_BACKLOG_20261017.md`의 **38건(완료19/잔여19)**과 별도로 집계한다. 기존 원장·Issue·PR·Git 기록을 삭제하거나 재작성하지 않는다.
>
> 범위: 현재 운영 중인 앱의 보안·데이터 보호·복구 및 운영 인수인계. 신규 지점 개통/기능 개발/사업 확장 제외. 운영 중단, 실제 데이터 삭제·계정 이전·권리 이전 금지.
>
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
| SEC-S05 | Critical | 익명/비로그인 경로에서 출퇴근·관리자 RPC 비인가 행위 차단 | IN_PROGRESS | ACL 21 anon-definer 검출; 실제 권한별 401/403/무변경 실증 부족 |
| SEC-S06 | Critical | 본사/지점/직원·타지점 간 고권한 RPC 객체 수준 격리 | IN_PROGRESS | 과거 일부 지점 API 차단 증거 존재; 고권한 전체 RPC 회귀 미완료 |
| SEC-S07 | High | 익명 실행 가능한 SECURITY DEFINER 21개 분류·필요 권한 최소화·회귀 | IN_PROGRESS | **2026-11-03 운영 SQL 직접 재확인 21개**; 합법적 공개 기능 보존하는 함수별 분류·변경 전후 테스트 필요 |
| SEC-S08 | High | authenticated 실행 가능한 SECURITY DEFINER 213개 점검 | IN_PROGRESS | **2026-11-03 운영 SQL 직접 재확인 213개**; 133개 admin 계열 포함. 인증/권한은 별개이며 전수 실증 필요 |
| SEC-S09 | Critical | SEC-01 단일기기 관리자 세션 서버 강제·구세션 차단·롤백/실기기 | IN_PROGRESS | [#998](https://github.com/koith/attendance-proto/issues/998) / [PR #999](https://github.com/koith/attendance-proto/pull/999) WIP; 격리 검증은 존재하나 운영 활성화 미확인 |
| SEC-S10 | Critical | PIN 서버 제한/잠금·우회차단·기존 매장 PC·직원 iPhone 실동작 | IN_PROGRESS | PR #1444/#1447 및 `pin_private.settings.enabled=true` 운영 확인 보고; 전경로 비인가 시도·현장 PC/iPhone 검증 없음 |
| SEC-S11 | High | 과거 자동퇴근 10건 실제 근로 인정/차액·주휴·시트 독립 검산 | IN_PROGRESS | PR #1452 병합, v0.384 Edge v76/Pages 배포 보고; 과거 10건 직원별·월별 차액은 **미산출** |
| SEC-S12 | High | 원본 보존하며 잘못된 급여의 확인·정정 권한 절차, 일치 증빙 | UNVERIFIED | 과거 급여·정정 원본 수정 금지; 적법한 확인자 승인 전 실제 정정/마감 금지 |
| SEC-S13 | High | 수기 근태 원자적 저장·중복/겹침 차단의 운영·현장 증명 | IN_PROGRESS | PR #1450 병합·운영 RPC 존재 보고; 기존/타점·경합 실기기 검증 없음 |
| SEC-S14 | High | 미래시각 정정으로 IN/OUT 방향 반전 차단 확인 | IN_PROGRESS | PR #1454 병합 및 운영 `punch` 시간 조건 보고; 직원 실사용 검증 필요 |
| SEC-S15 | High | 공개 저장소 현재·과거 이력의 개인정보/비밀 노출 평가와 안전 조치 | IN_PROGRESS | PR #1448 탐지, PR #1449 일부 이메일 치환; 과거 Git·배포물 완전 검수 미완료 |
| SEC-S16 | Critical | 롤백 시 운영 중 신규 근태/급여 무손실·DB 코드 분리 | IN_PROGRESS | 기존 [PR #1504](https://github.com/koith/attendance-proto/pull/1504)의 검증된 증분 이벤트 검증기(CI 50/50)와 [PR #1506](https://github.com/koith/attendance-proto/pull/1506)의 합성 무손실 재적용 테스트(CI 38/38)를 현재 main 기준 독립 리뷰 브랜치에 원문 그대로 반입. ID 중복·시간 역전·원본 누락·중첩 메타데이터 충돌·재시도 검출; **실제 운영 근태/급여 트랜잭션·실백업 이후 델타 무손실 증명 미완료**. |
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
| A2 | 근태 정정·삭제 이력 보존 | **IN_PROGRESS**: 3개 테이블 수정·삭제 이력 비공개 감사/대량삭제 방어 운영 적용, PG16/17 + 운영 쿼리 + 호스티드 브라우저 PASS. 과거 원본 미연결 VOID 8건·실제 향후 운영 정정 감사 이력 검증 미완 (N절) |
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
