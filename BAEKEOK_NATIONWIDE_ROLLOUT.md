# 백억커피 전국 지점 운영 개통 체크리스트

## 범위
이 저장소는 **백억커피 전용**입니다. 범용 프랜차이즈 플랫폼 작업은 별개이며 여기서는 진행하지 않습니다.

## 데이터 보존 및 운영 원칙
- 인하대학교점 `store_id=1`의 POS, 근태, 급여, 기존 외부 시트 동기화는 그대로 유지합니다.
- 지점별 URL은 공통 코드 `/index.html?mode=store&store=<store_id>#pos`를 재사용합니다. 지점마다 코드를 복제하거나 GitHub Pages를 별도 배포하지 않습니다.
- 지점별 급여 기간은 `(store_id,ym)`로 격리되며, 인하대학교점 외 자동 Google Sheets 동기화는 개방하지 않습니다.
- 기존 지점 DB의 다수 레코드는 시연/초기 수집 정보이며, 점주용 실운영 데이터로 확인된 것이 아닙니다. `STAGED` 상태에서는 급여 서버가 데이터를 열지 않습니다.
- 시연용 직원이 있는 지점은 `DEMO_EMPLOYEES_REQUIRE_REVIEW` 때문에 `READY`가 될 수 없습니다. **자료를 삭제하지 말고 출처 검증·자료 이전 계획을 별도로 수립해야 합니다.**
- 신규 점주 초대 메일은 본사 관리자가 UI에서 명시적으로 발송할 때만 전송됩니다. 코드 병합이나 배포가 초대 메일을 보내지 않습니다.

## 지점 개통 순서
1. HQ 관리자 로그인 → 계정 관리 → 전국 지점 운영에서 기존 지점을 선택하거나 새 지점을 `STAGED`로 등록합니다.
2. 점주가 이미 확인된 Supabase Auth 계정이 있다면 해당 이메일로 `기존 계정에 점주 권한 부여`를 사용합니다. 기존 계정은 이메일 인증을 마쳐야 하며 본사 관리자를 점주로 강등할 수 없습니다.
3. 신규 점주라면 `신규 점주 이메일 초대`를 사용합니다. 점주는 초대 링크를 통해 `owner_activation.html`에서 비밀번호를 설정합니다.
4. HQ는 지점 직원·근태·재고·거래 데이터의 진위 및 출처를 검토합니다. 데모 직원이 발견되면 `READY`로 전환하지 않습니다.
5. 검증 후 `운영 활성화`로 `READY` 전환합니다. 등록된 점주 계정이 없으면 활성화할 수 없습니다.
6. 지점 전용 페이지에서 실제 점주 계정으로 로그인해 **본인 지점**만 조회·변경할 수 있는지 검증합니다. 다른 지점 URL 진입은 본인 지점으로 이동시키며 서버 RPC도 권한 검사합니다.
7. 서로 다른 2개 지점 이상에서 직원 등록·출퇴근·근태·급여·레시피/재고의 데이터 분리를 다시 검증한 뒤 전국 확대합니다. 운영 직원의 급여 승인이나 마감을 테스트 목적으로 확정 저장하지 않습니다.

## 개통 전에 관리자 확인이 필요한 외부 설정
- **초대 이메일 리디렉션:** Supabase Dashboard → Authentication → URL Configuration → Redirect URLs에
  `https://koith.github.io/attendance-proto/owner_activation.html` 허용. 이 설정을 확인하지 않고 실제 이메일 초대 전달 성공을 주장하면 안 됩니다.
- **Edge GitHub 자동 배포:** Supabase Dashboard → Account → Access Tokens에서 배포 권한이 있는 제한된 토큰을 발급하고, GitHub `koith/attendance-proto` → Settings → Secrets and variables → Actions에 `SUPABASE_ACCESS_TOKEN`으로 **비공개 설정**합니다. 토큰은 코드·이슈·채팅에 복사하지 않습니다. 연결 후 `.github/workflows/deploy-server-payroll-edge.yml`이 main에서 성공하고 Edge가 체크인된 소스와 일치해야 자동 배포 완료입니다.
- **유출 비밀번호 보호:** Supabase Auth Security and Protection 설정에서 leaked password protection을 켭니다. 연결된 도구로 해당 대시보드 설정을 변경할 수 없으면 운영 담당자가 직접 설정해야 합니다.
- **초기 점주:** 실운영 점주 이메일은 아직 제공되지 않았으므로 운영 점주 계정은 임의로 생성·초대하지 않습니다.

## 검증 / 문제 추적
- `node qa_hq_store_onboarding_v1.mjs` — 역할/준비 상태/초대·화면 계약 검증
- `node qa_store_payroll_isolation_v1.mjs` — 지점별 급여 원장과 승인 격리
- `node qa_browser_app_smoke.mjs` — 모바일·데스크톱 전용 지점 및 본사 화면 (Playwright, Mock API)
- `node qa_production_deployment_health_v1.mjs` — 실제 Pages 버전, 배포 파일, 익명 급여 호출 거절 검증
- 승인/점주 계정/직원 데이터 변경의 실제 검증은 트랜잭션 롤백 또는 Mock을 우선 사용하며, 운영 원본을 테스트용으로 수정하지 않습니다.
