# 단독 소유자 GitHub 보호 정책 및 백업 권한 분리 (AISEC-05 / AISEC-07)

> 설계·검증 문서다. **이 문서와 PR은 어떤 GitHub 설정도, 어떤 비밀값도 바꾸지 않는다.**
> 각 단계는 소유자가 명시적으로 승인한 뒤 소유자 본인의 관리자 토큰이나 Settings 화면으로 적용한다.
> 정본 정책 파일: `security/github_policy/sole_owner_policy.json`

## 1. 현재 실측 상태 (2026-11-22, Actions run 45017927695)

| 항목 | 실측 |
|---|---|
| `main` 보호 | `protected:false`, ruleset 0, branch rule 0 |
| `production` 환경 | 필수 승인자 0, 배포 브랜치 제한 없음 |
| `production-backup` 환경 | 필수 승인자 0, 배포 브랜치 제한 없음 |
| 최근 main 40커밋 | 36건은 GitHub 병합, 4건은 소유자 계정이 main에 직접 커밋(11/15·11/19) |
| main에 직접 push하는 워크플로 | 0건 (봇 push는 `agent/*`, `sec-auto/*` 검토 브랜치만 대상) |

## 2. 왜 "필수 승인자"를 쓰지 않는가

- GitHub는 PR 작성자가 자기 PR을 승인하는 것을 허용하지 않는다. 그래서 단독 소유자 저장소에 `approvals ≥ 1`을 걸면 병합이 영구히 막힌다.
  - 정책: **승인 0명 + PR 필수 + 항상 실행되는 필수 CI 1개**.
- 환경 승인자의 영향 (`github_policy_impact.mjs` what-if, 저장소 실제 워크플로 기준):
  - `production`에 승인자를 두면 **자동 job 6개가 대기**한다: Payroll Edge 배포(main push마다), qa1243 Auth 3개, one-click 복구, 운영 읽기 감사.
  - `production-backup`에 승인자를 두면 **매일 자동 백업이 수동 승인을 기다린다**.
  - 정책: 두 환경 모두 승인자 없이 **`main` 브랜치에서만 배포 가능**하게 한다. 이 제한의 현재 영향은 0건이다(비-main ref에서 도달하는 job 없음).
- 우회(bypass) 행위자: **없음**. 소유자 토큰으로 동작하는 AI 커넥터(Claude, GPT)도 우회할 수 없다. 비상시 소유자는 Settings에서 ruleset을 끄면 된다(감사 로그에 남음).

## 3. 단계별 적용 (각 단계마다 별도 승인)

| 단계 | 내용 | 기존 운영 영향 | 확인 |
|---|---|---|---|
| A | main 강제 push·삭제 차단 | 없음 (현재 강제 push 사용처 0) | probe `main_blocks_*` PASS |
| B | main은 PR로만 변경 (승인 0) | 소유자의 **main 직접 커밋이 막힘** → PR로 전환 필요. GPT·Claude 커넥터도 PR 생성 → 병합 경로만 사용 | probe `main_requires_pull_request` PASS |
| C | `required-gate` + `gate-integrity` 필수 체크 | 두 체크가 이미 초록이어야만 적용 가능 (도구가 강제): `required-gate`는 main push에서, `gate-integrity`는 최근 병합된 PR에서 확인 | `main_requires_required_checks` PASS |
| D | `production`, `production-backup` 배포 브랜치 = main | 영향 0 (정적 분석) | `environment_*_matches_policy` PASS |
| E (선택) | `production-write` 환경 + 소유자 승인 (self-review 허용) | 현재 사용 job 없음. 수동 Auth 설정 쓰기 job을 옮길 때만 사용 | 위와 동일 |

### 적용 도구 (소유자 PC에서만, CI에서는 실행 거부)
```bash
# 1) 오프라인 계획 확인 (설정 변경 0)
node scripts/security/github_policy_apply.mjs plan
# 2) 현재 설정 스냅샷 (GET only) — 원상복구 기준점
GITHUB_ADMIN_TOKEN=<소유자 fine-grained token: Administration RW, Environments RW, 이 저장소만> \
  node scripts/security/github_policy_apply.mjs snapshot --out ~/aisec05-snapshot.json
# 3) 단계 적용 (정확한 저장소명 확인 필수, 24시간 넘은 스냅샷은 거부)
GITHUB_ADMIN_TOKEN=... node scripts/security/github_policy_apply.mjs apply --phase A \
  --snapshot ~/aisec05-snapshot.json --confirm koith/attendance-proto
# 4) 검증: Actions → "SEC AISEC-05 GitHub settings evidence probe" 수동 실행
```
토큰은 저장소·채팅·Issue에 남기지 않는다. 작업 후 즉시 폐기한다.

## 4. 장애 예방과 원상복구

