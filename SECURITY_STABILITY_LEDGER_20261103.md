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
| R1 | 격리 복원 환경 준비 | SYNTHETIC VERIFIED: PG16/17 폐기형 클러스터, 실백업 환경 준비 미완 |
| R2 | 실제 운영 전체 백업 복원 | BLOCKED: 전체 백업본 없음 |
| R3 | 원본/복원본 데이터·DDL·ACL·sequence 일치 | SYNTHETIC VERIFIED, 실백업 불가 |
| R4 | Auth 실로그인·세션 테스트 | UNVERIFIED: 격리 GoTrue/QA 계정 필요 |
| R5 | Storage 파일·서비스 API 복원 | IN_PROGRESS: 역사적 파일 복호화 성공, 서비스 재가동 미검증 |
| R6 | 원본 불변·오류/재시도 방어 | SYNTHETIC VERIFIED, 실제 전체본 검증 대기 |
| S1 | 익명 SECURITY DEFINER 21개 분류 | VERIFIED: 14 PIN/1 토큰/4 공개/2 트리거, SQL catalog 읽기 |
| S2 | 불필요한 익명 권한 제한 | IN_PROGRESS: 실제 우회·UX 영향 검증 필요 |
| S3 | 본사/대표/보조/직원 권한 격리 | IN_PROGRESS: 권한별 E2E 필요 |
| S4 | 지점 간 객체 수준 접근 차단 | IN_PROGRESS: 실제 세션·타지점 호출 필요 |
| S5 | 관리자 단일기기 서버측 세션 차단 | IN_PROGRESS: 구 JWT 실제 거부 증거 필요 |
| S6 | GitHub 비밀·PAT 의존성 점검 | IN_PROGRESS: 바인딩 검사 및 PAT 401, 전체 의존성 완료 아님 |
| A1 | 출퇴근 동시성·중복 차단 | IN_PROGRESS: 독립 합성 QA 존재, 운영 전경로 미검증 |
| A2 | 근태 정정·삭제 이력 보존 | IN_PROGRESS: 합성 QA 존재, 운영 재검증 필요 |
| A3 | 급여 마감·정산 일관성 | IN_PROGRESS: 합성 QA 존재, 과거 10건 개별 검산 미완 |
| A4 | Google Sheets 동기화·복구 | IN_PROGRESS: 실제 새로고침 성공, 손실 없는 격리 복구 미검증 |
| D1 | 복구 코드 PR #1520 안전 검토·병합 | VERIFIED: main commit 86a1fb52 |
| D2 | 전체 CI·회귀 검증 | IN_PROGRESS: 관련 PR 합성 테스트 통과, 종단간 전체 미완 |
| D3 | 배포 영향·버전 확인 | **VERIFIED COMPLETE**: 최종 Pages 실제 배포 HTTP 200/v0.384/JS 일치·비인가 급여 401, 후속 두 security-only main에서 UI/Edge blob 불변, P0 패스와 배포/Sheets SKIPPED 검증 |
| D4 | PC·iPhone 실기 기능 수용 | UNVERIFIED: 실제 기기 검증 증거 없음 |
| D5 | 주기 백업·보관·실패 알림 | BLOCKED: 실제 암호화 백업/복원 선행 필요 |
| D6 | 완료 원장·최종 보고 | IN_PROGRESS: 증거 갱신 중, 최종 NO_GO |

**2026-11-07 재검증 결과, 28개 세부 항목의 최종 완료는 S1·D1·B4·D3의 4건이다.** 별도 합성 부분 완료, 과거 Storage 백업, 현재 실제 운영 복구 완료는 구분한다. 최종 전체 보안 18개 운영 수용 완료는 여전히 **1/18**이다.


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
