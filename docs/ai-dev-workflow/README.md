# Issue 기반 개발 실행 계약 (#1331)

정본: https://github.com/koith/attendance-proto/issues/1331

## 상태

| 상태 | 의미/승격 조건 |
|---|---|
| READY | Issue에 범위와 완료 조건이 등록됨 |
| IN_PROGRESS | 작업 중, 최신 SHA·다음 행동 체크포인트 필요 |
| CODE_VERIFIED | 요구한 단위/통합 QA가 해당 SHA에서 통과 |
| MERGED | PR이 실제 main에 병합됨; head SHA와 merge SHA 구분 |
| DEPLOYED | release scope의 실제 배포 작업 성공; skipped는 배포 아님 |
| ACCEPTED | 독립 acceptance gate가 모든 요구사항/배포 후 검증을 확인 |
| BLOCKED | 특정 작업의 외부 권한·인증·동의·서비스 제약; 마지막 진행 상태 보존 |

순서를 건너뛰지 않는다. 증거가 바뀌면 IN_PROGRESS로 되돌려 재검증한다.
BLOCKED 해제는 마지막 진행 상태로만 가능하다. ACCEPTED는 새 범위를 자동 포함하지 않는다.
작업 중단은 IN_PROGRESS 체크포인트의 `failure`에 기록하며 BLOCKED로 위장하지 않는다.
업무별 체크포인트를 분리하여 한 업무의 장애가 다른 업무의 진행을 막지 않는다.

## 감사 및 재사용 (기준 main 2ec2b5ed7e293c7262c5302e5b22eb6e0fc971d3)

- 128개 workflow. `capture-development-instructions.yml`/`issue_intake_receipt.mjs`: Issue 원문 스냅샷·중복 방지 있음, 현재 작업의 SHA/다음 행동 재개 기능은 없음.
- `work-orchestrator.mjs`: 예제 급여/관리 작업의 로컬 `.automation/work-state.json`, 문자열 길이만으로 증거 인정. 예제는 운영 정본이 아니며 신형 Issue 체크포인트와 혼합하지 않는다. `work-orchestrator.yml`을 신형 QA/재개 진입점으로 확장한다.
- `autonomous_dev_agent.sh`: 승인 Issue를 읽고 최대5회 수리 및 PR까지 수행. 루트 AGENTS 계약을 프롬프트에 연결하되 기존 허용 편집 범위·미병합 제약은 유지한다.
- `p0-pages-deploy.yml`: P0 QA→Pages 빌드→게시→동일 실행 검증. 정상 배포 끝에 실제 Sheets 갱신이 있으므로 개발체계 전용 변경은 기존 무쓰기 마커와 추가 AI 전용 경로 검사로 제외한다.
- `verified-pages-deployment-notification.yml`/`release_recovery_policy.cjs`/`safe-pages-rollback.yml`: 독립 검증·최신 main SHA 검사·최대5회 재시도·정적 자산만 복구. 이 체계를 재사용하고 새 자동 운영 복구를 만들지 않는다.
- `qa1243-friday-readiness.yml`: 여러 기존 QA/게시 증거 종합. #1243의 7/8 NO_GO와 운영 Auth 설정 2/8, 실제4키 미적용을 PR 성공과 구분한다. 오래된 근거는 현재 운영 사실을 새로 증명하지 않는다.
- `PROJECT_BACKLOG_20261017.md` 전체38/완료19/잔여19와 현장 검증 대기, `QA1243_FRIDAY_OPENING_20261023.md` §16–17 보존. #1330은 적용 실행 경로 구현이며 운영 적용 성공 자체의 증거가 아니다.

## 무쓰기 릴리스 범위

이 개발체계 PR의 squash 제목에는 `[AI1331] [QA1243-NO-OPERATING-WRITE]`를 유지한다.
기존 P0 workflow가 실제 비교 diff를 검사한다. AI 개발 코드/테스트/문서 및 지정된 자동화 파일만 허용하며 앱·DB·Edge·Sheets·알 수 없는 경로는 거부한다. Pages publish, 운영 Sheets 갱신 및 배포 통지는 기존 조건으로 SKIP된다. 개발체계의 배포 대상은 GitHub main/Actions이며 앱 버전은 변경하지 않는다.

## 단계별 산출물

1. 실행 계약·상태 검증·무쓰기 경로 QA.
2. Issue 체크포인트/재개 CLI, append-only 이력·SHA/중복/충돌 방어.
3. acceptance manifest와 독립 증거 검증, 기존 Actions에서 report-only 관측.
4. 실패/중단/새 프로세스 재개 및 #1243 판정 리허설.