| 증상 | 원인 | 즉시 조치 |
|---|---|---|
| PR이 "Expected — Waiting for status" 상태로 병합 불가 | `required-gate`가 실행되지 않음 (예: GITHUB_TOKEN이 만든 PR은 워크플로를 트리거하지 않음) | PR에서 Close→Reopen, 또는 소유자가 빈 커밋이 아닌 정상 커밋 push. 해결되지 않으면 아래 롤백 |
| 소유자/커넥터의 main 직접 커밋 거부 | B단계 정상 동작 | 브랜치 → PR → 병합으로 전환 |
| Payroll Edge 배포가 "waiting" | 누군가 `production`에 승인자를 추가함 (정책 위반) | Settings → Environments → production에서 승인자 제거. `required-gate`의 정책 영향 검사가 정책 파일 변경을 막는다 |
| 백업 job 실패 `BACKUP_READER_*` | 전용 백업 로그인이 쓰기 권한을 가짐 (fail-closed 정상 동작) | `BACKUP_DB_READONLY_URL` 환경 비밀 삭제 → 다음 실행부터 기존 경로로 자동 복귀 |

**전체 롤백 (스냅샷 상태로 정확히 복원):**
```bash
GITHUB_ADMIN_TOKEN=... node scripts/security/github_policy_apply.mjs rollback \
  --snapshot ~/aisec05-snapshot.json --confirm koith/attendance-proto
```
도구 없이 롤백할 때: Settings → Rules → Rulesets → `main-sole-owner-protection` → Disable/Delete. Settings → Environments → 각 환경 → Deployment branches를 "No restriction"으로 되돌린다.
롤백 동작은 `github_policy_apply.test.mjs`의 가짜 GitHub API로 검증했다: A~E 적용 후 rollback하면 시작 상태와 정확히 같아짐.

## 5. 필수 게이트 자체의 변조 방어

`pull_request` 워크플로는 **PR 안의 워크플로 버전**으로 실행된다. 따라서 `required-gate`만 필수로 걸면 PR이 게이트를 무력화해도 통과할 수 있다.

| 공격 | 방어 | 검증 |
|---|---|---|
| PR이 `pr-required-gate.yml`이나 정책·가드 스크립트를 약화 | `gate-integrity`(`pull_request_target`)가 **base 브랜치 코드**로 판정하고, 보호 경로가 바뀌었으면 소유자 승인 라벨 없이는 BLOCK | `gate_integrity.test.mjs` |
| 다른 워크플로가 같은 이름의 체크 `required-gate`/`gate-integrity`를 만들어 위장 | 변경된 워크플로에 필수 체크 이름이 있으면 **승인으로도 해제 불가 BLOCK**. ruleset은 GitHub Actions 앱(15368)이 만든 체크만 인정 | 같은 테스트 |
| AI 커넥터가 소유자 토큰으로 승인 라벨 부착 | `performed_via_github_app`이 있는 라벨은 무효. 소유자가 GitHub UI에서 직접 붙인 라벨만 인정 | 같은 테스트 |
| 승인 후 내용 교체 | 보호 경로에 새 push가 오면 라벨 자동 제거 → 재승인 필요 | 같은 테스트 |
| 게이트에서 `pull_request` 트리거 제거 | 필수 체크가 보고되지 않음 → ruleset이 병합을 막음(fail-safe). 보호 경로이기도 함 | `github_policy_impact.mjs` |
| `pull_request_target`에서 PR 코드 실행 | head checkout이 있으면 정책 영향 검사가 BLOCK. `gate-integrity`는 API로 데이터만 읽음 | `github_policy_impact.test.mjs` |
| 설정 화면에서 ruleset·환경 보호 해제 | 주간 probe가 `applied_phases`에 기록된 단계의 회귀를 **실패**로 알림(drift) | `github_settings_probe.test.mjs` |

- 보호 경로·라벨 이름: 정책 파일의 `gate_integrity`. 승인 라벨: `gate-change-approved`. 소유자가 PR 화면에서 직접 부착한다.
- 한계: `gate-integrity`는 main에 병합된 뒤부터 동작한다(`pull_request_target`은 base 브랜치의 워크플로를 쓴다). 이 PR에서는 같은 모듈을 advisory 모드로 실행해 탐지 결과를 증거로 남긴다.

## 6. 운영 쓰기와 자동 백업 읽기 권한 분리 (AISEC-07)

