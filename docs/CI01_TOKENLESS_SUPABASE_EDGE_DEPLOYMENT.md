# CI-01 — GitHub 개인 토큰 없는 Supabase Edge 배포 경로

기준: 2026-10-13 · 운영 Supabase `waluhdgqhwjjwmflhrle` · GitHub `koith/attendance-proto`

## 확인한 사실

- 기존 GitHub Actions `.github/workflows/deploy-server-payroll-edge.yml`은 `SUPABASE_ACCESS_TOKEN`이 없으면 자동 CLI 배포에 실패한다. 비밀을 코드, 채팅 또는 GitHub Issue에 노출해서는 안 된다.
- **대체 배포 경로 실증:** 이미 연결된 Supabase 관리 도구에서 GitHub `main`의 5개 Edge 소스 파일을 사용하여 `server-sync-sheet`를 토큰 입력 없이 **v50 → v51**로 실제 운영 재배포했다. 다시 조회한 결과 ACTIVE, `verify_jwt=false` 유지, 5/5 소스가 `main`과 문자 단위 일치한다. 동작은 기존 커스텀 JWT/PIN 검증 구현에 계속 의존하며 인증을 제거한 것이 아니다.
- **자동 배포 대안:** 공식 Supabase GitHub Integration이 저장소의 변경을 자체 인증으로 수신하고 Edge Functions를 배포한다. GitHub Actions에 Supabase 개인 토큰이 필요하지 않다.
- **DB 안전 경계:** 이 저장소의 오래된 `supabase/migrations/*` 파일명 버전과 실제 운영 Supabase migration history가 서로 일치하지 않는 사례가 다수 존재한다. 따라서 GitHub Integration의 Working directory를 저장소 루트 `.` 로 지정하면 과거 마이그레이션이 신규로 간주되어 운영에 재적용될 위험이 있다.

## 이미 준비한 마이그레이션 분리 디렉터리

Supabase GitHub Integration의 작업 디렉터리로 **`edge-release`** 를 사용한다.

```
edge-release/
  supabase/
    config.toml                  # [functions.server-sync-sheet], verify_jwt=false
    functions/server-sync-sheet/
      index.ts
      engine.mjs
      payroll_policy.mjs
      sheet_minute_reconciliation.mjs
      sheet_working_payable.mjs
```

이 디렉터리에는 **`migrations/`가 없어야 한다.** 루트의 오래된 `supabase/migrations/`를 삭제하거나 수정하지 않는다. 점주·급여·근태 DB는 그대로 보존한다.

- 복제 갱신: `node scripts/sync_supabase_native_edge_release.mjs --sync` (로컬 소스 복사만 수행하며 운영 배포하지 않음)
- 커밋 전 검증: `node scripts/sync_supabase_native_edge_release.mjs --check`
- 새 PR/푸시의 `native-supabase-edge-release-parity` GitHub Actions가 배포용 5개 파일의 exact parity, 설정 내 비밀 없음, 과거 migration 디렉터리 부재, 기존 급여/인증 테스트를 강제한다.

## 관리자의 1회 OAuth 연결 (현재 연결됐다고 주장하지 않음)

1. [Supabase 프로젝트 통합 설정](https://supabase.com/dashboard/project/waluhdgqhwjjwmflhrle/settings/integrations)에서 **GitHub Integration → Authorize GitHub**를 통해 본인 계정으로 승인한다.
2. 저장소를 `koith/attendance-proto`로 선택하고 **Working directory = `edge-release`** 를 정확히 지정한다. `.` 또는 `supabase`를 지정하면 안 된다.
3. Production branch가 `main`인지 확인하고, **Deploy to production**을 사용한다. 자동 Preview Branch 생성은 불필요하며 우선 사용하지 않는다.
4. Supabase 배포 기록에서 실제 마이그레이션 적용 0건, `server-sync-sheet`만 변경됐는지 확인한다. 새 Edge 버전과 코드 비교, 미인증 급여 요청 HTTP 401/403, 인하 POS·Google Sheets 동기화 P0 검사로 검증한다.
5. 기존 PAT 기반 GitHub Actions는 아직 fail-closed이며, native integration의 실제 성공 상태/receipt 형태가 관찰된 다음 신뢰 가능한 동일 커밋 배포 확인으로 전환해야 한다. 단지 Supabase 연동을 승인한 것만으로 CI-01 전체 완료를 선언하지 않는다.

공식 참고: https://supabase.com/docs/guides/deployment/branching/github-integration 와 https://supabase.com/docs/guides/functions/function-configuration

**현재 상태:** 토큰 없는 Supabase 관리 도구 배포 **실증 완료**. 자동 배포에 필요한 GitHub OAuth 승인과 실제 최초 연동 배포 검증은 **아직 미완료**. 설정 없이 자동 배포 성공으로 보고하지 말 것.