각 단계 PR/CI/main 결과와 다음 행동은 Issue #1331에 기록한다. 계획만으로 완료하지 않는다.

## 재개 / 체크포인트 명령

Node 22 이상, 기존 GitHub read 연결을 사용한다. 공개 저장소는 token 없이 읽을 수 있다.

```sh
node scripts/ai-dev/cli.mjs resume koith/attendance-proto 1331
# 완전한 Issue/댓글 export를 받은 새 프로세스의 오프라인 재개:
node scripts/ai-dev/cli.mjs resume koith/attendance-proto 1331 snapshot.json
```

snapshot은 `{ "issue": { "number":1331, "title":"...", "body":"전문" }, "comments":[...] }`의 GitHub REST 형식이다. 로컬 출력은 공개 Issue에 저장된 내용의 재구성이며 새 운영 검증이 아니다. pagination은 최대100페이지, GET은 15초 timeout/최대3회/최대3초 backoff. 401/403 권한 오류는 즉시 BLOCKED, 429/명확한 rate limit 및 502/503/504 GET만 제한 재시도. POST 결과 불명은 재발송하지 않고 동일 event_id로 readback한다.

기존 Work orchestration guard의 workflow_dispatch에 issue_number와 checkpoint JSON을 입력하면 main에서 직렬 기록한다. 스케줄 실행은 Issue 재개 artifact만 남긴다. PR 코드에는 이 쓰기 단계가 실행되지 않는다. 체크포인트 예:

```json
{"task":"implementation","event_id":"run-unique-1","expected_revision":0,"expected_sha":null,"sha":"정확한40자리branchSHA","branch":"codex/1331-example","state":"IN_PROGRESS","scope":"작업 범위","acceptance":"요구사항별 완료 조건","next_action":"다음 실행 명령/PR","failure":"","proofs":[]}
```

기록은 Issue 댓글의 `[ai-dev-checkpoint:v1]` + JSON/SHA256으로 영구 보존한다. 동일 event_id/동일 입력은 no-op, 다른 입력은 충돌. expected_revision/expected_sha와 원격 branch head를 모두 확인한다. 새 SHA에서는 IN_PROGRESS로 재검증한다. 부모 digest가 갈라지거나 누락되면 CANNOT_VERIFY; 임의로 최신 댓글만 골라 이전 이력을 덮어쓰지 않는다. 동시 수동 작성은 충돌로 드러나며 지원 쓰기 경로는 이슈별 직렬 workflow이다.

GitHub 소유자와 github-actions[bot]의 정확한 최상위 marker 댓글만 신뢰한다(원문 인용/접수 스냅샷은 제외). 체크포인트 상태는 진행 주장이다. CODE_VERIFIED 이상은 별도 독립 gate 결과에서 파생하며 사용자가 JSON에 verified=true를 넣어 승격할 수 없다. BLOCKED는 failure/required_action/resume_state를 보존한다. 자동 agent도 코딩 전 같은 resume 결과를 읽는다.

## 독립 acceptance gate (보고 전용)

`acceptance.schema.json`과 `scripts/ai-dev/acceptance.mjs`는 issue/PR/head SHA/release SHA/release scope 및 요구사항별 unit/integration/merge/deployment/post_deploy/manual 검사를 정의한다. 각 배포 범위에 실제 deployment 검사가 필수다. `manifest.mjs`는 #1331의 배포 대상을 **GitHub main의 자동화**로 한정한다. 앱 Pages/Edge/Auth 배포 완료를 뜻하지 않는다.

검증기는 GitHub PR의 실제 병합/head→merge SHA, 현재 run attempt, 정확한 workflow/job/step 성공, GitHub가 보관한 아티팩트의 소속 run/SHA/만료/hash, 개별 결과의 SHA·환경·대상 URL·시각·상태를 다시 읽는다. 제출된 proof JSON은 run/artifact ID만 지정하며 결과 내용은 신뢰하지 않는다. 잘못된 증거=FAIL, 증거 부재/권한/만료/미실행=CANNOT_VERIFY. manual은 사람의 실제 수용이 필요함을 남기고 자동 PASS하지 않는다. 배포 후 검사는 같은 release SHA의 배포 이후여야 한다.

`verify.mjs`가 실제 테스트/새 프로세스 재개/원격 main AGENTS 바이트 대조/원격 Issue 재개를 수행한 뒤에만 `evidence.json`을 만든다. PR은 정확한 head checkout으로 QA하며 main의 별도 readback job은 release SHA를 검증한다. SHA별 자동화 설치를 실제 서비스 배포와 혼합하지 않는다.

