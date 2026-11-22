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
| C | `required-gate` 필수 체크 | `.github/workflows/pr-required-gate.yml`이 main에 병합되고 main에서 1회 이상 성공한 뒤에만 적용 가능 (도구가 강제) | `main_requires_required_gate_check` PASS |
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

## 5. 운영 쓰기와 자동 백업 읽기 권한 분리 (AISEC-07)

| 백업이 쓰는 자격증명 | 현재 | 분리 후 (환경 비밀, `production-backup`에만) | 성질 |
|---|---|---|---|
| DB | `SUPABASE_DB_URL` (운영 쓰기 가능) | `BACKUP_DB_READONLY_URL` → `backup_reader` 로그인 | **읽기 전용 증명**: `pg_read_all_data` + BYPASSRLS, 쓰기·DDL 권한 없음. 매 실행 전 `backup_reader_preflight.sh`가 `aisec07_backup_reader_verify.sql`로 확인하고, 쓰기 가능하면 백업 중단 |
| Auth 설정 읽기 | `SUPABASE_ACCESS_TOKEN` (공용 관리 토큰) | `BACKUP_AUTH_CONFIG_TOKEN` (백업 전용 별도 토큰) | Supabase PAT는 범위 제한이 불가 → 읽기 전용은 아니지만 **별도 폐기 가능** |
| Storage 파일 다운로드 | `SUPABASE_SERVICE_ROLE_KEY` | 변경 없음 (잔여 위험) | 읽기 전용 Storage 키가 없음. 후속 과제: 전용 Auth 사용자 + `storage.objects` SELECT 정책 |

전환 절차 (소유자, 각 단계 승인 후):
1. Supabase SQL editor(postgres)에서 `security/aisec07_backup_reader_role.sql` 실행.
2. 비밀번호를 비밀번호 관리자에서 생성한 뒤 별도 문장 `ALTER ROLE backup_reader PASSWORD '…'`로 설정한다. 저장소나 채팅에 남기지 않는다.
3. GitHub → Environments → `production-backup` → **Environment secret** `BACKUP_DB_READONLY_URL` 등록 (저장소 비밀 아님).
4. Actions → "SEC backup capture isolated" 수동 실행 (capture_scope=AUTH_DB_STORAGE_ENCRYPTED_ONLY) → "Prove dedicated backup login is read-only" 단계 로그에 `BACKUP_DB_CREDENTIAL_SOURCE=dedicated_readonly`와 `BACKUP_READER_VERIFIED` 확인 (`capture.mjs`는 변경하지 않음. 선택은 워크플로의 `secrets.BACKUP_DB_READONLY_URL || secrets.SUPABASE_DB_URL`).
5. 1주일 정상 백업 후, 백업 job에서 기존 `SUPABASE_DB_URL` 참조를 제거하는 별도 PR을 낸다. 그러면 AISEC-07 baseline이 줄어든다.

롤백: 환경 비밀 `BACKUP_DB_READONLY_URL` 삭제 → 다음 실행부터 자동으로 기존 경로를 사용. 그 뒤 `security/aisec07_backup_reader_role_rollback.sql` 실행.

### 검증된 것 / 검증되지 않은 것
- 검증: 로컬 PG16과 CI PG16/17의 일회용 DB에서 실제 `capture.mjs`를 `backup_reader`로 실행해 봉인 → 복원했고, RLS FORCE 테이블 전체 행이 복원됨.
  - 쓰기·DDL 14종이 `default_transaction_read_only=off`로 우회를 시도해도 거부됨.
  - 쓰기 권한을 준 로그인은 백업을 중단시킴(출력 없음).
  - 기존 자격증명 경로는 변경 없이 동작.
  - 롤백 후 재적용 반복 정상.
- 미검증 (운영 적용 전 CANNOT_VERIFY):
  - Supabase 호스팅 DB에서 `postgres`가 BYPASSRLS 역할을 만들 수 있는지.
  - `pg_read_all_data`로 `auth`·`storage` 스키마 전체를 덤프할 수 있는지.
  - 4단계 수동 실행에서 확인해야 하며, 실패하면 백업 job이 명확한 오류로 중단된다(기존 경로는 영향 없음).
- 잔여 위험: `SECURITY DEFINER` 함수는 소유자 권한으로 실행되므로 백업 로그인도 호출할 수 있다. 앱 RPC의 자체 인증 검사에 의존한다. 개수는 매 실행 verify 출력에 기록된다.