### 실측: 일일 자동 백업은 한 번도 성공한 적이 없다
- 예약 실행 11건(11/11~11/21)이 모두 `BACKUP_BLOCKED_MISSING_REQUIRED_CREDENTIAL`로 실패했다(최근 #44953845777). DB·Storage·Auth 자격증명이 비어 있었다.
- 11/07 presence 기록: `SUPABASE_DB_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`SUPABASE_ACCESS_TOKEN` 모두 저장소에 없음.
- 따라서 "기존 운영 자격증명으로 돌아가는 fallback"은 실제로 쓰인 적이 없다. **fallback은 계획이 아니라 지금 제거했다.**

### 확정된 구조 (fallback 없음)
| 백업이 쓰는 값 | 비밀 이름 (`production-backup` **환경 비밀** 전용) | 성질 |
|---|---|---|
| DB | `BACKUP_DB_READONLY_URL` → `backup_reader` | 매 실행 전 읽기 전용을 증명하지 못하면 백업 중단 |
| Storage 다운로드 | `BACKUP_STORAGE_SERVICE_KEY` | Supabase에 읽기 전용 Storage 키가 없음 → 백업 전용으로 별도 폐기 가능하게 관리 |
| Auth 설정 읽기 | `BACKUP_AUTH_CONFIG_TOKEN` | PAT 범위 제한 불가 → 백업 전용으로 별도 폐기 가능하게 관리 |

- 운영 superuser URL을 실수로 `BACKUP_DB_READONLY_URL`에 넣으면 백업이 실행을 거부한다(E2E 검증).
- AISEC-07 래칫: "백업이 운영 관리 토큰을 공유" 위험이 사라져 baseline이 19 → 18로 줄었다.

### SECURITY DEFINER 함수
- 위협 실증: `backup_reader`가 PUBLIC 실행 권한이 있는 plpgsql SECURITY DEFINER 함수를 호출하자 실제로 행이 써졌다.
  - STABLE SQL 래퍼가 volatile 쓰기 함수를 호출해도 써졌다.
  - 막은 것은 read-only *기본값*뿐인데, 이 기본값은 세션에서 끌 수 있다.
- 검증기는 이제 fail-closed다. 실행 가능한 모든 definer 함수가 본문상 읽기 전용임이 증명되어야 한다. 조건:
  - SQL 언어의 단일 SELECT/WITH/VALUES 문
  - 쓰기·DDL·세션 변경 키워드(`nextval`, `set_config` 포함) 없음
  - 부작용 없는 내장 함수 외의 호출 없음
  - 하나라도 아니면 함수 이름과 함께 백업을 중단한다.
- 운영의 `public.list_stores()`(GPT 조사에서 PUBLIC 실행으로 확인): 마이그레이션 원문을 그대로 넣은 E2E에서 **정적 읽기 전용으로 판정**됐다. 실행해도 데이터 변화가 없었다.
- 쓰기 가능한 패턴 7종은 모두 거부됐다(plpgsql, volatile, STABLE 래퍼, 쓰기 CTE, 다중 문장, nextval, set_config). `REVOKE EXECUTE ... FROM PUBLIC` 후에는 호출 자체가 불가함을 확인했다.
- 운영에서 거부되는 함수가 나오면: 앱 영향 확인 → `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC; GRANT EXECUTE … TO anon, authenticated`(필요한 역할만). 소유자 승인이 필요하다.

### 전환 절차 (소유자, 각 단계 승인 후)
1. Supabase SQL editor(postgres)에서 `security/aisec07_backup_reader_role.sql` 실행.
2. 비밀번호를 비밀번호 관리자에서 생성한 뒤 별도 문장 `ALTER ROLE backup_reader PASSWORD '…'`로 설정한다(저장소·채팅 금지).
3. GitHub → Environments → `production-backup` → **Environment secrets**에 `BACKUP_DB_READONLY_URL`, `BACKUP_STORAGE_SERVICE_KEY`, `BACKUP_AUTH_CONFIG_TOKEN` 등록. 저장소 비밀에는 넣지 않는다.
4. Actions → "SEC backup capture isolated" 수동 실행(capture_scope=AUTH_DB_STORAGE_ENCRYPTED_ONLY). "Prove dedicated backup login is read-only" 단계에서 `BACKUP_READER_VERIFIED` 확인 → 다음 날 예약 실행 성공 확인.
5. 롤백: 환경 비밀 삭제(백업은 원래처럼 자격증명 누락으로 중단) → `security/aisec07_backup_reader_role_rollback.sql`.

### 검증된 것 / 검증되지 않은 것
- 검증(로컬 PG16, CI PG16/17 일회용 DB): 변경하지 않은 `capture.mjs`를 워크플로와 같은 순서(preflight → capture)로 `backup_reader`로 실행했다.
  - 봉인 → 복원 시 RLS FORCE 테이블 전체 행 복원.
  - 쓰기·DDL 14종 거부.
  - 쓰기 권한 로그인과 운영 superuser 로그인은 산출물 없이 중단.
  - definer 판정 위 내용 그대로.
  - 롤백·재적용 반복 정상.
- 미검증(CANNOT_VERIFY): 호스팅 Supabase에서 BYPASSRLS 역할 생성 가능 여부, 운영 DB의 전체 definer 함수 판정 결과. 4단계 수동 실행에서 확인되며, 실패 시 함수 이름과 함께 중단된다.

## 7. 자동 배포·자동 백업 유지 검증
- 자동 배포 워크플로 5개(Payroll Edge, Pages p0/publish, Apps Script, 배포 알림)는 main과 **바이트 단위로 동일**하다(`automation_continuity.test.mjs`).
  - 정책 영향 분석: 차단 0. 배포 job은 계속 main에서 실행된다.
  - 최근 main 실행: Payroll Edge #44465529842 성공(11/19), Pages #44483847511 성공(11/19).
- 자동 백업: 일정(`47 16 * * *`)·`production-backup` 환경·main 한정 조건은 유지된다. 승인자를 두지 않으므로 매일 대기하지 않는다.
  - 단, 위 6절대로 **원래부터 한 번도 성공하지 못한 상태**다. 3단계 비밀 등록 후 첫 예약 실행이 실제 성공 증거가 된다.
