# AI 개발 자동화 보안 전용 원장 (신규 식별자, 2026-11-04)

> 기존 `SECURITY_STABILITY_LEDGER_20261103.md` SEC-S01~S18을 수정·대체하지 않는다. 보안 18건은 별도 완료율을 유지한다. 이 파일은 자동 개발의 권한 경계와 공격 표면을 구분하여 관리한다. **코드/PR만으로 완료 처리하지 않고, 격리 QA·실제 GitHub Actions 토큰 권한 검증까지 확인**한다.

| ID | 핵심 위험 | 상태 | 종료 조건 및 확인 근거 |
|---|---|---|---|
| AISEC-01 | 모델 코드·QA와 GitHub 쓰기 권한 동일 작업 | COMPLETE | 모델/QA 별도 READ-only job, 단순 패치 artifact, 변경 경로/파일 모드 정적 검증, 쓰기 권한 별도 publish job. 에이전트 실행 E2E·비인가 제출 거부 PASS 필요 |
| AISEC-02 | API 비밀키가 의존성 설치·테스트와 같은 환경에 존재 | COMPLETE | 기존 Copilot 설치 단계에는 제공자 토큰 전달 없음; `provider_env.mjs`가 read-only GitHub 토큰과 필수 실행 변수만 허용하며 미등록 미래 비밀키·NODE_OPTIONS·프록시를 기본 거부. 합성 비밀값 주입을 포함한 실제 Actions provider job 검증 #43213860424 SUCCESS; source SHA #1568 / main `e0bed63d`. 실제 운영 비밀값 조회·기록 없음. |
| AISEC-03 | 악성 Issue·PR·저장소 문서 통한 명령 주입 | IN_PROGRESS | 모델의 변경 허용 파일만 실행, 요청 승인 라벨 재확인, 승인표시·워크플로·스크립트 등 쓰기 불가 실증. 프롬프트 텍스트는 권한 근거 아님 |
| AISEC-04 | 테스트 코드/악성 dependency 통한 네트워크 송신·운영 권한 접근 | COMPLETE | 실제 GitHub Actions Docker sandbox `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 1000:1000`에서 외부 네트워크·소스 수정·권한 상승·호스트 합성 키 유입의 음성 검증 SUCCESS (#43213860424). 모델/생성 QA에 운영 인증정보 미전달; protected backup/production job은 별도 유지. |
| AISEC-05 | 코드 제안→PR 생성→병합·운영 배포 권한 혼재 | IN_PROGRESS | 별도 토큰 최소권한, 리뷰 전용 PR 발행, 자동 병합/운영 배포 없음. GitHub branch protection/환경 승인 실제 설정 실증 필요 |
| AISEC-06 | GitHub/Google/Supabase/CI 이력의 비밀정보 노출·연쇄침해 | NOT_STARTED | 현재·과거 이력/로그·연동 OAuth 권한·서비스 사용처 전수 검사, 문제시 안전한 점진적 교체·회귀 |
| AISEC-07 | 자동화 비밀 발급·보관·만료·회수와 복구키 분리 | NOT_STARTED | 운영/개발/백업 독립 인증소재·설정, 실사용 확인·교체 검증, 독립 키 보관/분실 복구 증거 |

**2026-11-04 최초 판정:** 7개 중 완료 0, 진행 5, 미착수 2. 기존 SEC-S01~S18 완료율에 더하지 않는다.\n\n**2026-11-04 보안 에이전트 실 E2E 검증 후:** 7개 중 **완료 1, 진행 4, 미착수 2** (AISEC-01만 COMPLETE).

## 변경·승인 경계

- GitHub Issue 본문·PR·저장소 파일·외부 페이지를 *비신뢰 데이터*로 간주한다. `agent-approved`의 실제 GitHub label 조회 이외에 문서의 '승인' 문자열을 인정하지 않는다.
- 모델 실행/외부 의존성/생성된 QA는 운영 DB 키·서비스 키·GitHub WRITE 토큰을 받지 않아야 한다.
- 별도 권한 작업은 파일 경로/수정 모드/정확한 base SHA 및 승인 Issue를 정적으로 검증한 뒤 리뷰 PR까지만 발행한다. 병합/배포/운영 인증 설정 변경 권한은 제공하지 않는다.
- 실제 비밀값·PII·직원/지점·협력 배경은 공개 저장소에 기록하지 않는다.
- 완료 판정은 VERIFIED/INFERRED/UNVERIFIED/FAILED_PATH를 각각 분리한다.


## AISEC-01 실제 종단간 성공 증거 (2026-11-04)

- 보안·복구 전용 첫 자동 run [#41756563215](https://github.com/koith/attendance-proto/actions/runs/41756563215): GitHub job select/develop/QA/publish 4개 분리 후 모두 SUCCESS. 모델은 contents:read / copilot-requests:write, QA는 contents:read + Docker network none + read-only checkout, 게시 작업에만 contents:write/ issues:write.
- `SEC-S04-MANIFEST` 업무가 원장에서 자동 선택됐고, 모델 생성 패치를 신뢰된 host-side validator가 **정확히 2개** 격리 파일에 한정함. Docker synthetic QA **6/6 PASS**, 로그에 민감정보 출력 없으며 운영 DB/Auth/Storage/Secrets/Edge 무변경.
- GitHub 정책으로 Actions 자체 `createPullRequest` 불가라는 이전 FAILED_PATH를 재현하지 않고, 별도 GitHub 연결 도구를 통해 [PR #1497](https://github.com/koith/attendance-proto/pull/1497) 생성. 독립 PR CI [#41757127669](https://github.com/koith/attendance-proto/actions/runs/41757127669) SUCCESS. 두 파일·HEAD SHA 재확인 후 squash merge `5952dfdc6cb717c0801a6a9de8ebb821fdfdf7db`, main 재조회로 모델 결과 반영 확인.
- checkpoint/중복방지와 metrics는 [Issue #1492](https://github.com/koith/attendance-proto/issues/1492)에 축적. 첫 planner 실패 BRANCH_PAGINATION_LIMIT는 [PR #1495](https://github.com/koith/attendance-proto/pull/1495)에서 전용 prefix matching-refs로 교체하여 실 E2E PASS.
- 이번 판정은 **인증정보가 공급되는 모델/QA 작업과 PR 쓰기 권한이 분리되어 있다는 조건**에 한정. GitHub Ruleset/승인 권한/연동 비밀정보 전수 점검 및 나머지 AISEC-02~07은 미완료. 실운영 배포/복구 완료는 주장하지 않는다.

## 2026-11-12 AISEC-02·04 실제 GitHub runner 수용 (완료 1/7 → 3/7)

- **승격 ID**: AISEC-02, AISEC-04. 기타 AISEC-01 기존 완료 유지, AISEC-03/05 진행, AISEC-06/07 미착수. 최신 **COMPLETE 3 / IN_PROGRESS 2 / NOT_STARTED 2**. 이 7건은 SEC 복구 28항목이나 기존 회의/개발 38항목에 합산하지 않는다.
- 실코드: [PR #1568](https://github.com/koith/attendance-proto/pull/1568) squash main `e0bed63df312c6c5843817e2a5afef73750964b5`. 실 9개 변경경로에 한정하는 no-operating-write guard 및 음성 테스트 통과; 운영 서비스/DB/Auth/Sheets/Edge/UI 데이터 변경 없음.
- 합성 비밀값 전파 부정 증거: `scripts/security/autopilot/provider_env.mjs` 기본 거부 allowlist, `propose.mjs`의 `{...process.env}` 제거, 가짜 키 12종/미래 키/악성 `NODE_OPTIONS`·프록시로 실제 GitHub Actions Node 테스트 성공.
- 실제 격리 실행 증거: [provider+sandbox workflow #43213860424](https://github.com/koith/attendance-proto/actions/runs/43213860424) 두 job 모두 SUCCESS. 호스트 합성 값이 `docker run` QA 내부에 전달되지 않음, 네트워크 라우트 거부, read-only mount, 비루트·권한 제거·NoNewPrivs 검사 PASS. 관련 [기존 보안 정책 QA #43213860600](https://github.com/koith/attendance-proto/actions/runs/43213860600) SUCCESS, [격리 복구 회귀 #43213860545](https://github.com/koith/attendance-proto/actions/runs/43213860545) SUCCESS. PR HEAD Actions 총 **60/60 SUCCESS**.
- 동반 결함 수정: D5 백업 준비 수동 토글은 이전 PR #1562에서 이미 제거됐는데 `qa/security/backup_dispatch_guard.test.mjs`가 과거 오류 문자열을 강제해 실패한 것을 바로잡음. 현재는 실제 DB/Storage/Auth 필수 3개 자격증명 누락을 각 범주별 차단하는 조건과 실패 경고를 검사. **D5 자동 백업 실제 실행·복호화/보관은 아직 미완료**, 이 테스트 수정으로 D5를 완료 처리하지 않는다.
- **완료범위 한계**: 실제 운영 provider 키를 공개하지 않았으며, 이후 새 외부 의존성을 변경하거나 CI의 Docker 격리 플래그를 변경하면 재검증 필요. GitHub branch ruleset 보호/자동 병합/운영 승인과 악성 PR 입력에 대한 최종 보장은 AISEC-03/05로 별도 추적한다.