```sh
# 합성 테스트 및 새 프로세스 CLI 통합 검사 (원격 쓰기 없음)
node scripts/ai-dev/verify.mjs unit
node scripts/ai-dev/verify.mjs integration
# 기존 GitHub read 연결로 독립 확인. 출력은 report-only, 릴리스 차단/재배포 없음.
node scripts/ai-dev/report.mjs koith/attendance-proto <main-merge-sha>
```

기존 Work orchestration guard가 P0 Pages/독립 Pages/Edge workflow 완료, schedule, 수동 실행에서 report-only 보고서를 저장한다. QA 아티팩트 생성 중인 동일 run을 성공으로 미리 판단하지 않는다. Actions artifact 30일 보관 후 만료되면 새 검증이 필요하며 Issue의 영구 체크포인트 링크도 만료 증거를 PASS로 바꾸지 않는다. GitHub/API만 읽고 운영 API/DB/Sheets는 호출하지 않는다. 단위 테스트의 `synthetic` provenance는 운영 성공 증거로 사용하지 않는다.

영향 분석: 기존 release/required-check/보호 규칙 변경0, 새 workflow0, report job은 read 권한과 5분 상한만 갖는다. 기존 배포 결과를 변경하거나 복구 실행을 dispatch하지 않는다. 운영 기능에 확대 적용/차단 모드 활성화는 별도 영향 검토 대상이다.

## 오류·중단 복구 훈련 및 계속 운영

`recovery.test.mjs`는 401 인증/403 권한/SSO 동의를 각각 BLOCKED로 구분하며 즉시 필요한 최소 조치를 반환한다. 429 Retry-After가 예산보다 길면 조기 재시도하지 않고 RATE_LIMIT_DEFERRED로 남긴다. 일시 GET 오류만 최대3회, POST 결과 불명은 같은 event_id readback 전 재발송하지 않는다. 기존 `release_recovery_policy.cjs`의 stale SHA·결정적 실패·5회 상한도 재사용해 검증한다. 운영 복구를 새로 dispatch하지 않는다.

`rehearsal.mjs`는 Issue snapshot을 남긴 프로세스를 실제 SIGTERM으로 종료하고, 이전 대화/메모리 없이 새 Node 프로세스가 Issue만 읽게 한다. 정의·범위·완료 조건·SHA·실패·다음 행동·근거 보존, 중복 이벤트 no-op, 미완료/성공 구분을 검증한다. main readback에서도 실제 원격 #1331을 읽어 같은 훈련을 수행하고 `recovery-rehearsal.json`을 저장한다. 이는 새 세션에 줄 입력을 검증하는 자동 리허설이며 ChatGPT 채팅 대기열 복구나 새 Codex 세션 자동 실행을 뜻하지 않는다.

```sh
node scripts/ai-dev/rehearsal.mjs koith/attendance-proto 1331
```

기존 workflow는 성공한 main 단위/통합 QA 다음에 Issue #1331 체크포인트를 자동 추가한다. writer는 main push 또는 명시 workflow_dispatch만 허용하고, 수동/자동 writer 모두 같은 issue별 concurrency를 사용한다. 운영 쓰기 없이 다음 세션에 main SHA·Actions 링크·다음 검증 행동을 남긴다. checkpoint는 진행 주장, 독립 gate artifact는 수용 판정이다. `resume`은 마지막10개 소유자/Actions 메모(최종 보고 포함)도 돌려주므로 새 세션은 해당 SHA의 acceptance 보고서로 완료 여부를 재검증할 수 있다.

`issue-1243-observation.json`은 GitHub에서 읽은 기존 PR1328 병합, P0 run39962969106 성공, opening run39963164952 실패 및 #1243의 운영4필드 미적용 문구를 시각/링크와 함께 보존한다. `issue1243.test.mjs`는 이를 코드 QA PASS/운영 Auth FAIL·미적용/수용 CANNOT_VERIFY로 분리한다. 현재 운영 설정을 새로 조회한 증거가 아니며 #1243을 닫거나 수정하지 않는다.

장애 시 같은 요청을 무한 재실행하지 않는다. Issue의 체크포인트/PR/CI 링크를 읽고, 권한/동의 작업만 BLOCKED로 남긴 후 독립 로컬 QA·수정 가능한 업무를 계속한다. fork/digest 충돌이면 기록을 임의 선택/삭제하지 않고 해당 두 기록을 검토한다. 각 단계 정상 병합 및 최종 보고 링크는 #1331에 영구 기록한다.
