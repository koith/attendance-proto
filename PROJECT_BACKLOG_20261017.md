# 백억커피 업무자동화 — 통합 개발·검증 작업 원장 (2026-10-17)

> **정본(Canonical backlog)** · 접수 [#1008](https://github.com/koith/attendance-proto/issues/1008) · 운영 저장소 `koith/attendance-proto`.
> 다음 대화에서는 **최신 main의 이 파일부터 읽고**, SKILL.md 및 관련 Issue/PR/CI·운영 상태를 재조회한 후 개발을 계속한다.
> 사용자가 별도로 붙여 넣은 `백억커피 업무자동화 — 신규 대화 개발 인수인계서`(2026-10-17 21:40 KST), 동년 10월 17일 회의록(32분 29초)을 함께 반영했다. 출처에 없는 정책을 회의 결정처럼 기술하지 않는다.

## 0. 절대 작업 원칙 / 체크하는 방식

- 완료 처리는 오직 **해당 ID의 완료 기준 전부를 충족했을 때** 체크박스 `[x]`로 바꾸고, 같은 행에 **PR·SHA·QA 실행 결과·배포 버전/운영 검증 증거·확인 날짜**를 덧붙인다. 부분 완료는 `[ ]`를 유지하고 세부 증거만 적는다.
- **개발 미완료 / 개발 중 / 코드 QA 완료 / 병합·배포 검증대기 / 운영 검증 완료 / 실인원·실자료 검증대기**를 구분한다. 사용자에게 보고할 때는 이 원장의 **완료 수와 남은 ID 전수**, 이번에 새로 체크된 ID, 코드·QA·PR·배포·실동작 증거를 함께 보고한다.
- 최신 main·미병합 PR·GitHub Actions·실제 공개 앱 버전을 **매 턴 확인**한다. 진행 중인 다른 PR과 겹치면 파일 충돌을 피한다. 완료되기 전 체크박스를 미리 변경하지 않는다.
- 운영 인하대학교점의 근태·급여·원본 레시피·계정·운영 시트는 테스트 목적으로 무단 변경하지 않는다. 테스트는 격리 DB/Auth/메일함/테스트 시트/모의 POS로 반복 가능하게 한다. **합성 테스트 PASS ≠ 실제 외부 시스템 성공**.
- 한 경로 실패로 기능 불가능을 선언하지 않는다. 대체 경로를 검증하고 실패를 기록한다. QA 실패는 수정/재실행, 배포 실패는 원인 보수/재검증 원칙.
- 개인·회사에 실제 이메일 초대, 권한 승격, 급여 확정, 공급사 주문/결제 등의 현실 영향이 있는 작업은 격리 검증과 명시적 승인/정책 경계를 준수한다.
- **현재 '개발되지 않은 항목'과 '개발완료·실자료 검증대기'는 반드시 따로 합산**한다. 과거 실패/취소/성공 자동 알림 Issue는 개발 작업 건수에 포함하지 않는다.
- **사용자 보고 형식(2026-10-18 추가):** 매번 ① 완료 ② 개발 진행 중 ③ 추가 개발 필요 ④ 외부 연동·개통 검증/보강 ⑤ 현장·실기기·실인원·실자료 검증대기를 **중복 없는 ID 기준**으로 분리하여 각 그룹의 건수와 전체 완료/잔여 합계를 제시한다. 부분 개발과 PR·CI·병합·배포·실동작을 서로 다른 상태로 표기한다. [ ] 24건 중 실증 대기를 개발 미완료로 혼동하지 않는다.

## 1. 최신 증거 스냅샷 (2026-10-23 UTC; 상세 최종 증거는 §80 및 #1243)

- 운영 앱 **v0.356**, 실제 앱 배포 main **9792133ca8daa94d0c2ba0845e835153daccb2f5**. 후속 개발체계 main **2217d87ad90ccc753d9e700bcac823e585ca8fc4**는 앱 자산 변경 없음. 정본 **전체38 / 완료19 / 잔여19**.
- 최신 [지점 개통 격리 통합 QA](https://github.com/koith/attendance-proto/actions/runs/39979608974/attempts/2) SUCCESS. 최초 Ubuntu archive 다운로드 지연/exit124 후 실패 작업 대상 재시도 성공; 실제 Hosted 점주 인증 증거는 아님.
- v0.356 [안전 Pages 배포39979608751](https://github.com/koith/attendance-proto/actions/runs/39979608751) 및 [독립 공개 HTTP 확인39979837619](https://github.com/koith/attendance-proto/actions/runs/39979837619) SUCCESS. index/초대 HTML/JS 세 파일 정확한 SHA256 일치; 운영 Sheets writer SKIP.
- 신규 지점 격리형 QA: [#1001](https://github.com/koith/attendance-proto/pull/1001) → [#1003](https://github.com/koith/attendance-proto/pull/1003) → [#1006](https://github.com/koith/attendance-proto/pull/1006) 병합. 인수인계서 작성 시점의 'E2E 전면 미완료/v0.315' 판정은 **현재 검증 범위의 일부에 대해서는 오래된 기록**.
- 현재 미병합 PR [#999](https://github.com/koith/attendance-proto/pull/999): 관리자 1기기 로그인 서버 강제 준비 상태. 인증 및 익명 요청 호환성·롤백 검증 전 운영 적용 금지.
- 운영 Supabase 읽기 전용 2026-10-17 확인: 매장 244 / READY 1 / STAGED 243 / 대표 연결 0 / 보조 연결 0 / 급여 마감 0 / 급여 스냅샷 0 / 비시연 거래 0 / 비시연 재고 이동 0. 실운영 통합 성공을 가상 데이터로 위장하지 않는다.
- 참조: [기존 개발 원장 #699](https://github.com/koith/attendance-proto/issues/699), [지시 추적 #837](https://github.com/koith/attendance-proto/issues/837), [통합 QA #1000](https://github.com/koith/attendance-proto/issues/1000), [외부연동 후속 #1005](https://github.com/koith/attendance-proto/issues/1005).

## 2. 이전 대화 신규 지점 자동 통합 QA — 확인된 개발과 미검증 분리

- [x] **QA-01 (P0)** 운영 데이터와 분리된 신규 지점·대표/보조·직원·근태/급여·시트 페이로드·레시피의 다층 자동 QA 구성. **격리형 테스트 범위 완료**. 근거: PR #1001, CI run 39024771557, 운영 v0.316. *실제 외부 서비스의 송수신 성공까지 포함하지 않음.*
- [x] **QA-02 (P0)** 자동 QA 자체를 검증: 급여 테스트 직원을 포함시키는 변이, 취약한 비밀번호/잘못된 지점 활성화를 주입하고 실패 감지. **결함 주입 검증 완료**. 근거: PR #1003, main commit `da1361d21798`.
- [x] **QA-03 (P0)** 실제 앱 소스의 본사→대표→보조→직원·레시피 연속 Chromium 재생과 지점 격리. **모의 네트워크·가상 메일함 범위 완료**. 근거: PR #1006, SHA `b892bf18c649`, CI run 39024771557.
- [ ] **QA-04 (P0)** 격리된 실제 Supabase Auth/SMTP 시험메일 송신 → 별도 테스트 메일함 수신 → 링크 클릭 → 비밀번호 확정 → 실제 Auth 세션 재검증, 만료/재발송/취소. **2026-10-27 승인된 운영 테스트 수신자의 메일 클릭·개인 비밀번호 설정·새 로그인·대표 등록 확인; 별도 격리 만료/재발송/취소 전체 수용은 미완료**. 근거/후속: [#1005](https://github.com/koith/attendance-proto/issues/1005). 실제 점주/운영계정에 시험 메일 금지.
- [ ] **QA-05 (P0)** 독립 테스트용 Google Sheet에 Apps Script 실제 쓰기·재조회·정정 재동기화·중복 방지·월별 형식·장애 재시도·지점 격리·안전 정리. **Apps Script 전체 쓰기↔재조회는 미검증**. 2026-10-18 격리된 실제 Google Sheet를 신규 생성해 월 탭 12개·합성 급여 2건·재동기화 멱등성·긴 정정사유 WRAP/원문 note의 Google Sheets API 쓰기↔재조회 부분 검증 완료. 실제 앱→Edge→Apps Script E2E·지점별 권한은 별도 미완료. 후속 #1005. 운영 `2026 근태` 손상 금지. **2026-10-19 완료된 안전성 개발:** [Issue #1132](https://github.com/koith/attendance-proto/issues/1132) / [PR #1134](https://github.com/koith/attendance-proto/pull/1134), main `0f096fe643aa9972005c96b2c7367f8620730fb7`. 기존 `_ensureMonthTabs`가 1~12월 탭 외 모든 탭을 삭제하던 위험을 수정해 구형 자동생성 `근태/세션/급여-YYYY-MM`만 정리하고 사용자·QA 검토 탭 보존. 합성 12개월 재실행/멱등성 회귀를 포함 **PR CI 53/53 PASS**, [Apps Script 배포 #39152280573](https://github.com/koith/attendance-proto/actions/runs/39152280573) **SUCCESS**, 실제 웹앱 새 버전 **79**(ANYONE_ANONYMOUS, USER_DEPLOYING) 원격 확인 및 2026-10 운영 근태 시트 동기화 readback **SUCCESS**. 단, 격리 테스트시트에 실제 Apps Script Web App을 지정한 full E2E 및 지점별 권한 분리 검증은 여전히 미완료. [ ] 유지.
- [ ] **QA-06 (P1)** 지점 등록의 중복/잘못된 주소·READY 전후 경계, 보조 관리자 권한 변경 직후 구세션, 직원 근태 정상/지각/조퇴/휴게/야간/자정/월말/입퇴사/정정/재입사, 계약 변경, 급여 독립 기대값·마감·취소·중복 방어의 누락 커버리지 **시나리오별 증거 행렬** 보완. 기존 CI 통과와 별개로 요구 목록 전체 완료 판정. **부분 진전:** [Issue #1055](https://github.com/koith/attendance-proto/issues/1055)/[PR #1056](https://github.com/koith/attendance-proto/pull/1056) main `e5378ba5f9c1771949990115afc6317bc3d7ff88` 병합으로 격리형 개통 QA 18→28개 레인 확대(근태 누락·수기 생성·정정·익일 퇴근·주휴·계약 변경·미타각 마감·미래 급여·권한 회수 등). PR CI 51/51 PASS. 요구 전체 예외조합·실외부·운영 연동은 아직 미완료. **2026-10-18 증거 행렬 확대:** [PR #1096](https://github.com/koith/attendance-proto/pull/1096), main `c562a0deb6dea722da55db3e11edae2361b9ebbf`. 실제 실행 19개 QA PASS, 테스트별 증거 JSON/Markdown CI 아티팩트 보존, 미확인 7개 예외(공식 주소 증빙·구세션 실차단·실지각/조퇴/재입사·실급여 정정 사유·현장 월마감)는 명시적 GAP로 보고. 기존 원장 [ ] 유지.
  - **2026-10-19 QA-06 자동화 진전(전체 체크 아님):** [PR #1200](https://github.com/koith/attendance-proto/pull/1200) main squash `0b539ae8356fbe418e4e7d91151a55266c68fdbc`. 합성/실제 서버 계산 소스·관리자 세션 UX/해임 경계·주휴 미검증 0원 차단·급여 확정 스냅샷 원본/불변성 등 실행형 증거 행렬 **19→26개**. 전용 [QA-06 #39225419383](https://github.com/koith/attendance-proto/actions/runs/39225419383) SUCCESS, PR 전체 **53/53 GitHub Actions SUCCESS**; 누락 fixture/실패도 JSON/Markdown 원장에 FAIL과 원인을 남김. **현장·실점주·실급여 검증 GAP 7개는 그대로**이며 운영 Auth·원본 근태/급여/레시피·기존 앱 UI를 변경하지 않음. 앱 버전 **v0.348 유지(검증 코드만 변경)**. [ ] 유지.
- [ ] **QA-07 (P1)** 실제 신규 지점 시나리오에서 재고·발주·입출고·POS·대시보드·권한별 메뉴 노출·해임 후 접근까지 연결되는 확장 통합 QA 및 음성 테스트 자동화. **2026-10-18 부분 개발·격리 QA 완료(전체 체크 아님):** [Issue #1060](https://github.com/koith/attendance-proto/issues/1060)/[PR #1061](https://github.com/koith/attendance-proto/pull/1061), main squash `0598867976f7b5e640d6749db27cca98a7ada090`. 개통 자동 검사 **28→39개**(재고·발주·실사·CSV·매출·대사·시연/실거래 구분), 서로 다른 격리 PostgreSQL DB **6→10개**(수기재고 RLS, 실사 draft/post, 거래 대사, 모의 POS·배달·매입 왕복), 중복 발주/취소 주문 오류 주입 검출. [PR 통합 QA #39111162735](https://github.com/koith/attendance-proto/actions/runs/39111162735)에서 39/39 소스 검사 + 10/10 DB 검증 + 가상 브라우저 실제 앱 스모크 포함 워크플로 성공. **남은 완료조건:** 한 지점 개통부터 POS·매입→재고·주문→대시보드·권한 회수까지 *연속된 사용자 시나리오*의 추가 동작/음성 검증, 실제 제3자 연동과의 차이 기록. 운영 원본 데이터 변경 없음. **2026-10-19 연속 개통 QA 실개발 진전(전체 체크 아님):** [PR #1219](https://github.com/koith/attendance-proto/pull/1219) squash `a2c3b493debee7f81e09914203ae229317c75f37`, [PR #1223](https://github.com/koith/attendance-proto/pull/1223) squash `a9a73ed8f8a60cec0b0591068bbf33fc193d0752`. 동일 가상 지점·인증된 대표/보조 상태로 실제 `store_manager_tab.js`/`recipe_access_v220.js`/`operations_stocktake_v1.js`/`operations_v1.js`를 Chromium에서 연속 실행: HQ→대표 초대·비밀번호·READY→보조 권한 부여→직원/급여·지점 레시피→실사 초안(재고 불변)→별도 확정 POST(원본 signed 이동원장 한 번만)→중복/타점/보조 직접 POST 거절→실제 POS·온리원 가상 CSV 2개 업로드·거래 조회·대시보드(매출 8,900원, 매입 3,200원, 재료비 미산출)→데모/중복·타점 차단→보조 관리자 해임 및 구 토큰의 직원·급여·재고·매출 권한 거부. [격리형 전체 QA #39234980660](https://github.com/koith/attendance-proto/actions/runs/39234980660), [확장 #39235762274](https://github.com/koith/attendance-proto/actions/runs/39235762274) source/browser/격리 Postgres 모두 SUCCESS, PR #1223 51개 CI PASS. **운영 실제 POS·공급사 송수신, 배송·발주/장바구니 통합, 현장 실사용 및 음성 테스트는 미검증이므로 [ ] 유지.** 원본 실직원/재고/근태·급여 변경 없음. 앱 버전 **v0.349 유지(테스트 코드만 변경)**.
- [x] **QA-08 (P1)** 신규 지점 개통 자동 QA의 **시나리오별 PASS/FAIL 표·CI 실행/커밋 상태·브라우저 실패 스크린샷 및 예외 스택** 영구 증거 수집. **지점 개통 CI 범위 완료**. 기존 `qa_store_opening_matrix_v1.mjs`는 세부 시나리오/종료코드를 `qa-results/store-opening-matrix.json`으로 생성, [PR #1031](https://github.com/koith/attendance-proto/pull/1031) main `bc0b046e9f0e93dd1c8153b7caa674abfdb0897b`에서 브라우저 실패 이미지/stack 및 source/browser/Postgres 결과 JSON을 `if:always()` 업로드(수집 실패도 로그 보존). PR CI 53/53 PASS, [main 통합 QA #39047895923](https://github.com/koith/attendance-proto/actions/runs/39047895923) SUCCESS, `store-opening-contract-results`, `store-opening-lane-status` 실제 아티팩트 readback, [P0 Pages #39047895833](https://github.com/koith/attendance-proto/actions/runs/39047895833) SUCCESS. 비현장 Gmail·Google Sheets 실연동 성공은 별도 QA-04/05 항목으로 남김.
- [ ] **SEC-01 (P0)** 한 관리자 계정의 새 장치 로그인 시 기존 장치의 **서버측 관리자 RPC** 접근을 실제 거부, 새 계정/지점/직원/익명 경로 정상, 복구/롤백/실기기 통합 QA 후 배포. [#998](https://github.com/koith/attendance-proto/issues/998), WIP [PR #999](https://github.com/koith/attendance-proto/pull/999). **개발 진전(운영 차단 미활성화):** WIP #999 내부 [PR #1098](https://github.com/koith/attendance-proto/pull/1098)에서 익명 POS/인증 직원 대상 잘못된 DB pre-request 차단 위험을 해소하고 signed `request.jwt.claims`에 기반한 관리자 세션 검사로 수정, 격리 PostgreSQL 7경계 PASS. [PR #1099](https://github.com/koith/attendance-proto/pull/1099)에서 실제 독립 PostgREST HTTP JWT 요청으로 익명 200·비관리자 200·신규 관리자 200·이전/세션누락 관리자 거부·세션 갱신 즉시 기존 거부 검증 **성공**. WIP 브랜치 `feat/admin-single-device-session-992`에 병합. 실제 관리자 Auth 발급/운영 PostgREST 설정/복구·실기기 QA 없이 운영 훅 활성화하지 않음. 원장 [ ] 유지.
- [x] **RECIPE-02 (P0, 이전 현장 요구 충돌 해결·정책 갱신)** 2026-10-11 직원 PIN/실출근 게이트가 2026-09-28 최종 승인 비로그인 보기전용 정책과 충돌했던 문제. 사용자가 2026-10-18 **READY 지점은 관리자·직원 로그인·PIN/출근과 무관하게 누구나 레시피 열람, 편집은 관리자만**이라고 재확정했으므로, 기존 이 항목의 '외부 익명 절대 공개 금지/기기 인증 세션 강제'는 **철회된 초안**으로 분류함. [#1036](https://github.com/koith/attendance-proto/issues/1036) → [#1038](https://github.com/koith/attendance-proto/issues/1038)/[PR #1039](https://github.com/koith/attendance-proto/pull/1039), v0.318. 운영 Supabase `anon` READY #1 레시피 126건·미존재 지점 0건, 내부 제조 원본 helper/관리자 수정은 익명 접근 제한 확인. 원본 레시피 불변. **매장 실물 PC의 화면 시각 확인은 별도 FIELD-01 현장 검증 범위**.
- [ ] **AUTH-01 (P1)** 한국어 브랜드 초대 메일 템플릿이 운영 Auth 설정에 실제 적용됐는지 읽기 확인, 안전한 실제 초대 발송 및 도달성·스팸 원인 검증. 코드 템플릿 병합됨([#919](https://github.com/koith/attendance-proto/pull/919)), **운영 적용·실수신 미확인**([#918](https://github.com/koith/attendance-proto/issues/918)). **2026-10-18 실제 운영 자동 적용 경로 재검증:** [PR #1102](https://github.com/koith/attendance-proto/pull/1102), main `b411933c467d090bf7a49e05dce7292ee430a1e4`. [Actions #39119167787](https://github.com/koith/attendance-proto/actions/runs/39119167787) 테스트 PASS이나 `SUPABASE_ACCESS_TOKEN` 미설정으로 **PENDING_AUTH_WRITE_ACCESS** 발생. 검증 성공은 코드 템플릿에 한하며 Hosted Supabase 메일러 설정 적용은 **UNVERIFIED**, 실제 발송/수신 미완료. Supabase DB/Edge 자격증명은 Management Auth config write 권한을 대신하지 않음. [ ] 유지.
- [ ] **FIELD-01 (실인원 검증대기)** 인증된 실제 대표·보조 점주 계정의 지점별 활성화/권한·근태·레시피 격리. [#916](https://github.com/koith/attendance-proto/issues/916), [#921](https://github.com/koith/attendance-proto/issues/921). 합성 QA로 실인원 인증을 대신하지 않음.
- [ ] **FIELD-02 (실자료 검증대기)** 실제 한 달 급여/주휴·승인·마감·스냅샷을 원천 기록과 검증(PAY-01).
- [ ] **FIELD-03 (실자료 검증대기)** 실제 비시연 매출·재고·공급사 데이터로 거래 연결 및 장부 정확성 검증(FEATURE-01).

## 3. 2026-10-17 회의 요구사항 — 신규 개발/검증 일정

회의 약속의 *목표 일정*: **10월 매출·재고 개발, 11월 말까지 최소 현장 검토·테스트, 12월 말 정확한 재고 기준 확보**. 이 날짜는 사용자 요청/회의 목표이며 달성 기록이 아님.

- [x] **MTG-01 (P0)** 월별 Google Sheet `급여 집계`의 **예상/확정 세전급여 합계** 계산·표시, TEST 제외·마감 원본 보존. **2026-10-17 운영 확인 완료**: [PR #1012](https://github.com/koith/attendance-proto/pull/1012), SHA `51f814ede2a744f4eeb5486c137ac80ac4997222`, PR CI 54/54 PASS, [Apps Script 배포·시트 자동갱신 PASS](https://github.com/koith/attendance-proto/actions/runs/39034718083), 운영 원본 `2026 근태` 10월 `B4=세전 합계 4,978,561원`, N6:N14 급여 9건 독립 재합산 4,978,561원 동일. **초기 '테스트 시트 read-back' 기준은 운영 시트의 실제 writer→read-back으로 기능 검증을 대체해 근거를 공개하며, 격리 테스트 시트 전체 E2E는 QA-05에 별도 미완료로 남김.** 회의 02:29~03:25.
- [x] **MTG-02 (P0, 개발완료·실기기 검증대기)** 예산 세전급여 N열/정정사유의 모바일 우측 경계·읽기 불편 개선. **코드 개발·QA·Apps Script 운영 배포·실제 Sheet 재동기화 데이터 검증 완료, 아이폰 화면 검증대기**: 기존 #1016/#1017의 26열/OVERFLOW가 실제 사용자에게 불충분함을 확인. [#1020](https://github.com/koith/attendance-proto/issues/1020), [PR #1022](https://github.com/koith/attendance-proto/pull/1022) main `c03d0d6424cf036b94a666f518cb89a5d5fe65db`: 12개월 A:AZ 52열, N열 WRAP, 긴 정정사유 행 높이 자동 확장, 원문은 셀 note/운영 DB 보존, 보고용 기술 로그/중복/단독점(.) 제거, A:N 외 빈 공간은 동기화 시 지우지 않음. PR 55/55 CI PASS, [Apps Script deploy #39043266512](https://github.com/koith/attendance-proto/actions/runs/39043266512) PASS. 2026-10-18 00:04 KST 자동동기화 후 10월 N65 정리한 두 줄 텍스트·원문 note/WRAP 및 9월 WRAP, 12/12 탭 52열 readback 확인. **남은 완료 조건:** 실물 iPhone 구글 시트 가로 스크롤·행 높이 시각 확인; 현장 직접 확인 없으므로 **개발완료 [x]와 별개로 현장 iPhone 수용 검증대기**. 회의 03:25~04:57.
- [ ] **MTG-03 (P1)** 직원 기록 vs 점주/관리자 확인 vs 급여 예상값 검산·사유 기록·최종 승인 프로세스. 주휴 적용 주수, 야간, 휴게, 수기 예외 계산의 고정 검산식과 승인 정책을 문서화·QA. 회의 00:07~02:29. **2026-10-18 서버 검산 안전성 부분 개발완료:** [Issue #1092](https://github.com/koith/attendance-proto/issues/1092)/[PR #1101](https://github.com/koith/attendance-proto/pull/1101) main `48eb8524b5dd754ecb7a12976f7d0a3c6e83e992`. 주휴 승인 기준 주차가 서버 계산 결과에서 빠졌는데 기본 `0원`으로 간주되던 문제를 수정. **명시적 서버 계산 0원 및 실제 주별 관리자 검토 사유가 있는 미지급 주는 정상 승인 가능**, 근거·지점·주차가 없는 0원은 `WEEKLY_SOURCE_UNVERIFIED`로 거부. 본사 계산과 운영용 Edge 배포본 소스 바이트 일치 검사 후 CI **55/55 PASS**, 운영 Supabase `server-sync-sheet` 최신 active v62에서 해당 오류 코드·함수 실제 존재 직접 readback 확인. **남은 완료조건:** 직원 근태-점주 확인-월별 최종 승인·독립 금액 산식 E2E, 실제 점주 승인 정책·사유/야간/휴게 예외 검증. [ ] 유지.
- [ ] **MTG-04 (P0, 현장 검증 포함)** 신대방삼거리점과 구로고척점 정보·공식 개통 증빙·기존 계정 안전 확보→근태 시트/대표 관리자 개통 플로우 준비. 실제 점주 인증 전 READY 강행 금지. 회의 24:09~25:16. QA-04·FIELD-01과 연계.
- [ ] **MTG-05 (P1)** POS 시스템의 1/2번 단말 의미·키오스크·배달 경유 구조를 **실제 원천 자료로 검증**. 영수증 번호만으로 결합하지 않고 원천키·시간·금액·채널·메뉴를 사용한 거래 정규화. 회의 24:45~32:29. **2026-10-19 실거래 0건 합계 오류 표시 수정(부분 개발):** [Issue #1184](https://github.com/koith/attendance-proto/issues/1184)/[PR #1185](https://github.com/koith/attendance-proto/pull/1185), main `e29b4d19a21d4562c0fa76e02f569e43da512f23`, v0.345. 실제 거래건수 0이면 근거 없이 공급가액·세액·합계 `0원`을 매출 확정으로 표시하던 문제 수정: 원천 미확인 표시. 거래가 있는 진짜 0원은 그대로 허용; Null/NaN/빈 합계는 재확인 요청. 실제 renderPage 실행 QA 및 PR **78/78 PASS**, [Pages #39203865972](https://github.com/koith/attendance-proto/actions/runs/39203865972) 배포·공개 파일 3개 바이트 일치·v0.345 HTTP 200·급여 보호 HTTP 401 검증. 실제 POS 1/2번 원천 식별·거래 정규화/수집은 아직 [ ] 미완료.
- [ ] **MTG-06 (P1)** POS·배민·쿠팡이츠 등 매출 중복 제거, 취소·환불, 시간 편차, 배달 정산액과 총매출의 분리, 누락/의심 일치 검토 큐 및 대사 근거. 회의 05:11~06:31, 25:38~32:29. **2026-10-19 매출 원천 합계 불확실성 UI 방어:** [PR #1185](https://github.com/koith/attendance-proto/pull/1185)에서 확인된 실제 거래가 없거나 집계값이 비어 있으면 금액을 임의 0으로 표시하지 않음. 환불/배달 채널 정산 원천 및 중복 제거 실제 E2E는 아직 미완료이므로 [ ] 유지.
- [ ] **MTG-07 (P1)** 동일 메뉴의 POS·배달·행사 판매명 매핑; 아메리카노/행사 아메리카노는 규칙대로 연결하고 1L 등 다른 단위는 별도 SKU를 유지. 메뉴 판매량 검산. 회의 28:18~28:57. **2026-10-18 추가 기능 개발·QA·운영 적용:** [Issue #1118](https://github.com/koith/attendance-proto/issues/1118)/[PR #1120](https://github.com/koith/attendance-proto/pull/1120), main `473036428b2eb0d82da0631b38b07e0048c45d8e`, v0.332. 기존 지점 승인 SALE 별칭 점검에 확인된 실거래 판매명을 일괄 자동 불러오는 서버 권한 검증 RPC+UI 추가. 시연 거래/취소/환불/타 지점/비승인 원천 제외, 기존 입력 덮어쓰기 사전 확인·자료 없음 시 보존, 매출 거래건수와 메뉴 실제 판매수량을 구분. **PR 78/78 CI, 격리 Postgres 회귀 검증 PASS**; 운영 Supabase 독립 조회에서 RPC 설치, anon execute=false/authenticated execute=true 확인, [P0 Pages #39138592099](https://github.com/koith/attendance-proto/actions/runs/39138592099) 게시·같은 실행 공개 검증 SUCCESS. 실제 비시연 매출 0건으로 실거래 메뉴 판매량 및 POS·배달명 대사 **현장 실자료 검증대기**, 원장 [ ] 유지.
- [ ] **MTG-08 (P1)** 실제 주 공급사(CJ 계열, 코드상 ONLYONE/온리원푸드넷 등 서비스 확정 필요) 매입·입고 원천 확보 및 안전한 수집·중복 방지, 지점별 데이터 격리. 지원 API/다운로드 경로 우선. 회의 11:30~14:01.
- [x] **MTG-09 (P1, 개발완료·실물 현장 검증대기)** 모바일 현장 재고 실사: 직원 권한·품목/단위·수량 입력·초안/확정·실사 이력, 점주 승인과 운영 사용성을 검증. 기존 `operations_stocktake_v1.js` 확장. **2026-10-18 모바일 품목 검색 개발·QA·병합 완료(전체 완료 아님):** [Issue #1063](https://github.com/koith/attendance-proto/issues/1063), [PR #1065](https://github.com/koith/attendance-proto/pull/1065) main `1a3dc964aba65321b1eba190bace21f9a3f1ff61`. 모바일 품목명 한글 검색·미검색 시 품목 추가 차단·원본 선택 유지, 앱 v0.320 + 독립 JS 캐시키. 마지막 PR SHA `b07cda1723e37b8926508977ea1575c5559529bf`의 CI 77/77 PASS. **운영 배포 검증 완료:** [main P0 Pages #39112095365](https://github.com/koith/attendance-proto/actions/runs/39112095365) 게이트·빌드·게시·동일 실행 공개 UI 검증 성공; [독립 검증 #39112267835](https://github.com/koith/attendance-proto/actions/runs/39112267835) 공개 `index.html`/실사용 `operations_stocktake_v1.js` 파일 내용 SHA 일치, HTTP 200, 앱 v0.320, 모바일/데스크톱 운영 스모크 및 비로그인 POS 개인정보 접근 방어 PASS. **남은 완료조건:** 직원 역할/점주 승인 및 실물 모바일 재고실사 UX 검증; 별도 MTG-16 실제 POS·공급사 자동수집/입력부담 검증. **완료 수 불변**. 재고 원본·실물 실사 기록 무단 변경 없음. 회의 14:01~15:19. **2026-10-19 직원·점주 실사 실제 기능 구현:** [Issue #1152](https://github.com/koith/attendance-proto/issues/1152)/[PR #1155](https://github.com/koith/attendance-proto/pull/1155), main `96c0492d533ec9e616b3df2c1c738810fa1f97b8` (v0.339). 공용 POS에서 근무 중인 직원이 본인 PIN으로 비데모 품목 수량을 0~10억·소수 3자리 입력 후 **재고 무변경 제안만 제출**. 관리자는 제출·직원명·품목·수량 확인 후 수락/반려, 수락은 기존 관리자 DRAFT로만 전환. 별도 최종 확인 POST에서만 append-only 이동원장 기록. 타 지점/PIN 오류/퇴근 직원/중복·음수·데모 품목·다른 날짜·중복승인 서버 거부. 격리 PostgreSQL+브라우저 회귀 포함 PR **79/79 CI PASS**, 운영 DB migration `20261019082000_staff_stocktake_proposals.sql` 성공, 운영 5개 RPC 권한 재조회(익명은 PIN 인증된 제출/품목조회만 허용, 관리자 심사 RPC 익명 차단). **운영 Pages v0.339 게이트 게시·독립 검증 및 실제 직원/점주 현장 실기기 검증은 별도 완료 근거 필요하므로 [ ] 유지**. 실재고·레시피·근태 값 변경 없음. **2026-10-19 재고 안전성 보강:** [PR #1164](https://github.com/koith/attendance-proto/pull/1164) / main `36f7b8327fae1683e1d1d938de329e6babe23621`, 52/52 CI PASS. 직원 실사 제출 당시 비시연 재고 장부 수량을 일자·품목별로 기록, 점주 승인 전에 판매·입고·실사로 수량이 바뀌면 `STOCK_CHANGED_RECOUNT`로 안전하게 거부, 기존 원장/실사 무변경. 운영 Supabase migration `staff_stocktake_proposal_baseline_20261019` 적용 성공, 두 RPC 정의 직접 재조회하여 제출시 expected_quantity·승인시 수량 변동 거부 확인. 점주 현장 PIN·직원 실사 수용 검증과 전체 외부 공급사 자동화는 여전히 남으므로 [ ] 유지. **2026-10-19 코드 구현·배포 최종 검증:** [Issue #1157](https://github.com/koith/attendance-proto/issues/1157)/[PR #1160](https://github.com/koith/attendance-proto/pull/1160), main `3d4d605c7842d14cdb3e7bd2465feda30ea2f0e1`, v0.340. 관리자는 실사 초안/확정 원천에서 지점·일자·품목·장부 예상·실물 수량(0 포함)·signed 차이를 **읽기 전용 증빙 CSV**로 받으며 다른 지점·null·차이 불일치·수식 주입이 차단됨. 기존 직원 PIN 기반 제출→관리자 수락/반려→별도 최종 POST 구조와 재고 변동 감지 #1162 보존. [전체 CI 78/78 PASS](https://github.com/koith/attendance-proto/pull/1160/checks), [운영 Pages #39178561090](https://github.com/koith/attendance-proto/actions/runs/39178561090) 동작/빌드/게시/동일 실행 검증 **SUCCESS**: 공개 index.html·재고 UI JS·실사 JS 파일 main 커밋과 byte-equal, 앱 v0.340 HTTP 200·보호 급여 HTTP 401 확인. **코드·운영 배포만 [x]이며 실제 직원·점주 실기기 PIN 실사/승인 수용 및 비시연 재고 원천 검증은 FIELD-03/현장 QA에서 검증대기**, 현장 수용 완료 주장 금지. 사용자의 규칙에 따라 실인원·실자료 없어서 남은 건을 별도 현장검증대기로 분리.
- [x] **MTG-10 (P1, 개발완료·실자료 검증대기)** 지점 관리자가 설정한 목표·현재 재고, 미입고/부분입고 발주량 및 포장/재고 단위 환산을 반영한 **안전한 권장 발주량** 계산. 기존 UI의 `Math.max(1,target-on)` 중복·강제 발주 제안 결함 제거, 기존 주문 동일 품목/단위 식별 및 부정합 차단, 0 부족 시 0 제안, 공급사 주문/결제 자동 실행 없음. [#1049](https://github.com/koith/attendance-proto/issues/1049) [PR #1051](https://github.com/koith/attendance-proto/pull/1051) main `c9f3d8d5d9e0018262e938fe65be196a0f9f9afb`, 패키징·자산 캐시/앱 v0.319 [PR #1052](https://github.com/koith/attendance-proto/pull/1052) main `ed999003dac67a1225d90a64ea584de54dd16271`; PR QA 각각 51/51, 78/78 PASS, [실제 Pages P0 배포 #39101933897](https://github.com/koith/attendance-proto/actions/runs/39101933897) SUCCESS, [독립 배포 검증 #39102102998](https://github.com/koith/attendance-proto/actions/runs/39102102998) SUCCESS. **추가 안전 결함 수정(2026-10-18):** null/공백/비수치 미확인 재고를 측정 0개로 오인하여 발주를 권고하지 않게 통합 재고 화면·계산기 수정, 측정 0개는 계속 정상 부족량 계산. [#1071](https://github.com/koith/attendance-proto/issues/1071)/[PR #1072](https://github.com/koith/attendance-proto/pull/1072), main `381f52db339e5b0e2ecb20d8d92af0d464cb9577`, PR CI 77/77, v0.322 [P0 운영 배포 #39113607650](https://github.com/koith/attendance-proto/actions/runs/39113607650) 성공(독립 최종 검증은 별도 기록). **운영 실제 입고·발주 원천 데이터는 없는 상태이므로 현장 실자료 교차검증은 FIELD-03으로 유지**. 회의 14:53~16:22.
- [ ] **MTG-11 (P2)** 점주 명시 승인 후 공급사 장바구니에 필요한 품목만 반영·읽기 검증·중복 방지; 최종 수정/주문/결제는 공급사 사이트에서 사용자가 수행. 외부 API·권한·사용 정책 확인. 회의 16:22~17:11. **2026-10-19 개발 진전(외부 주문 연동은 미완료):** [Issue #1175](https://github.com/koith/attendance-proto/issues/1175) / [PR #1177](https://github.com/koith/attendance-proto/pull/1177), `main` squash `c7f40691e7996f95b5f5dbfc2cc235a6dd1f6a80`. 78/78 PR CI 통과 후 병합. 점주/관리자가 자신의 지점 내부 발주 건 중 아직 공급사에 입력하지 않은 항목을 **명시적으로 선택·확인한 후** 남은 수량·원본 단위·품목명을 복사하는 공급사 주문 **입력 보조** 구현. 미입고/부분입고·단위·타지점·데모·중복·이미수령·취소·수량원천 변경·클립보드 실패 검증, 휴대전화 320px 인터랙션 테스트. **실제 공급사 장바구니 쓰기, 발주 완료, 결제 또는 중복 원격 주문 방지의 증거는 아님.** 공식 인증 연결·실거래 주문·공급사 반영 상태 재조회 확인 후 체크 가능하여 [ ] 유지. **운영 배포 검증(추가):** [P0 Pages #39195588933](https://github.com/koith/attendance-proto/actions/runs/39195588933) 전체 SUCCESS. 실제 공개 `index.html`, `operations_reference_ui_v208.js`, `operations_supplier_handoff_v1.js` 3개 파일이 main squash `c7f40691e7996f95b5f5dbfc2cc235a6dd1f6a80`와 바이트 단위 일치. 운영 **v0.343 HTTP 200**, 연결 자산 일치, 보호 급여 HTTP 401 확인. 이는 내부 주문 입력 보조 기능의 배포 증거이며 공급사 원격 주문 검증은 아님.
- [ ] **MTG-12 (P1)** 월별 `매입액`과 `사용 재료비`를 혼동하지 않는 지점별 비용 화면. 기초/기말 재고 불명=0으로 취급 금지; 원가·폐기·반품·시간 경계 QA. **2026-10-18 부분 개발 및 운영 배포 완료:** [#1069](https://github.com/koith/attendance-proto/issues/1069)/[PR #1070](https://github.com/koith/attendance-proto/pull/1070), main `43bd468248ed685d317fb8540fcdf18fc2e71e5b`, v0.321. 확인된 매입거래 총액과 미산출 사용 재료비를 대시보드에서 분리하고 재고평가 미확정 시 0원/추정값을 표시하지 않음. 소스 테스트 및 PR CI **77/77 PASS**; [Pages #39113259619](https://github.com/koith/attendance-proto/actions/runs/39113259619) 및 [독립 배포 #39113441316](https://github.com/koith/attendance-proto/actions/runs/39113441316) 성공. **2026-10-23 자동 산출 개발·배포 진전:** #1316 v0.355에서 단가 있는 이동원장과 확정 실사의 기초/기말 평가·입고·반품·폐기/서비스 원가를 검산하는 서버 RPC 및 대시보드 연결 구현, 최종97 체크/실패0, 함수-only 운영 설치와 Pages·독립 HTTP 검증 SUCCESS(§65). 미확인 단가/실사/수량 불일치/미종료 기간은 미산출. 실제 매장 원천 가격·실사/원가 회계 기준 확인은 FIELD-03과 함께 검증대기하여 전체 체크 [ ] 유지. 회의 17:11~18:16.
- [ ] **MTG-13 (P2)** 실제 판매 수량 × **실제 지점별 레시피**의 재료 소모량 계산, 폐기·서비스 제공·손실 허용 오차 설정, 과부족 감지. 본사/지점 레시피 무단 수정 금지. 회의 18:16~19:07. **2026-10-19 레시피 원가·손실 대비 계산 실개발(부분완료):** [Issue #1170](https://github.com/koith/attendance-proto/issues/1170)/[PR #1171](https://github.com/koith/attendance-proto/pull/1171) main `0a4160b14a7f0bb488c798faefa82b95d9fb0551`, v0.341. 지점에서 EXACT로 확인된 SKU의 원본 레시피와 관리자가 수동 입력한 판매량으로 예상 재료 사용량 산출 후 각 재료별 **수동 관측량·폐기·서비스 제공량·허용오차율**을 모두 명시 입력하면 과부족 비교. 잘못된 소수/음수/빈칸/다른 SKU·주문 수량 변경·누락 단위를 근거 없는 0으로 바꾸지 않고 거부. JS 실제 산식 테스트 및 지점 QA 포함 **78/78 CI PASS**, [Pages 게시 #39183480024](https://github.com/koith/attendance-proto/actions/runs/39183480024)/[독립 검증 #39183733192](https://github.com/koith/attendance-proto/actions/runs/39183733192) SUCCESS. **실제 POS 판매수량·실물 관측·폐기 출처가 미연결**이라 자동 실재료비나 차감/정산 완료로 취급할 수 없어 [ ] 유지. 기존 본사/지점 레시피, 근태·재고·급여 값 변경 없음.
- [x] **MTG-14 (P3, 개발완료·실자료 검증대기)** 입고·사용 기록으로 장기체류 가능성을 알리는 재고 점검 경고; 실물 소비기한이 없는 경우 '유통기한 만료 확정'으로 표시 금지. **2026-10-18 코드/권한/합성 DB QA/운영 완료**: [Issue #1076](https://github.com/koith/attendance-proto/issues/1076), [PR #1079](https://github.com/koith/attendance-proto/pull/1079) `744cca0628b1f2674731c522ed7ed0a3b95d49f1` (지점범위·READY·실측 양수재고·마지막 입고/사용 기록·30/60/90/180일 점검, anon 권한 차단), [PR #1083](https://github.com/koith/attendance-proto/pull/1083) v0.325 (null/공백 누락 기록 안전 방어), [PR #1087](https://github.com/koith/attendance-proto/pull/1087) `f6a4d1c8cc0067e6b5ccaa2a7d25eb8afc2efdc0` (재고 화면 자동 점검 경고 v0.326). 각 PR 전체 격리/브라우저 QA 통과. [P0 Pages #39116206370](https://github.com/koith/attendance-proto/actions/runs/39116206370) 4단계 성공, [독립 검증 #39116552336](https://github.com/koith/attendance-proto/actions/runs/39116552336) v0.326 및 공개 3개 파일 바이트 일치·모바일/데스크톱 PASS. 운영 DB RPC 직접 확인: authenticated EXECUTE=true, anon EXECUTE=false. **실운영 비시연 이동 0건이므로 실제 체류 재고 판정은 FIELD-03 실자료 검증대기** (본 개발완료 체크와 별개). 실제 품목 수량·레시피·계정 무변경. 회의 19:07~22:34.
- [x] **MTG-15 (P2, 내부자료 분리 개발완료·세무 실자료 검증대기)** 내부 손익·물류 관리 자료와 세무 신고 자료의 용도·접근·출력 경계를 유지하여 내부 장부를 세무 신고 자료로 오인하거나 이를 근거로 누락된 법정 신고를 자동 확정하지 않도록 함. **2026-10-18 완료:** [Issue #1080](https://github.com/koith/attendance-proto/issues/1080) / [PR #1082](https://github.com/koith/attendance-proto/pull/1082), main `d768c82e154319fc1637ca79cc7d31e997fc7bbe`, v0.324. 실거래 CSV 11개 기존 원천·금액 열 유지, 12번째 각 행의 `자료용도`에 **내부 운영 참고용 · 세무신고 자료 아님** 표기, 다운로드 이름·매출 화면에 명확한 비법정 자료 경계. 익명·다른 지점 접근은 기존 관리 RPC 유지. 실제 1,007건 커서 페이지 전부의 용도 표기/데모·CSV 수식 주입/부분 파일 차단 QA PASS, PR CI 77/77, [독립 운영 배포 #39115457157](https://github.com/koith/attendance-proto/actions/runs/39115457157) SUCCESS. **법정 세무 신고자료 자체를 자동 작성·검증하거나 세무 신고 완결성을 보증한 것은 아님**. 세무 신고·원천 증빙 검증은 별도 자료와 전문 검토가 필요하며 FIELD-03/후속 업무로 유지. 회의 22:36~24:00.
- [ ] **MTG-16 (P1)** 매장 근로자가 실제로 사용 가능한 재고 화면의 입력 부담 검증: POS/매입 자동수집을 우선하고 입력이 반드시 필요한 실사만 최소화. **부분 UI 진전:** [#1063](https://github.com/koith/attendance-proto/issues/1063)/[PR #1065](https://github.com/koith/attendance-proto/pull/1065), v0.320에서 실사 품목명 검색/빈 결과 차단을 추가하여 기존 긴 선택 목록의 부담을 일부 줄임. 자동수집/직원 역할 및 실제 현장 UX 검증은 **미완료**; 이는 완성된 POS/매입 연동이나 실물 사용성의 근거가 아님. 회의 11:01~14:53. **2026-10-18 UX 추가 실개발:** [Issue #1113](https://github.com/koith/attendance-proto/issues/1113)/[PR #1114](https://github.com/koith/attendance-proto/pull/1114)/[PR #1116](https://github.com/koith/attendance-proto/pull/1116). 운영 v0.330에서 iPhone 매출·매입 제목 한 글자 압축을 전체 너비 제목+하단 버튼 단일 행으로 수정(77/77 CI, Pages·독립 검증). 운영 v0.331에서 재고 화면 발주·입고/재고 점검/전체 품목 빠른 탐색 도입(78/78 CI, 320~1280px 실제 Chromium 렌더 검증 및 Pages·독립 검증). 모든 재고 실사/등록/발주/입고·지점 권한·원본 수량 보존. 실제 매장 직원 실기기 사용성·공급사 자동수집은 **미완료**, 원장 [ ] 유지. **2026-10-19 발주 환산 안전성 보강:** [Issue #1129](https://github.com/koith/attendance-proto/issues/1129)/[PR #1130](https://github.com/koith/attendance-proto/pull/1130), main `b3dd0aa88fc8806484a5d704a2238b61100e30f4`, v0.335. 재고/발주 단위가 서로 다른데 환산 계수가 0·누락되면 예전 `||1` 때문에 1단위라고 간주했던 발주 추천 위험 제거. 근거 없는 발주 자동 추천/저장은 차단, 같은 단위의 실제 정상 재고·미입고 수량 계산 보존. **PR QA 78/78 PASS**, [Pages #39151261338](https://github.com/koith/attendance-proto/actions/runs/39151261338) 게이트/빌드/배포/독립 검증 모두 PASS, 공개 index.html 및 operations_reference_ui_v208.js의 바이트가 병합 커밋과 일치·HTTP 200·실제 앱 v0.335·보호 급여 HTTP 401 확인. **남은:** 직원 실사 초안 권한·점주 승인·POS/매입 자동수집·현장 실기기 UX 검증. 원장 미완료 상태 유지. **2026-10-19 매출·매입 메뉴 도구 단순화 코드·QA 완료:** [Issue #1172](https://github.com/koith/attendance-proto/issues/1172)/[PR #1174](https://github.com/koith/attendance-proto/pull/1174), main `56fd1f942a026b9ef36866ef37092f96025b0ac6`, v0.342. 초기 화면에서 데이터 수집만 바로 노출하고 파일 업로드·내부관리 CSV·판매메뉴 SKU 매핑은 키보드/터치로 펼치는 **추가 도구 3개**에 보존, 제목 한 줄 압축 및 가로 페이지 넘침 방지. 320·375·390·414·768·1280px 실제 Chromium에서 펼침/접기·원 버튼 ID/핸들러·버튼 크기 검증을 지점개통 통합 브라우저 QA에 편입, PR **78/78 CI PASS**. 운영 Pages 최종 배포 검증은 별도 기록, POS·공급사 자동수집 및 실제 매장 근로자 현장 UX는 [ ] 유지. **2026-10-19 추가 모바일 검색 안정성 개발완료:** [Issue #1182](https://github.com/koith/attendance-proto/issues/1182)/[PR #1183](https://github.com/koith/attendance-proto/pull/1183), main `2ec1182cdb1bb14dafa7ccaaa4516bd9cb52986f`, v0.344. 품목 검색·카테고리 변경 시 전면 `renderInventory(true)` 재생성 제거, 목록/건수만 제자리 갱신하여 키보드 포커스·기존 발주/입고·공급사 더보기 DOM·스크롤 유지. 320~1280px 실제 Chromium 검사 및 PR **78/78 PASS**. [Pages #39203322874](https://github.com/koith/attendance-proto/actions/runs/39203322874) 게시·공개 `index.html`/`operations_reference_ui_v208.js` 바이트 일치, v0.344 HTTP 200·보호 급여 HTTP 401 **SUCCESS**. 실거래 자동수집·직원 현장 사용성 완료는 아니므로 [ ] 유지.

## 4. 인수인계된 기존 운영/배포 안정화 감시 (완료 증거 기준 별도)

- [x] **REL-01** v0.315 버전 버튼/LIVE 컨트롤 양방향 클릭·모바일/데스크톱 QA 및 실제 Pages 배포 확인 → 이후 v0.316 운영. PR #991/#993, Pages run 39024771709. *특정 실제 iPhone의 물리 터치 경험은 별도 사용자 환경 검증 대상*.
- [x] **REL-02** 오래된 정적 자산 캐시키를 고정한 배포 게이트 QA 수정. PR #996, main commit `480fec8da0bf`. *향후 새로운 핀 퇴행은 별도로 감시*.
- [x] **REL-03** 2026-10-12 정재우 야간 근태 데이터 복구 원장/운영 이력 확인. GitHub 이슈 #910 완료 댓글(2026-10-16), 정정 overlay #102/#103; 이전 감사 이력 및 원본 타각 보존.
- [x] **REL-04 (P1)** 배포완료보장 워크플로·회귀테스트의 이중 자동 Pages 게시/QA 우회·실패 재시도·독립 검증/롤백 안전성 검사. 기존 [PR #1025](https://github.com/koith/attendance-proto/pull/1025)로 `publish-pages.yml`을 수동 복구 전용으로 제한하고 동일 SHA P0 검증 증거 필수 적용, `p0-pages-deploy.yml`을 유일한 main 자동 게시자로 운영. **2026-10-18 결함 수정**: 기존 회귀테스트의 잘못 이스케이프된 `push:` 탐지식을 [Issue #1047](https://github.com/koith/attendance-proto/issues/1047) / [PR #1048](https://github.com/koith/attendance-proto/pull/1048)에서 실제 YAML 이벤트 파서/인위적 push·schedule 주입검사로 개선. PR **51/51 CI PASS**, main `fe50c3f6d58956a8b170e75ebf02fbc66d11eb9f`, [P0 Pages #39101059786](https://github.com/koith/attendance-proto/actions/runs/39101059786) SUCCESS, [독립 검증 #39101212783](https://github.com/koith/attendance-proto/actions/runs/39101212783) SUCCESS. 운영 UI 버전 v0.318 유지(테스트/워크플로 보강만 포함).

## 5. 다음 대화/매 보고용 규칙

- 문서 경로: **`PROJECT_BACKLOG_20261017.md`**; 동기화 원장 Issue **[#1008](https://github.com/koith/attendance-proto/issues/1008)**.
- 완료 시: 먼저 QA/실제 데이터 read-back, PR·SHA·CI·배포 버전 확인 → 체크 `[x]` + 상세 증거 갱신 → 새로운 GitHub 커밋/병합 → 사용자에게 이번 새 완료 ID, 여전히 열린 전 ID, 검증만 대기인 ID를 별도로 보고.
- 우선 진행 순서: QA-04/QA-05 격리 외부 연동 검증 경로, SEC-01 QA 보강(실서버 단일세션 안전성), MTG-01/02 시트, MTG-04 우선 지점 개통 준비, MTG-05~12 실원천 통합. 병행 개발이 이미 건드리는 PR #999 등과 **동일 파일 편집 충돌 회피**.
- 문서화/분석만으로 앱 기능 작업을 완료 체크하지 않는다. 본 문서는 장기 계획만이 아니라 **매 작업 완료 때 갱신할 상태표**다.

## 6. 2026-10-17 22시대 실제 작업 추가 증거

- 통합 작업 원장 PR [#1009](https://github.com/koith/attendance-proto/pull/1009) main 병합 `df64fde59b49a0f5fa436b1a0e903805cc98b676`; 지시 접수 [#1008](https://github.com/koith/attendance-proto/issues/1008).
- 회의 시트 #1010 → PR [#1012](https://github.com/koith/attendance-proto/pull/1012) main 병합 `51f814ede2a744f4eeb5486c137ac80ac4997222`. **코드 QA 54/54 PASS**, Apps Script 배포 및 실제 운영 10월 자동갱신 [run 39034718083](https://github.com/koith/attendance-proto/actions/runs/39034718083) PASS. 운영 10월 합계 실측, 9명 합산 일치, 근태 사유 표시 CLIP 확인. 독립 테스트 시트 통합 QA-05는 계속 대기.
- Pages: [P0 게이트 39034718125](https://github.com/koith/attendance-proto/actions/runs/39034718125) PASS. 별도 [Publish 39034718053](https://github.com/koith/attendance-proto/actions/runs/39034718053)은 502 이후 job-only 재실행에서 중복 `github-pages` 아티팩트 오류로 **해당 실행은 실패**. 다음 main 문서 체크 커밋 `f8047dc5da64`의 독립 새 실행에서 [P0 39035171755](https://github.com/koith/attendance-proto/actions/runs/39035171755), [Publish 39035171754](https://github.com/koith/attendance-proto/actions/runs/39035171754), [독립 배포 알림 39035403815](https://github.com/koith/attendance-proto/actions/runs/39035403815) **모두 SUCCESS**. 시트 전용 UI 변경으로 앱 노출 버전 v0.316 유지.

## 7. 운영 iPhone 스크린샷에서 발견한 우측 경계 문제 수정 (2026-10-17)
- 인하대점 급여 탭 Google Sheet 링크에서 우측 회색 종료영역 발견. 운영 파일 12월 모두 gridProperties.columnCount=14라 N열 다음에 빈 열 자체가 없음. N열 정정사유 CLIP 처리까지 겹쳐 긴 사유 잘림.
- [Issue #1016](https://github.com/koith/attendance-proto/issues/1016), [PR #1017](https://github.com/koith/attendance-proto/pull/1017), squash SHA 4f9909a82cfcb8b723ef916664d1c01e4a77f976, PR QA 54/54 PASS.
- Google Sheets API로 12개 월 탭 모두 14열(A:N)에서 26열(A:Z)로 확장. O:Z는 검토용 빈 그리드로 남기고 신규 열만 서식 초기화. 기존 근태·급여·레시피 값 수정 없음.
- Apps Script에서 새 월 탭도 부족할 때만 O:Z를 생성하고 재실행 시 중복 확장하지 않도록 보호. 정정사유 서식 CLIP을 OVERFLOW로 변경해 빈 O:Z 영역으로 글자가 이어지도록 표시하며 N열 자체의 폭은 늘리지 않음.
- [운영 Apps Script 배포 및 자동 재동기화](https://github.com/koith/attendance-proto/actions/runs/39039845269) success. 실측 12개 월 탭 columnCount=26, 1·9·10월 note wrap=OVERFLOW_CELL. 운영 10월 샘플에서 O:Z 값 없음, 9개 급여 원천 표시 금액 합계와 세전 합계 동일.
- 실제 iPhone 구글 시트 화면의 가로 스크롤/긴 사유 가독성은 별도 직접 시각 검증 불가. MTG-02는 체크 전 유지.

## 8. 2026-10-17~18 시트 사용자 피드백 #1020 — 자동동기화 후 유지 증거
- 사용자 재지적: 26열 오른쪽 끝이 다시 막히고 긴 정정사유에서 읽을 가치가 없는 내부 ID가 보임. 직접 구글시트 데이터 확인에서 10월 N65 157자, N59/N60 단독 점, N62 중복 문장 실측.
- [Issue #1020](https://github.com/koith/attendance-proto/issues/1020)에 사용자 원문 접수. 일반 GitHub 파일/PR 경로 일시 실패 뒤 공식 Git objects create_blob/create_tree/create_commit/update_ref 경로로 저장, 병합 충돌된 PR #1021 닫고 main 기반 PR #1022로 교체. 이전 정상 기능의 후퇴 없이 CI 오류를 2회 수정.
- [PR #1022](https://github.com/koith/attendance-proto/pull/1022) squash `c03d0d6424cf036b94a666f518cb89a5d5fe65db` 55/55 PR CI 통과. Apps Script canonical deploy [run #39043266512](https://github.com/koith/attendance-proto/actions/runs/39043266512) PASS (검사·배포·운영 시트 갱신).
- 운영 `2026 근태` readback: 12개 월 탭 52개 열(A:AZ); 10월 N65 본문 두 줄 및 수정 전 157자 전문 셀 note 유지; 10월 N62 '출근 미등록', 원문 메모 보존; N59/N60 단독 마침표는 빈 셀과 원문 노트로 대체. 9월/10월 N열 wrapStrategy=WRAP. 실제 데이터의 출퇴근·급여 자체는 변경하지 않음.
- 10월 동기화 2026-10-18 00:04 KST 기록, 예상 세전 합계 5,088,300원은 당시 시트 readback 값(계속 변동 가능). 이전 시점 금액을 고정된 상수로 사용하지 말 것.
- 실 iPhone Google Sheets UI 가로 스크롤·행 높이 최종 렌더링은 원격 API만으로 단정 불가. MTG-02를 운영 QA 대기로 유지하고 새 대화에서 실제 모바일 시각 검증/시트 개선을 이어간다.

## 9. 2026-10-18 현장 오류 — 비로그인 매장 PC 근무현황 (이슈 #1028)

- [x] **BUG-01 (P0, 코드·배포·운영 API 검증완료·현장 검증대기)** 인하대학교점 POS 공용 PC에서 관리자 비로그인 상태로 **근무현황**을 누를 때 `P0001 POS_AUTH_REQUIRED` 오류 없이 직원 본인 선택/PIN 인증 화면이 표시되어야 함. 실제 근태 조회는 본인 PIN 인증 뒤에만 허용해야 하며, READY 지점/활성 직원 외 노출과 임금·PIN 유출이 없어야 함. 현장 스크린샷 2026-10-18, [이슈 #1028](https://github.com/koith/attendance-proto/issues/1028). **기존 원인:** `openMyRecord`가 토큰 필요 `pos_employees_state`를 첫 목록에 사용. **수정:** 공용 POS 출퇴근에서 이미 쓰는 `pos_public_staff_cards`를 근무현황 선택에 사용; `my_events` PIN 검증 유지. [QA](qa_pos_attendance_guest_v1.mjs) 및 P0 Pages 배포 게이트 추가. **완료 조건:** PR 필수 QA 통과→main 병합→앱 버전 증가→보장 배포/운영 버전 read-back→현장 POS 실제 확인(별도 현장 수용 검증대기). **추가 자동 검증(2026-10-18):** [PR #1091](https://github.com/koith/attendance-proto/pull/1091) main `d1b44e123c2bd694202de37a8f0051e67af43bea`에서 운영 HTTP API의 익명 `pos_public_staff_cards(1)` 접근(HTTP 200, READY 직원 10명), 개인정보/급여/PIN 필드 비노출, 인증 없는 `pos_employees_state` 접근 거부를 검증하는 **읽기 전용 배포 P0 게이트** 추가. PR CI 50/50 PASS. **실제 인하대학교점 매장 PC 브라우저의 버튼 클릭·PIN 검증은 아직 현장 증거가 없으므로 **매장 PC 실제 버튼·직원 PIN 경로 현장 검증대기**, 현장 오류 완전 소멸 확정 주장은 금지**.

## 10. 2026-10-18 근무현황 장애 및 QA 증거 완료 업데이트

- 현장 제보: 비로그인 인하대점 매장 PC에서 근무현황 클릭시 P0001 POS_AUTH_REQUIRED. [#1028](https://github.com/koith/attendance-proto/issues/1028), [PR #1029](https://github.com/koith/attendance-proto/pull/1029), 버전 v0.317, main `4318ba2c2c917472cd24cab5323cc0da6266e6c4`; PR 77/77 PASS, P0 배포·실제 모바일/데스크톱 공개 웹앱 검사 [run 39047320348](https://github.com/koith/attendance-proto/actions/runs/39047320348) SUCCESS, [독립 배포 알림 39047596725](https://github.com/koith/attendance-proto/actions/runs/39047596725) SUCCESS. 실제 매장 물리 PC 결과는 추가 검증대기이므로 BUG-01 [ ] 유지.
- QA-08: 기존 충돌된 #1026 보존·통합 후 PR #1031로 main 반영. 지점 개통 샌드박스 CI의 상세 시나리오 결과 JSON, 브라우저 실패 PNG/예외 텍스트, 각 워크플로 레인 상태·SHA/Run ID 아티팩트를 확보. run #39047895923 SUCCESS 및 두 개 업로드 아티팩트 readback 완료. QA-08 [x].

## 11. 공개 레시피 열람 정책 복구 — 2026-10-18

- [x] **RECIPE-01 (P0)** **READY 지점 레시피는 관리자·직원 로그인/PIN/출근 상태와 관계없이 누구나 보기 전용 조회 가능**, 수정·삭제는 관리자 권한만 허용. 2026-09-28 v0.27의 비로그인 정책 복구. 2026-10-11 익명 RPC 차단·출근 중 PIN 게이트로 인한 정책 회귀 제거. [이슈 #1038](https://github.com/koith/attendance-proto/issues/1038), [PR #1039](https://github.com/koith/attendance-proto/pull/1039), 병합 SHA `dd52adf4716a947bb7cb36a207d7bba533d8a1b6`. 앱 **v0.318**; PR QA **78/78 PASS**, [공개 RPC PostgreSQL QA](https://github.com/koith/attendance-proto/actions/runs/39088959224) success, [main P0 Pages/공개 바이트·실제 버전 게이트](https://github.com/koith/attendance-proto/actions/runs/39089142595) success, [독립 배포 확인](https://github.com/koith/attendance-proto/actions/runs/39089317436) success. 운영 Supabase 마이그레이션 `public_ready_store_recipe_read_20261018` 적용. 실제 `SET LOCAL ROLE anon` 읽기전용 SQL 결과: 인하대학교점 READY #1 **126건 조회**, 제조법 포함 126건, 재료 포함 108건. 미개통 STAGED #7 및 존재하지 않는 지점 각각 0건. 비로그인 관리자 편집 RPC EXECUTE=false; 원천 레시피 helper 직접 호출=false; 원본 데이터 무변경. 직원 로그인/출근 감지는 레시피 보기와 무관하지만, **운영 POS 현장 물리 기기 직접 탭 시각 테스트는 별도 현장 범위**로 남긴다.

## 12. 역사 월간 시트 잔여 서식 복구 (2026-10-18)
- [x] **SHEET-01 (운영 오류·2026-10-18)** 9월 하단 빈 79~248행(A:N)의 흰색 배경·테두리 제거 및 8월 81~250행 유사 오류 수정. **실제 운영 완료**: [Issue #1042](https://github.com/koith/attendance-proto/issues/1042) / [PR #1043](https://github.com/koith/attendance-proto/pull/1043), main `9e26ba97e6448012048517ee9ee173acca8b494b`, 54/54 PR QA 통과, [Apps Script 배포·실시트 갱신 #39090383478](https://github.com/koith/attendance-proto/actions/runs/39090383478) 성공, [P0 Pages 배포·동일실행 검증 #39090383521](https://github.com/koith/attendance-proto/actions/runs/39090383521) 성공. 원본 수식·값이 없음을 확인한 빈 영역 4,760셀의 서식만 Google Sheets API로 제거; 운영 9월 79·247행, 8월 81행 형식/값 없음 readback, 9월 30~31행 실제 근태 및 서식 보존. 재발 방지: 다른 월 탭을 현재 월 갱신 때 놓치는 구버전 잔여 스타일을 안전한 1회 정리, isBlank·A:N 범위 제한·ScriptProperties 멱등성 QA. 앱 표기 버전 **v0.318**. 기존 잔여 개발과 구분한 신규 운영 오류 접수·완료 건.

## 13. 잔여 작업 실처리 — 2026-10-18
- **REL-04 완료**: 이중 Pages 자동 게시 회귀테스트 결함 #1047 수정(PR #1048); PR 51/51, P0 #39101059786/독립 #39101212783 성공; YAML 주입 변이로 우회 감지 입증. 본래 복구 정책과 정적 페이지·DB 롤백 격리 제약 유지.
- **QA-05 진행(완료 아님)**: 운영 `2026 근태`가 아닌 독립 파일 `[QA 격리] 백억커피 근태·급여 Sheets 왕복 검증 2026-10-18` (ID `1j3T8PRNpBF5XRTguwBW2KdKYA-hIzISVom5JiN8BTf8`)에 12월 탭, 합성 금액 30,000+80,000원, 합계 110,000원, 정정사유 WRAP/원문 note, 덮어쓰기·재조회 멱등성 확인. *Google Sheets REST 수준에 한정됨; 앱 실제 쓰기 전체 검증 아님.* 원본 실운영 인하대 데이터 무변경.
- **MTG-10 개발 중**: [Issue #1049](https://github.com/koith/attendance-proto/issues/1049), [PR #1051](https://github.com/koith/attendance-proto/pull/1051)에서 미입고 발주/포장단위·중복 방어 계산 및 QA 작성. CI·main 배포완료 검증 전까지 [ ] 유지.

## 14. 2026-10-18 오후 · 개발·배포완료보장/현장 정책 증거
- 배포완료보장 REL-04의 YAML 이벤트 검사가 이중 자동 Pages 게시를 실제 감지하도록 변이 QA 보강: [#1047](https://github.com/koith/attendance-proto/issues/1047)/[PR #1048](https://github.com/koith/attendance-proto/pull/1048), 51/51 CI, P0 #39101059786 및 독립 #39101212783 success.
- MTG-10 안전한 재고 권장 발주 도입: 위 본문 상세 PR #1051 + v0.319 #1052, PR 51/51 +78/78, P0/독립 검증 success. 운영 실입고 자료는 미존재, FIELD-03으로 분리.
- 과거 RECIPE-02의 직원 PIN 의무를 '완료되지 않은 개발'로 계속 집계하지 않고 사용자 확정 공개 보기 전용 정책인 RECIPE-01 이행으로 해결 처리(이슈 #1036 종결). 근태 조회는 **별도** PIN 강제 유지.
- QA-05 격리 12개월 샘플 Google Sheet (실제 Google Sheets API) 쓰기·재조회 및 재쓰기 멱등성을 부분 확인. 원본 운영 시트·급여/레시피 데이터 수정 없음. 하지만 Apps Script 전체 E2E 미검증이므로 QA-05 [ ] 유지.
- QA-06 근태/급여/관리자 경계 회귀 레인 10개를 개통 QA에 추가한 PR #1056 병합. 요구 범위가 더 넓어 [ ] 유지.

## 15. 2026-10-18 QA-07 실제 개발 확대 (Issue #1060)
- 사용자 지시 접수: [원장 #1008 댓글](https://github.com/koith/attendance-proto/issues/1008#issuecomment-6247510659). 레시피 RECIPE-01/02는 이미 완료이므로 재개발 대상에서 제외.
- **개발:** PR #1061에서 지점 개통 QA에 재고·발주·POS/배달·장부 대사·입출고/실사·데모 데이터 배제·지점 경계 11개 회귀 레인 추가. 구형 UI 기준으로 잘못 실패하던 `qa_store_entry_inventory_units_v021.mjs`는 최신 더 강력한 지점 진입 잠금/원문 수량 유지 기준으로 검사 대체(앱 로직 변경 없음).
- **QA:** PR 통합 실행 #39111162735 source/negative/browser/disposable PostgreSQL 성공. 소스 39개 항목과 10개 서로 다른 PostgreSQL DB, 실제 앱 코드 기반 가상 브라우저 테스트. 두 오류 주입(불필요한 추가 발주 1단위, 취소 발주량 합산) 실패 감지 확인. `store-opening-postgres-results.jsonl` 및 기존 시나리오·브라우저 결과 CI 아티팩트 보존.
- **병합:** main `0598867976f7b5e640d6749db27cca98a7ada090`. 테스트/워크플로만 수정되므로 앱 화면 버전 증가는 없음(이전 v0.319). 운영 데이터/관리자/근태·레시피/Google Sheet 무변경.
- **판정:** QA-07 확장 통합 검증 **부분 진전**. 원장 총 완료 13 / 미완료 24 유지; 새로 완료 처리한 ID 없음. 사용자 입장에서는 실제 변경·QA가 생겼으나 최종 연속 E2E 범위를 다 충족한 것은 아님.

## 16. 2026-10-18 MTG-09·MTG-16 현장 재고 실사 사용성 부분 개선
- **실제 UI 코드:** `operations_stocktake_v1.js`에 서버가 이미 권한 검증해 반환한 지점별 카탈로그만 대상으로 한 한글 품목명 검색, 검색결과 없음 시 선택·추가 버튼 비활성화 구현. 사용자의 실제 재고 숫자·실사 데이터 변경 없음; 기존 관리자 전용 초안→확정 조정 및 기록 보존.
- **QA:** `qa_store_stocktake_ui_v1.mjs`에서 함수 실행 기반 한글 검색, 무결과 차단, 빈 검색 카탈로그 복귀, 원본 비변경 검증 추가. [PR #1065](https://github.com/koith/attendance-proto/pull/1065) 최종 SHA `b07cda1723e37b8926508977ea1575c5559529bf` 77/77 CI PASS. 한차례 버전 버튼 접근성 라벨 불일치로 P0 실패하였으나 수정·전체 재실행 통과.
- **병합/운영:** main `1a3dc964aba65321b1eba190bace21f9a3f1ff61`, 앱 v0.320 + 독립 JS 캐시 키. [Pages #39112095365](https://github.com/koith/attendance-proto/actions/runs/39112095365) 4단계 모두 성공; [독립 공개 검증 #39112267835](https://github.com/koith/attendance-proto/actions/runs/39112267835) 수정 공개 2개 파일 byte 동일, HTTP 200/v0.320 및 모바일/데스크톱 실제 공개 사이트 스모크 PASS. 실물 재고 수량과 고객 계정 미변경.
- **원장 판정:** MTG-09·MTG-16은 각각 **부분 개발/일부 검증 완료**, 물리 모바일 실사용/역할별 권한/실제 외부 매입 자동수집 확인 전까지 [ ] 유지. 총 37개 중 완료 13개, 미완료 24개.

## 17. 2026-10-18 MTG-12 부분 실개발 및 재고 미확인 안전성 회귀 수정
- **정본 상태:** 37개 중 완료 13 / 미완료 24 유지. 이번 순차 작업에서 MTG-12의 구매액/소모원가 안전 표시 및 MTG-10의 미확인 재고 발주 회귀 오류를 개발·QA·병합, 앱 v0.321→v0.322. 레시피 정책 변경 없음. 실제 운영 매입·급여·재고 수량 수정 없음.
- **구현:** [PR #1070](https://github.com/koith/attendance-proto/pull/1070) MTG-12 안전 표시(실측 데이터 없는 원가 임의 계산 금지), [PR #1072](https://github.com/koith/attendance-proto/pull/1072) 재고 수량 null/공백/NaN이면 '재고 미확인' + 발주 추천 거부, 확정 측정 0은 정상이므로 허용.
- **실제 검증:** 두 PR 각 77/77 CI 성공. v0.321 [P0/독립 완료](https://github.com/koith/attendance-proto/actions/runs/39113259619); v0.322 [P0 게시 및 동실행 검증 완료](https://github.com/koith/attendance-proto/actions/runs/39113607650). [독립 검증 #39113821695](https://github.com/koith/attendance-proto/actions/runs/39113821695) **SUCCESS**: 병합 SHA `381f52db...`/v0.322 버전, 게시 `index.html`·`operations_reference_ui_v208.js` 정확한 바이트 일치, HTTP 200·보호 급여 API 401, 실제 게시판 모바일·데스크톱 스모크 전부 PASS. 사용자 현장 물리 기기는 별도 실증.
- **채팅 화면 표시 이슈(사용자 스크린샷 3장, 2026-10-18):** 사용자에게 보이던 개발 진행 답변이 사라지는 현상이 반복 제보됨. ChatGPT 화면 내부 표시/유지 메커니즘은 코드 저장소에서 원인 확인할 수 없음. **대화 답변 유무와 무관하게 이 원장과 GitHub PR/SHA/CI를 내구성 있는 작업 기준으로 삼고, 새 대화에서는 먼저 읽어 작업을 이어간다.** 앱 내 보이던 내용 자체나 첨부 스크린샷을 GitHub에 복제한 것은 아님.

## 18. 2026-10-18 대화 표시 소실 제보 후 작업 연속성 복원·배포 검증

- **대화 표시 문제:** 사용자 스크린샷(2026-10-18 18:17 KST)에 “정본 업무원장의 미완료 24건을 다시 확인하고 실제 코딩한다”는 응답이 보였으나 현재 채팅에 남아 있지 않다고 재제보. GitHub [#1008 접수 댓글](https://github.com/koith/attendance-proto/issues/1008#issuecomment-6248196089)로 원문·발견 맥락·복원된 GitHub 상태를 독립 보존. **ChatGPT 메시지 소실의 원인은 미확정이며 이 저장소 변경으로 해결됐다고 주장하지 않음.** 사용자 캡처 원본 이미지는 공개 저장소에 복제하지 않음.
- **동시 개발 우선 병합:** [#1080](https://github.com/koith/attendance-proto/pull/1080) 내부 손익 CSV의 세무·운영 목적 경계 부분개발, main `d768c82e154319fc1637ca79cc7d31e997fc7bbe`, 앱 **v0.324**. MTG-15는 남은 법정 신고·실운영 검증이 있어 [ ] 유지.
- **이번 실제 소스 변경:** [PR #1083](https://github.com/koith/attendance-proto/pull/1083)에서 `operations_inventory_age_v1.js`의 미확인 경과일·수량·품목 식별자(null, 공백)를 숫자 0으로 오인하지 않는 fail-closed 검증·실행 QA 추가. 동시 v0.324 병합을 감지하고 새 `main` 위에서 PR 브랜치를 재구성하여 버전 충돌을 해결, **v0.325**로 출시. 최종 PR head `f8ccf45a285e5bbaf35659de5145d55035a0acd1`, **89/89 체크 완료·실패 0** (Version Guard·브라우저·격리 PostgreSQL QA 포함), squash main `4cf2e2556bea6f100518757e963b8fbae9d0a602`.
- **운영 배포 실증:** [P0 Pages #39115733227](https://github.com/koith/attendance-proto/actions/runs/39115733227)에서 P0 검증, Pages 빌드, GitHub Pages 게시, 동일 실행 후속 검증 **4단계 모두 SUCCESS**. 새 앱 표시 버전 **v0.325**. 외부 별도 iPhone/매장 PC 시각 검증을 성공했다고 표기하지 않음.
- **운영 DB 읽기 전용:** Supabase `attendance` 운영 프로젝트에서 `admin_store_inventory_age_review` RPC 존재, `anon EXECUTE=false`, `authenticated EXECUTE=true` 확인. 당시 비시연 재고 이동 **0건**, 실재고 카탈로그 **172개**, READY 매장 **1개**. 프로덕션 재고·매출·급여·근태·레시피 변경 없음. 실재고 장기체류 판정은 FIELD-03/MTG-14 실증 범위로 유지.
- **완료 판정:** 본 원장 **총 37 / [x] 13 / [ ] 24**, 이번 새 체크 ID **없음**. 안전 코드·QA·배포는 전진했지만 실제 제3자 거래·실물·실인원 검증은 합성 QA로 대체하지 않음. 기존 RECIPE-01/02 완료 건 재개발하지 않음.

## 19. 2026-10-18 MTG-14 현장 재고 장기체류 자동 점검 개발완료 판정
- **정본 재분류:** 개발 기능 구현·격리 QA·DB 배포·웹앱 v0.326 운영 실증을 완료한 MTG-14를 [x]로 변경. 기존 실운영 비시연 재고이동 0건 때문에 실제 품목 판정 자체가 불가능한 점은 FIELD-03 실자료 검증대기에 보존하되 개발 미완료로 계산하지 않는다.
- **동시 브랜치 처리:** #1083이 먼저 v0.325로 출시되어 구버전 중복 #1084/#1086을 닫고, #1087이 최신 parser 보안을 유지한 자동 점검을 v0.326으로 병합. 중복 브랜치/이력은 GitHub에 보존, 운영 마이그레이션 중복 적용 없음.
- **검증:** #1079 77/77 CI, #1087 77/77 CI 성공 및 main Pages #39116206370·독립 #39116552336 SUCCESS. 운영 앱의 공개 index+재고 JavaScript 두 개 SHA 일치. 서버 SQL에는 기존 재고 이동을 갱신·삭제하는 코드 없음, 익명 실행 권한 없음.
- **남은 업무:** **37건 중 완료 14건 / 미완료 23건.** MTG-15의 법정 신고 자료 보증, QA-04/05 외부 왕복, SEC-01 서버 단일세션 등 다른 [ ]는 완료한 것으로 바꾸지 않음.

## 18. 2026-10-18 기능완료 분리 및 운영 POS 비로그인 검증
- MTG-14 / MTG-15 두 개발 기능은 각각 서버 권한·소스·CI·운영 배포 완료 근거가 있어 [x] 개발완료로 전환. 관련 실제 비시연/세무 원천 정확성은 별도 실자료 검증대기임을 명기.
- BUG-01은 운영 DB anon 권한 직접 검증과 GitHub P0 실제 HTTP 배포 게이트까지 개발 완료했지만 실제 현장 PC에서 PIN 직전 화면 및 개인 근태가 정상인지 확인되지 않아 [ ] 유지.
- 레시피 완료 기능을 재개발하거나 실제 운영 급여·재고 수량·POS 기록을 변경하지 않음.

## 20. 2026-10-18 실제 Edge 배포·Auth 운영 설정 재검증
- **MTG-03 부분 개발/검증:** 승인 소스 누락을 명시적으로 거부하는 Edge 검산 보강, [PR #1101](https://github.com/koith/attendance-proto/pull/1101) CI 55/55 PASS 및 원본/배포본 동기화, 운영 Edge function v62 소스 readback. 기존 실급여 데이터·승인 기록 변경 없음.
- **AUTH-01 운영 장애 원인 확인:** GitHub main 워크플로 실제 실행. 한국어 제목·HTML 정적 QA PASS, 관리 API 권한용 Actions Secret `SUPABASE_ACCESS_TOKEN` 없음; 출력 `PENDING_AUTH_WRITE_ACCESS`. 발송을 시도했다고 하거나 실제 스팸함 수신을 확인했다고 주장하지 않음.
- **보안:** 기존 SEC-01 WIP의 SQL+HTTP 테스트와 별개로 운영 사용자를 전체 강제 로그아웃시키는 정책은 현재 활성화하지 않음.

## 21. 2026-10-18 인하대점 모바일 매출·재고 UX 결함 수정 (Issue #1113)
- **현장 신고:** 390px iPhone 매출·매입 탭에서 4개 버튼이 같은 flex 행의 제목 공간을 압축하여 `매출·매입`이 한 글자 폭으로 내려간 현상. 사용자 스크린샷으로 신고, 개발 결과와 별도로 보존.
- **구현 1:** [PR #1114](https://github.com/koith/attendance-proto/pull/1114), main `942ad27c1726c51f4f8671b50da14f82de43fcbf`, v0.330. 제목 전폭 별도 행, 하단 가로 스크롤 한 줄 버튼 4개와 기존 ID/onclick 유지. Chromium 320/375/390/414/768/1280px 소스 기반 실제 렌더 검사, 총 77/77 CI PASS. [Pages 성공 #39136375325](https://github.com/koith/attendance-proto/actions/runs/39136375325), 독립 배포 성공 확인.
- **구현 2:** [PR #1116](https://github.com/koith/attendance-proto/pull/1116), main `abbf9341dd63b433e1f83db44fa29dec5a3d6d95`, v0.331. 재고 탭에 발주·입고 개수/장기체류 점검/전체 품목 3개 바로가기 추가. 기존 권한·실사·입고/발주 버튼과 작업 데이터 보존; UI 화면 링크가 실제 앱 라우터 hash를 바꾸지 않도록 클릭 스크롤만 수행. Chromium 6개 너비에서 원본 렌더러/동작/전체 페이지 가로넘침 검사, 총 78/78 CI PASS. [운영 Pages #39137211660](https://github.com/koith/attendance-proto/actions/runs/39137211660) 및 [독립 검증 #39137419745](https://github.com/koith/attendance-proto/actions/runs/39137419745) SUCCESS.
- **남은 작업:** 판매 조회/가져오기/매핑/내보내기 작업군 심층 IA, 재고 입력 최소화·직원 역할별 실사용 시간을 현장에서 검증. 이는 MTG-16의 [ ] 미완료와 Issue #1113 후속에 남김. 이번 변경만으로 전체 업무원장 완료 건수 증가시키지 않음.

## 23. 2026-10-18 MTG-07 확인된 실거래 판매명 자동 추출 및 매핑 검토
- 개발: [#1120](https://github.com/koith/attendance-proto/pull/1120) (main `473036428b2eb0d82da0631b38b07e0048c45d8e`) 추가. 기존 SKU 검토의 대량 판매명 수동 입력을 확인된 `KIS_POS`·배달 `SALE/CONFIRMED` 비시연 거래로 자동 채움. 실데이터가 없으면 정확히 빈 결과 반환하며 판매수량·원가·실재고 추정 금지.
- QA: 소스 파서, 소스 권한 연결 및 Postgres 합성 데이터의 지점 격리·취소/데모/매입 배제 테스트, PR 78/78 PASS. 운영 Supabase 신규 읽기 전용 RPC 권한 조회 확인. 프로덕션 매출·레시피·재고 테이블 INSERT/UPDATE/DELETE 없음.
- 배포: v0.332 Pages [#39138592099](https://github.com/koith/attendance-proto/actions/runs/39138592099) 성공; 독립 배포 알림 재검증 별도 실행 확인 필요.
- 나머지 요구: 실제 매출 메뉴 단위 수량·수정/취소/환불·배민/쿠팡이츠 채널원천과 지점별 레시피 교차 검증 전 MTG-07 [ ] 유지, MTG-13도 별도 미완료.

## 21. 2026-10-19 재고 발주 환산 오류 QA/운영 검증
- MTG-16 / #1129: 지점 실사용 재고의 단위 환산 누락/0을 조용히 1로 간주하던 위험 수정, 78/78 CI PASS, v0.335 Pages 동일 바이트·HTTP/브라우저 P0 운영 검증 PASS. 현장 직원 실사와 공급사 자동수집은 아직 완료했다고 주장하지 않음.

## 22. 2026-10-19 Apps Script 안전한 월별 보고서 생성 및 실배포
- QA-05 / [PR #1134](https://github.com/koith/attendance-proto/pull/1134): 월별 리포트 갱신 시 수동 검토·QA 탭 일괄삭제 제거, 기존 자동생성 레거시 탭만 정리. 실제 source 함수 격리 실행 회귀·53/53 QA, Web App v79 실제 재배포 및 본운영 근태 시트 2026-10 재동기화 응답 확인. 운영 실금액 임의 수정 금지. 독립 테스트용 전체 Edge→Apps Script→Sheet E2E는 별도 미완료.

## 23. 2026-10-19 실사 승인 이전 재고 변경 방어
- MTG-09 / #1162, PR #1164: 실제 PostgreSQL에서 직원 실사 후 판매 발생 시 구실사 승인 차단·재고 조정 없음 검증, 52/52 CI PASS. 운영 DB `CREATE OR REPLACE`로 두 관련 RPC만 교체, 실재고 및 직원 자료 DML 없음. 실제 비시연 재고이동이 아직 0건이므로 현장 검수 체크는 별도 보존.

## 24. 2026-10-19 재고 실사 감사 CSV 및 PR 검증 대기열 격리
- **MTG-09 부분 개발완료(현장검증대기):** [PR #1160](https://github.com/koith/attendance-proto/pull/1160), main `3d4d605c7842d14cdb3e7bd2465feda30ea2f0e1`, 앱 v0.340. 관리자는 지점 권한을 확인한 실사 결과의 실제 수량·원장 기준값·signed 차이 및 상태를 별도 **읽기 전용 감사 CSV**로 다운로드 가능. 데모·타 지점·Null 수량/차이 불일치/Excel 수식 삽입 차단. 조회는 실재고에 쓰기 없음. 합성 코드·브라우저·격리 Postgres QA **78/78 통과**, main 병합 완료. **운영 Pages 배포·공개 검증 완료:** [#39178561090](https://github.com/koith/attendance-proto/actions/runs/39178561090) P0·아티팩트 빌드·게시·same-run 검증 **모두 SUCCESS**. GitHub Pages 공개 `index.html`, `operations_reference_ui_v208.js`, `operations_stocktake_v1.js` 원본이 main squash `3d4d605c7842d14cdb3e7bd2465feda30ea2f0e1`과 각각 바이트 일치, 운영 웹앱 **v0.340 HTTP 200**, 보호 급여 HTTP 401 확인. Sheet 배포 재동기화 응답까지 성공. 실제 직원·점주 PIN 승인 실기기 검증은 미완료이므로 MTG-09 체크 [ ] 유지.
- **CI 재발방지:** 종전 `pages` 글로벌 concurrency 때문에 새 `main` 변경이 검증 대기 중인 PR의 P0 게이트를 취소시키던 원인을 확인. [PR #1160](https://github.com/koith/attendance-proto/pull/1160)에서 PR 번호별 P0 대기열과 운영 단일 Pages 배포 대기열을 분리. 테스트의 과거 고정 캐시키와 잘못된 미입고량 Null fixture 수정 후 재실행 검증 성공.
- **선행 PR 처리:** 충돌난 구 PR #1158은 #1160으로 대체하고 닫음. #1164 재고 변동 감지 수정과 관리자 승인/직원 제출 권한은 보존. 현장 데이터·원본 레시피·급여 무단 변경 없음.

## 25. 2026-10-19 재고 실사 기능 개발완료·현장 검증 분리
- MTG-09 구현 요소(직원 PIN/근무 중 출입, 비데모 실사 제안, 관리자 수락·반려, 별도 확정 POST, 제출 후 원장 변동 차단, 관리자 증빙 CSV)는 CI+격리 PostgreSQL+운영 Pages v0.340 직접 조회로 개발·배포완료 [x].
- 독립 실기기 직원/점주 인증·재고 실물 계측·본운영 거래 공급사 자료 검증은 합성 QA로 대신하지 않고 **현장검증대기**. 원본 재고·점주 계정 변경 없음.

## 26. 2026-10-19 화면상 개발 보고 유실 대비 원장 고정 및 공급사 입력 보조
- ChatGPT iOS 답변이 사라지고 대화 길이 초과가 표시된 사용자의 사진으로 확인됨. 화면 복원이나 UI 오류 원인을 단정하지 않고, 완성된 결과는 **GitHub PR·SHA·운영 배포 검사와 이 정본 문서**에서 독립 검증함. 별도 임의 완료 처리 금지.
- **기준:** 37개 업무 중 18개 개발완료, 19개 미완료. MTG-11은 PR #1177이 78/78 통과 후 main `c7f40691e7996f95b5f5dbfc2cc235a6dd1f6a80` 병합됐지만, 공식 공급사 연동 및 실거래 원격 장바구니 재조회가 없어 [ ] 유지. v0.343 운영 배포 확인은 GitHub Pages P0 게이트 실검증 결과를 별도 기록해야 함.

## 27. 2026-10-19 인하대점 모바일 재고 검색/실거래 원천 누락 금액 UX 완료 기록
- **MTG-16 진행:** 재고 검색·카테고리 변경마다 실제 발주/입고/점검 패널과 검색 입력이 파괴되는 현상 제거. #1182/#1183, main `2ec1182cdb1bb14dafa7ccaaa4516bd9cb52986f`, v0.344, 78/78 PR CI PASS, Pages #39203322874 same-run 바이트·v0.344·HTTP 200·보호 급여 401 PASS.
- **MTG-05/06 진행:** 매출·매입에서 실거래 데이터가 0건일 때 전체 매출·매입을 실제 0원이라고 오인하는 표시 제거. #1184/#1185, main `e29b4d19a21d4562c0fa76e02f569e43da512f23`, v0.345, 78/78 PR CI PASS, Pages #39203865972 same-run `index.html`, `operations_v1.css`, `operations_v1.js` 각각 main과 바이트 일치·v0.345 HTTP 200·급여 401 PASS.
- **원칙:** 사용자에게 보인 오래된 스크린샷 v0.329의 매출 제목 눌림은 v0.330부터 수정됐고 v0.342에서 추가 도구 접기 도입, 다시 동일 작업을 중복 수행하지 않음. 새 UX 두 개는 독립 결함 해결이지 POS·배달·공급사 원천 자동수집 완성이 아니다. 근태/급여/레시피·실재고 DML 없음.
- **체크 기준 유지:** 총 37개 중 개발완료 18개, 미완료 19개. 두 개선은 기존 MTG-05/06/16의 부분 구현이고 외부 원천/현장 검증 미충족이므로 완료로 속여 체크하지 않음.

## 28. 2026-10-19 공유 POS 직원 실사 PIN 인증 경합 차단 및 v0.346 운영 검증
- **MTG-16 개발·운영 안전성 보강:** [Issue #1189](https://github.com/koith/attendance-proto/issues/1189) 해결, [PR #1190](https://github.com/koith/attendance-proto/pull/1190) main squash `9b9013fa655c23ddac5934824f2c3029c59b34ce`, v0.346. 공유 POS에서 비동기 PIN 본인 확인 RPC 진행 중 직원 선택/입력 PIN 변경 시 기존 성공 응답이 뒤늦게 와서 재고 실사 화면을 복원하는 문제 해결. PIN 입력은 입력 즉시 인증 상태 무효화, 직원 변경/모달 닫기 시 검증 세대 폐기, 이전 성공·에러 응답 무시.
- **재현 테스트:** 실제 배포되는 `operations_staff_stocktake_v1.js`의 콜백을 지연된 RPC와 가짜 DOM에서 직접 실행한 `qa_staff_stocktake_pin_race_v1.mjs` PASS; 정상 새 직원 PIN 인증, 변경된 PIN·직원, 이전 오류 응답, 모달 종료, 미승인 재고 제출 차단 검증. 격리 재고 PostgreSQL·직원 실사/점주 승인 회귀와 신규 테스트 성공. PR 전체 **79/79 CI PASS**.
- **운영 게시·독립 검증:** [P0 Pages #39210872405](https://github.com/koith/attendance-proto/actions/runs/39210872405) 게이트, Pages 빌드/게시, 실제 공개 앱 모바일·데스크톱/지점 격리/익명 POS·PIN 검증/레시피 경계 전부 SUCCESS. **v0.346 HTTP 200**, 연결 JS 자산 일치, 보호 급여 HTTP 401; 배포 직후 2026-10 Google Sheet 동기화 확인 SUCCESS.
- **완료 범위:** #1189의 결함 수정은 완료·이슈 닫음. 단, **MTG-16 전체 업무는 여전히 [ ]**: 실제 POS·매입 자동수집, 실사용 직원 편의 및 외부 공급사 데이터 도달성, 개별 지점 현장 기기 검증 미완료. 원본 근태·급여·레시피·재고 장부 데이터 변경 없음.
- **원장 숫자 유지:** 전체 37, 개발완료 18, 미완료 19. 개별 버그 PR이 끝났다는 이유로 별도의 대규모 외부연동 항목을 임의 완료 처리하지 않음.

## 29. 2026-10-19 신규 근무현황 월간 개인별 총시간 — 스크린샷 피드백 실개발

- [x] **UX-01 (P1, 개발·CI·운영 배포 완료 / 실제 직원·점주 화면 수용 검증대기)** 사용자 2026-10-19 카카오톡/점주·직원 근무현황 스크린샷 요청: 점주 화면에서는 직원별 **해당 월 완료 근무시간**을, 직원 PIN 인증 화면에서는 **본인 해당 월 합계**만 쉽게 확인. [Issue #1193](https://github.com/koith/attendance-proto/issues/1193), [PR #1194](https://github.com/koith/attendance-proto/pull/1194) squash main `dd49059891fd22188cb88295bd1f17ce63172c60`. 별도 인증·급여/원장 쓰기 없음. `actual_attendance.js` 기존 정정 반영 출퇴근 세션을 직원 ID/월별로 합산, 야간 근무는 기존 달력과 동일한 출근일 기준 월 귀속, 진행 중·누락·16시간 이상 이상 기록 제외. 관리자/직원 공용 월력 위에 반응형 합계 UI, 월 이동·정정 이후 새로 계산, 중복 이름 다른 직원 ID 분리, HTML 이스케이프, 급여 산정시간 혼동 방지 문구. 실행형 `qa_actual_monthly_person_totals_v347.mjs`로 동명이인/정정/야간/전월/이상치/근무 중/빈달/직원 정보 격리 확인, **PR 79/79 CI PASS**. [Pages 배포·독립 검증 #39214524530](https://github.com/koith/attendance-proto/actions/runs/39214524530) SUCCESS: 실제 공개 v0.347 HTTP 200, `actual_attendance.js`, `actual_attendance.css`, `actual_attendance.html`, `index.html` **4개 파일 배포본이 SHA dd490598와 바이트 단위 일치**, 보호 급여 API HTTP 401. 현장 아이폰·실관리자/직원 사용성 최종 수용 검증은 별도 필요하지만 본 기능 개발 체크 [x] 완료.
- **정본 계산:** 직전 37건(개발완료 18, 미완료 19)에 신규 `UX-01` 접수 1건 추가, **38건 중 개발완료 19건, 기존 미완료 19건**. 외부 원천·실인원 필요로 남은 항목을 새 기능 실적으로 임의 체크하지 않음.

## 30. 2026-10-19 월별 근무현황 직원 카드 및 공간절약 — 운영 검증 완료

- **사용자 실기기 스크린샷 피드백:** v0.347 관리자 월별 근무시간이 이름-시간 **텍스트 리스트**였고, 제목/중복 월 표기 및 직원 화면 장문 설명으로 과도한 공간을 점유. 사용자 화면에 배포 반영 확인 요구.
- **개발/배포 완료:** [PR #1197](https://github.com/koith/attendance-proto/pull/1197) main `cc802c6f71d0126c2d5d95d2a81c98f20f1f5ffb`, **v0.348**. 관리자 합계에 기존 직원 카드의 아이덴티티 헤더(이름 첫 글자 원형 아바타·이름)와 시간 강조 바디, 모바일 **2열** 그리드, 짧은 월 근무시간 헤더/전체 합계 적용. 직원 PIN 개인화 화면도 중복 연월 제목 및 장문 설명 제거, 근거 설명은 ⓘ 툴팁과 스크린리더 텍스트에 보존. 기존 시간 정정·출근일 기준 월 귀속·이상치 제외·중복이름 독립 ID 및 타인 근무시간 비공개 계산 불변.
- **QA:** 전체 PR **79/79 CI SUCCESS**. 현재 렌더 함수를 실행하는 `qa_actual_attendance_monthly_cards_v348.mjs`, 기존 `qa_actual_monthly_person_totals_v347.mjs`의 16시간 초과/야간/정정/직원 개인정보 테스트까지 PASS. 실제 Chromium 320/375/390/768/1024px 테스트 모두 PASS: 카드 수 10개, 모바일 2열, 잘림/겹침/가로 넘침 없음. 테스트용 가상 직원만 이용.
- **운영:** [Pages run #39224056958](https://github.com/koith/attendance-proto/actions/runs/39224056958) P0/빌드/게시/독립 검증 전부 SUCCESS, `index.html`+`actual_attendance.html`+`actual_attendance.js`+`actual_attendance.css` **4개 운영 파일이 main cc802c6f와 바이트 단위 일치**, 공개 **v0.348 HTTP 200**, 보호 급여 API HTTP 401.
- UX-01 후속 개선으로 **완료 건수 중복 추가 없음**: 정본 **38건, 개발완료 19건, 미완료 19건** 유지. 실제 사용자 아이폰 체감 검수는 후속 사용자 수용 검증으로 분리.

## 31. 2026-10-19 근무현황 월 합계 달력 하단 재배치 — UX-01 후속

- **사용자 원문:** “최근에 근무현황(관리자입장/직원입장)에서 총근무시간 추가했는데 달력보다 위에 배치했더니 불편하다 달력 아래로 옮겨라” → [Issue #1193](https://github.com/koith/attendance-proto/issues/1193)에 원문 보존.
- **코드 수정·검증·병합:** [PR #1205](https://github.com/koith/attendance-proto/pull/1205), main squash `c0a9bad642d07bd6c5b804bf32fb3a95b6f3c647`, **앱 v0.349**. `actual_attendance.js`의 관리자/직원 공통 월 렌더 래퍼에서 `insertAdjacentHTML('afterbegin')`을 `beforeend`로 수정해 화면 순서 **요일 헤더 → 달력 → 범례 → 오늘 버튼 → 총근무시간(관리자 직원별 카드·직원 본인 합계)** 로 변경. JS/CSS 캐시 키 교체, v0.349 배지 갱신.
- **실행 검증:** PR **88/88 GitHub Actions SUCCESS**(월 총합 계산·PIN 직원 격리·정정/자정/이상치, 실물 Chromium 관리자/직원 실제 공통 래퍼 DOM 순서·반복 렌더 중복 방지·모바일 카드/가로 넘침 포함). **운영 Pages 게시 및 독립 배포 확인은 연계된 P0 배포 실행에서 최종 판정**; PR CI만으로 운영 배포 성공을 주장하지 않음.
- 완료 항목 UX-01의 후속 UX 재배치이므로 **새 원장 업무 ID나 완료 건수 중복 추가 없음: 전체 38건, 완료 19건, 잔여 19건**. 원본 근태·급여·레시피·서버 Auth/DB 변경 없음. 실사용자 화면 수용 검증대기 범위 유지.

## 32. 2026-10-19 잔여 일감 처리 재개 — QA-05 사전검사 및 QA-06 서버 실제산식 증거 확대

- **원문 보존:** [통합 원장 #1008](https://github.com/koith/attendance-proto/issues/1008) 새 댓글 #6263878340에 사용자 “업무자동화 개발 이어한다. 업무원장에 기재된 내용 기반으로 남은 일감 처리해. 막힌다고 멈추지 말고 ...” 원문 접수.
- **QA-05 (P0, 부분완료; 여전히 [ ]):** [PR #1208](https://github.com/koith/attendance-proto/pull/1208), main `55f009239cd6f4ca05aa197e205777103ea3f8af`. Apps Script doPost의 시트 개설·기존 월 보고서 clear 전 **세 원천(attendance/sessions/payroll) 행/열 직사각형, 자료형/유한 숫자/길이/용량, 헤더·누락 섹션** 검사 추가; 잘못된 원천은 명시적 오류와 함께 **서버 시트 쓰기 전 차단**. 빈 달 및 합법적 null은 보존. 실제 doPost와 가상 in-memory Sheet 접근 횟수를 비교하는 `qa_sheet_payload_preflight_v1.mjs` 추가 및 Apps Script PR/운영 배포 CI 연결. **PR 59/59 Actions SUCCESS**; main [Apps Script report deploy #39229949036](https://github.com/koith/attendance-proto/actions/runs/39229949036) SUCCESS. 테스트용 합성 시트 셀 값은 실제 운영에 전송하지 않음. **미완료:** 신규 *격리된 실제* 테스트 시트에서 Edge→GAS→시트 쓰기/재조회/정정/장애/점포 경계의 종단 검증; 실제 운영 스프레드시트 동기화 성공만으로 다른 지점 격리 외부 E2E 완료로 판정하지 않음.
- **QA-06 (P1, 부분완료; 여전히 [ ]):** [PR #1209](https://github.com/koith/attendance-proto/pull/1209), main `a3e34ca5ecf3c2b9acace04d9d47673b8eeb050b`. 원본 배포 급여 엔진 `createPayrollEngine`을 실행하여 실제 시각 25분 지각/25분 조퇴/둘 다 50분 차이에 대한 근무분·시급 적용 합계, 2026-09 퇴사 후 9일 공백 및 재입사 월급제 21/30일 비례액, 겹치는 고용 기간 이중지급 금지를 추가. 기존 26건→**28개 실행형 시나리오**, 기존 **7개 현장 실증 GAP는 계속 남음**. PR **55/55 Actions SUCCESS** 및 QA-06 전용 Actions PASS. 합성 출퇴근을 실제 승인된 지각·조퇴·재입사 사실로 보고하지 않음.
- **앱 버전:** 이 두 PR은 서버 GAS 입력 방어/합성 QA에 국한되며 일반 사용자 화면 자산 변경 없음. 공개 앱 **v0.349 유지**. 운영 근태·급여·레시피·거래 DB 데이터 직접 변경 없음. 신규 ID 체크 없음: **정본 전체 38, 완료 19, 미완료 19**.

## 33. 2026-10-19 QA-05 지점별 Google Sheet 실제 파일 분리 방어 (추가 개발)

- **[PR #1213](https://github.com/koith/attendance-proto/pull/1213)** / main squash `7d81293acfebb195a3c7335f16303d2bfe38097a`. 앱 버전 **v0.349 유지**(Apps Script 서버 측 분리 조건만 수정).
- 원인: 신규 지점의 `ATTENDANCE_BOOK_<store>_<year>` 식별자가 없는 경우, 기존 코드가 스크립트의 최초 활성 워크북을 그대로 채택해 **새 지점 동기화가 기존 지점 연간 시트로 향할 위험**이 있음. 또한 `store_key`의 모든 특수문자를 밑줄로 치환하면 서로 다른 지점 키가 동일 파일로 충돌 가능.
- 수정: 보존된 기존 식별자→스프레드시트 매핑 재사용은 유지하되 **최초 활성 워크북 재사용을 1/INHA 구형 주 지점에만 한정**; 그 외 신규 지점은 반드시 독립 스프레드시트 생성·매핑. 모호한/공백·비ASCII·긴 키는 시트 접근 전에 명시적 `BAD_STORE_KEY` 차단. `qa_sheet_store_isolation_v1.mjs`에서 실제 Apps Script 함수와 완전 격리형 SpreadsheetApp·DriveApp·PropertiesService 모의 API로 1↔2↔3 지점, 재호출 멱등성, 키 충돌/잘못된 키 쓰기 차단 검증. **PR 57/57 Actions SUCCESS**. 실제 운영 원본 파일을 테스트로 변경하지 않음.
- **QA-05 [ ] 계속 유지:** 이 수정은 운영 안전성 코드를 보강한 것이며, 실제 분리 테스트 Sheet에 대해 **Edge→GAS 웹앱 실쓰기·재조회·수정재동기화·오류 재시도**를 실행한 근거가 아니므로 종단 QA 완료 아님. 기존 정본 **38개 중 완료 19, 미완료 19** 불변.


## 34. 2026-10-19 QA-05 연간 보고서 원본 보호 및 잘못된 재연결 차단 — 코드/QA/배포 완료

- **접수:** [통합 원장 #1008](https://github.com/koith/attendance-proto/issues/1008) 사용자 지시 원문 댓글 #6264538628. 사용자는 남은 19건 개발 지속, 막힘 시 대체 경로, 버전과 완료·미완료 목록 보고를 명령.
- **QA-05 부분 개발:** [PR #1218](https://github.com/koith/attendance-proto/pull/1218), main squash `4d17cc480b18bbbbcf7ea16064ca41a9a63047ab`. `apps_script.gs` 기존 지점-연도 파일 매핑이 있는데 Google Drive의 해당 워크북을 열 수 없을 때, 예전처럼 매핑을 삭제하고 새 빈 스프레드시트를 생성하지 않고 `MAPPED_WORKBOOK_UNAVAILABLE`로 **실패 폐쇄**하며 원본 파일 식별자를 보존. 새해 동기화 시 Script Properties가 유실되어도 지난해 명시적 근태 파일을 활성 파일로 재활용/개명하지 않음. 저장된 파일 매핑이 다른 연도 파일을 가리키면 `MAPPED_WORKBOOK_YEAR_CONFLICT`로 쓰기 전에 차단. 자동 복구 실패를 동기화 성공으로 위장하지 않음.
- **격리형 회귀:** `qa_sheet_store_isolation_v1.mjs`에 매핑 파일 접근 불가/오류 응답/원식별자·원근태 파일 이름 보존, 기존 연도→신규 연도 생성·재호출 멱등성, 오염된 연도 매핑의 데이터 쓰기 차단 케이스 추가. 실운영 근태·급여·레시피/사업장 시트 데이터 변경 없이 가상 Google Apps Script API에서 검증. **PR GitHub Actions 54/54 SUCCESS**.
- **배포/검증:** [Apps Script report deploy #39234250300](https://github.com/koith/attendance-proto/actions/runs/39234250300) **SUCCESS**. [P0 Pages #39234250310](https://github.com/koith/attendance-proto/actions/runs/39234250310) P0 게이트·아티팩트 빌드·게시·동일 실행 독립 검증 **SUCCESS**. 일반 사용자 앱 화면 자산 미변경 → **v0.349 유지**.
- **중요 범위 경계:** 격리된 실제 신규 시험시트에 대한 **Edge→Apps Script 웹앱→Google Sheets 쓰기/재조회/수정·재시도·지점별 Auth E2E** 및 실인원 검증은 아직 수행되지 않았으므로 **QA-05 [ ] 유지**. 전체 정본 **38개 중 완료 19개 / 미완료 19개**, 신규 체크된 원장 ID 0개. 코드 수정 1건/PR 1건은 완료지만 QA-05 전체 완료는 아님.

## 35. 2026-10-20 잔여 업무 코드/검증 진전 — QA-05·QA-06·QA-07·MTG-06

- **접수·연속성:** 사용자 잔여 19건 처리 지시 및 실개발·QA·기타 PR/배포 증거는 [업무원장 이슈 #1008](https://github.com/koith/attendance-proto/issues/1008) 댓글 #6271856914, #6272069875, #6272430602에 보존. 각 PR 번호와 커밋을 대조하며, 사용자 보고에는 현재 앱 버전과 완료/미완료 ID 전수를 기재.
- **QA-05/06/07 실행 증거 확대 — 병합 완료:** [PR #1239](https://github.com/koith/attendance-proto/pull/1239), main `d719ce83d51d84fc7d28ecfe550275ec5598d1b5`. `qa_store_opening_matrix_v1.mjs`에 독립적으로 존재하던 실행형 QA 5개를 추가: Apps Script 실제 doPost 잠금, 시트 지문 동시완료, 실제 급여 엔진의 시각차/지각·조퇴 근무분·월급 검산, 퇴사→재입사 근무 공백 및 중복지급 방지, 매출 대사 조회 지점 전환 비동기 결과 격리. 전체 매트릭스 53개 항목, 참조 파일 존재/중복 없음 검사. PR 51개 워크플로 중 49개 성공 확정 및 마지막 2개 각 job SUCCESS 확인 뒤 병합, 신규 지점 개통 통합 QA SUCCESS. 합성 검증이며 외부 시험 메일·실시트·실POS·현장 검증 완료로 오인하지 않음.
- **QA-05 서버 Sheet Busy 409 분류 — 코드·QA·병합·서버 배포 완료:** [PR #1237](https://github.com/koith/attendance-proto/pull/1237), main `81998e8bb8fa0440fc2c22339f178b229f69080b`. GAS가 응답 본문에 정확한 `SHEET_SYNC_BUSY`를 반환할 때만 Edge에서 HTTP 409를 던져 의도된 재시도 루틴이 구별하도록 하고, 기타 오류/악의적 유사 문자열/비JSON 응답/실패를 정상 처리하지 않음. 최초 CI의 배포 미러 불일치 실패를 해결: 배포 `edge-release/supabase/functions/server-sync-sheet/index.ts`와 정본 Edge 함수를 동일 Git blob SHA로 교정(commit `17a33c8fbba18463f30b32a7ca23b2dfe459632b`), **byte-identical** 재조회. PR **56개 워크플로 QA 성공 증거(54개 success 최종 표기 + 마지막 2개 실제 job success 확인)**. [Production payroll Edge deployment #39288283967](https://github.com/koith/attendance-proto/actions/runs/39288283967): Payroll acceptance gate 및 native Supabase Edge deployment attestation 모두 **SUCCESS**. **단, 격리 실제 시험시트 Edge→Apps Script→Sheets 전면 재조회 E2E 미실행**이므로 QA-05 [ ] 유지.
- **MTG-06 비동기 지점/기간 대사 조회 방어 — QA 통과·병합 미완료:** [PR #1236](https://github.com/koith/attendance-proto/pull/1236) branch head `d494afc57fbe0731285afb20488c15c613524ad8`: 비동기 2단계 대사 조회 중 다른 지점/시작·종료 날짜 전환 결과 노출 차단, 중복 클릭 방지, 성공·부분 오류·실패 후 버튼 해제. 고정 캐시키 테스트 및 타 기능 재고실사 테스트의 앱 버전 `v0.350` 하드핀 충돌을 찾아 실제 회귀검사를 수정. **PR 79/79 workflow SUCCESS 확인**이나 PR 병합 요청이 도구 안전 검사에서 거부되어 **운영 v0.351 배포 완료 아님**. 외부 POS 결제/취소·정산 실거래 E2E도 미검증, MTG-06 [ ] 유지.
- **앱/집계 경계:** 본 기록 작성 당시 latest main 사용자 화면 **v0.350**; #1239는 QA만, #1237은 서버 Edge 코드. 페이지 게시 상태는 해당 SHA의 P0 Pages run에서 별도 판단하고 CI 통과를 공개 화면 반영이라고 표시하지 않음. 실제 근태·급여·직원·본사/지점 레시피·매출·재고·시트 운영 원본 무변경. **38개 중 완료 19·미완료 19**, 이번 신규 체크 완료 ID **0개**. 후속 QA-05/06/07·MTG-06/외부 실증 진행.

## 36. 2026-10-20 #1243 신규 지점 개통·대표/보조 관리자 초대 작업 (진행 중)

- **원문 접수:** [Issue #1243](https://github.com/koith/attendance-proto/issues/1243), [2026-10-20 사용자 원문 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6280834293). 기존 HQ 3계정, 운영 인하대학교점(1) 계정/데이터/원본 근태·급여·레시피 불변. 본사 관리자 이메일 초대는 범위 제외. 운영 시험메일·실계정 권한 변경·지점 생성/삭제 승인 전 불가.
- **원인 확인:** 현재 본사 UI `hq_owner_console.js`에는 신규 지점 생성 폼이 없고 `hq_store_onboarding_ui.js`의 별도 폼만 존재했음. Edge `server-sync-sheet` 초대는 `inviteUserByEmail`만 쓰므로 Supabase Auth 기존 인증 계정에 409가 발생할 수 있으며, HQ UI 자체에서도 기존 계정을 초대 경로에서 막았음.
- **#1243 실제 구현 (코드 QA/운영 증거에 따라 최종 판정 예정):** 현행 본사 지점 관리 콘솔에 HQ 전용 `hq_store_register` 기반 STAGED 신규 등록 폼 추가(중복/유효성 검사, 등록 직후 운영 비활성 확인). 이메일 신규 초대와 **이미 이메일·비밀번호 인증된 기존 계정 직접 연결(메일 발송 없음)**을 분리. `hq_store_existing_verified_account_connect` 신규 RPC는 HQ 권한·Auth 소유 및 인증·지점·중복 대표·대기 초대·기존 HQ/타점·READY 보조 경계를 서버에서 확인하고, 기존 OWNER 직접 연결 또는 보조 기본 권한 전부 OFF 저장. 초대 실패를 우회하려고 타인의 가입 비밀번호를 재설정하거나 이메일을 가장하지 않음.
- **코드·테스트:** 개발 브랜치 `feat/store-onboarding-1243-main`; additive migration `20261020093000_hq_verified_existing_account_reconnect.sql`; `qa_hq_existing_account_reconnect_1243.sql` 독립 PostgreSQL 합성 fixture, `hq-existing-account-reconnect-1243.yml`, `qa_hq_owner_browser_acceptance.mjs` Chromium 등록·재연결 재생 및 기존 `store-opening-full-journey.yml` 연결. UI 버전 제안 `v0.352`, 운영 게시 판정 전 배포됐다고 주장하지 않음.
- **외부 실증 미완료:** Supabase 실제 격리 Auth/SMTP 수신·링크·비밀번호/토큰, 한국어 운영 템플릿, 새 지점 Google Sheets 전체 왕복, 실제 점주/보조 실기기, 운영 데이터 read-only 변경 전후 비교, 재초대 만료/취소/재발송 full E2E. QA-04/05, AUTH-01, FIELD-01 등과 #1243 전체 완료 조건 유지. 직접 연결은 기존 *검증된 계정*용이며 기존 확인 메일 재발송과 다름.
- **정본 집계:** 38개 중 완료 19 / 미완료 19 (이번 신규 완료 체크 0). Issue #1243은 별도 통합 추적이며 미완료 기존 ID를 부당하게 [x] 변경하지 않음. PR/CI/운영 증거는 후속 커밋에 추가 예정.

## 37. 2026-10-20 #1243 잔여 초대·활성화 안전성 개발 (v0.353, CI/운영 판정 전)

- **현재 기준:** [v0.352 배포 성공 Issue #1246](https://github.com/koith/attendance-proto/issues/1246) / [PR #1245](https://github.com/koith/attendance-proto/pull/1245) main `d7948ab86ca2a8f11adc343f4ce6f70ec2aa3378`에서 시작. 이를 재개발하지 않음. 기존 #1243 유지.
- **이번 구현:** 개발 브랜치 `fix/invite-preflight-reissue-1243-v353`에 신규 additive migration `20261020121000_invitation_dispatch_activation_preflight_1243.sql`. 서비스 전용 `service_store_invitation_dispatch_preflight`는 권한·지점·기존 HQ/타지점 역할·기존 대표·대기중 초대 및 READY 보조 조건을 메일 송신 **전에** 판정하고 성공한 항목만 Edge 인증 발송을 허용. 기존 Auth 계정이 확인+비밀번호 보유이면 신규 초대 대신 v0.352의 명시적 기존 인증 계정 재연결 안내. 이메일 인증됐지만 비밀번호가 없는 계정은 수신자 소유 증명을 요구하는 Recovery 메일 분기(인증 계정 비밀번호를 서비스에서 임의 변경하지 않음). 신규/미인증 계정은 기존 Supabase Invite 이메일 분기, Auth user_id 연속성 확인.
- **취소/만료 링크 비밀번호 보호:** `store_invitation_activation_preflight`는 로그인 토큰의 auth.uid, 현재 email 확인, admin_users 권한 생존 여부, 대표 초대 intent 만료·대표 단일성, 보조 READY/활성 대표/위임 퍼미션을 확인. 실제 `owner_activation.js`가 비밀번호 PUT **이전에** RPC를 호출하여 실패 시 비밀번호를 전혀 변경하지 않도록 수정. 취소된 Auth 링크가 살아 있어도 소속/권한 확인 실패 전 차단. 기존 입장·대표 자동 지정 API 추가 후 재검증 및 실앱 v0.353·`owner_activation.html` JS 캐시교체.
- **QA 구성:** `qa_invitation_preflight_1243.sql`는 기존 진짜 #921 초대 SQL + 신규 migration을 별도 PostgreSQL에 적용, 계정 미인증·기존 확인/비밀번호 없음·기존 확인/비밀번호 있음·취소→같은 Auth 재초대·기한만료·보조/대표 격리·HQ/타점 불변·익명/일반 사용자 함수 권한 검증. `qa_invitation_edge_dispatch_1243.mjs`는 실제 Edge 발송 helper를 synthetic Auth/SMTP로 실행, 거부 시 무발송 및 Recovery와 신규 Invite 구분 확인. 기존 브라우저 개통 QA에 사전 검증 앞서지 못하면 실패하는 계약 및 revoked/expired 실UI 비밀번호 미변경 케이스 추가. 새 CI `invitation-preflight-1243.yml`과 기존 store-opening QA 연결. **QA/PR 성공 및 운영 적용은 결과를 확인한 뒤 별도 기록**.
- **변경금지/운영 기준값 (읽기만):** 운영 `attendance` HQ 3명, 인하대학교점 직원 10명/READY 1건/대표 0명, 전체 지점 244건. 실제 HQ 관리자/INHA 직원·근태·급여·원본 레시피·운영 시트와 실인원 초대/권한 변경/지점 생성·삭제는 이번 테스트에서 실행 금지. `franchise-ops` 프로젝트도 별개로 변경하지 않음.
- **검증대기(개발 완료라고 부르지 않음):** 운영 Supabase Auth→SMTP 실제 메일·받은편지함·메일 복구/인증 링크, 한국어 Auth 초대 템플릿 운영 반영, 실제 격리 점포 직원→근태→급여→Google Sheets E2E 및 단말, 이메일 rate-limit/SMTP 실패 및 실제 만료 토큰. QA-04/05, AUTH-01, FIELD-01을 임의 완료 처리하지 않음. 기존 원장 총계 **38건 중 완료 19·미완료 19**, #1243 아직 진행.


## 38. 2026-10-20 v0.353 Pages 배포 실패 #1248 복구 완료

- **실패 증거:** [Issue #1248](https://github.com/koith/attendance-proto/issues/1248) / [Pages run 39359415513](https://github.com/koith/attendance-proto/actions/runs/39359415513) P0=SUCCESS, Pages artifact=SUCCESS, 실공개 모바일/데스크톱 Chromium·자산 검증=SUCCESS, 그러나 `Confirm immediate Sheet refresh after Pages deployment` 단계 FAILURE. 여러 번 `SHEET_SYNC_BUSY` (409)·`SHEET_NON_JSON_RESPONSE` (502) 이후 약 5분 45초 경과한 요청이 `DEPLOYMENT_IDENTITY_REJECTED` (403)로 끝남. 서버 `authenticate(req,mode="deployment")`가 GitHub Actions OIDC JWT 서명/만료 및 워크플로·리포지토리·main 출처를 검사한 뒤 거절. **단기 GitHub OIDC 토큰을 재시도 8회 동안 한 번만 발급하여 재사용하는 것이 식별된 결함 경로**. 정확히 만료 오류는 서버의 포괄적 에러 매핑으로 노출되지 않으므로 `JWT_EXPIRED` 단정은 하지 않음.
- **수정:** [브랜치 `fix/pages-oidc-refresh-1248`](https://github.com/koith/attendance-proto/tree/fix/pages-oidc-refresh-1248)에서 Pages 의무 Sheet write/readback 검사 과정 각 재요청 직전에 `core.getIDToken(audience)`으로 짧은 수명 토큰을 **새로 발급**. `SHEET_SYNC_BUSY` / `SHEET_NON_JSON_RESPONSE`만 제한 재시도; 403 권한 오류·오류 응답·최종 미확인 Sheet는 계속 fail-closed. `written === true`, spreadsheet_id 및 자동 열 너비 확인 조건 절대 완화하지 않음. `qa_deployment_sheet_transient_retry_v1.mjs`에서 세 번/최악 8번 응답의 모든 Authorization 토큰이 서로 다른지 실행형 검증 추가. 기존 웹앱 배포 소스 **v0.353** 그대로 유지 (배포 정책만 수정, 실제 페이지 콘텐츠 불변).
- **검증·복구 완료:** [PR #1249](https://github.com/koith/attendance-proto/pull/1249) 50/50 CI SUCCESS → main `5e834ed859a1d4bcccaf0b6c704894020f7af42b`; [Pages #39362743821](https://github.com/koith/attendance-proto/actions/runs/39362743821) **4/4 jobs SUCCESS** (P0/빌드/게시+Sheet write/후속 QA) → [독립 #39363098448](https://github.com/koith/attendance-proto/actions/runs/39363098448) **SUCCESS** 및 [배포 성공 Issue #1250](https://github.com/koith/attendance-proto/issues/1250)에서 exact SHA, 공개 HTTP/버전 `v0.353`, 모바일/데스크톱 Chromium, 변경 자산 일치 확인. 운영 HQ 관리자 3, INHA 직원 10/READY 1/대표 0, 전체 점포 244 변경 없음. **과거 v0.353 #1248 실패는 성공으로 변경하지 않음.** 실외부 메일/인증/점포/독립 Sheets E2E (QA-04/05, AUTH-01, FIELD-01)는 이번 Sheet 운영 동기화 확인과 별개로 남아 있음. 기존 총계 **38/19 완료/19 잔여** 불변.


## 39. 2026-10-20 #1243 QA-05 외부 Apps Script 배포 인증 안정성 후속 (검증 중)

- **미반영 취약 경로:** `.github/workflows/apps-script-deploy.yml`에서도 Pages #1248과 동일하게 짧은 수명 GitHub OIDC bearer를 **최대 8회 시트 갱신 재시도에 재사용**했음. 409 `SHEET_SYNC_BUSY`만 재시도하고, 실제 GAS에서 관찰된 502 `SHEET_NON_JSON_RESPONSE`는 곧바로 실패함. #1248의 성공을 QA-05 전체 완료로 잘못 확대하지 않는다.
- **이번 코드:** `fix/gas-deploy-oidc-renewal-1243` 브랜치에서 Apps Script 배포 후 시트 쓰기 증거 단계도 매 요청 새 `core.getIDToken` 발급, 409/502 **명확한 두 일시 장애만 제한 재시도**, 응답의 `written===true`/spreadsheet ID/열 자동 너비 확인 필수. 타 인증 오류 즉시 실패, 무한 재시도 금지. 합성 `qa_apps_script_sheet_oidc_v1.mjs`는 실제 workflow 스크립트 추출 후 실행하며 3/8회 다른 bearer와 403 즉시 거부 검증. 본사 계정·INHA 원본 DB/시트 필드·업무 로직 변경 없음. 
- **분리:** 실제 GAS 배포·원본 Sheet 쓰기 결과는 PR/Actions의 후속 수신 결과에 따라 증거를 갱신한다. Google Sheets 독립 신규 점포의 실제 외부 E2E, Supabase Auth/SMTP 수신, 현장 기기 등은 계속 별도. 원장 **38중 완료 19, 미완료 19**, Issue #1243 열린 상태 유지.


## 40. 2026-10-20 #1243 신규 지점 단일 격리 수명주기 + 안전 정리 E2E QA 증강

- **사용자 원문 접수:** [Issue #1243 신규 지시 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6282746825). #1252 배포 복구는 별도 완료, 재작업하지 않음.
- **실행형 신규 시나리오:** `qa_store_opening_lifecycle_1243.sql`은 GitHub Actions의 **일회용 PostgreSQL 16 전용 DB**에서 기존 실제 invite/reconnect/activation PostgreSQL 마이그레이션을 실행한다. 별도 QA 신규 STAGED 지점 705/706 + 실제 SQL의 서비스 초대 사전심사/관리자 연결 + 새 계정 초대 모의 생성→이메일 확인·암호설정 모의→대표 승격 + 기존 인증 계정의 명시적 보조 관리자 재연결 + 권한·해임 후 오래된 토큰 차단 + 초대 취소/재발송, 만료·복구·재발송을 연속 검증한다. 추가로 합성 직원·근태·급여·시트 행·레시피의 지점 구분을 점검한다. **별도 실제 소스 엔진 시험**은 기존 50개 이상 JS 레인/일회용 PostgreSQL 마이그레이션에서 수행하며, 이 보조 투영 테스트 단독으로 실제 Sheets API 동작을 증명하지 않는다.
- **격리 정리 시험:** 3 HQ/인하대 직원 10명/원본 레시피를 별도 가상 보호 fixture에 준비. 보호 지점 및 마커 불일치, READY 상태, 직원·지점관리자·초대 등 참조가 남은 상태의 정리 **거부**; 실제 synthetic QA-owned 행만 정밀하게 아카이브·검수 후 FK 순서대로 제거하고 잔여 참조 0/보호 fixture 불변 검사. 범용 운영 지점 삭제 함수는 설치하지 않는다. 일회용 DB 자체도 CI에서 DROP한다.
- **CI 연계:** `.github/workflows/store-opening-full-journey.yml`에 신규 수명주기 SQL + 기존 계정 재연결·초대 사전심사 SQL을 각각 독립 DB에서 실행, 실제 Edge 초대 dispatcher의 격리 모의 네트워크 검사 추가. 워크플로 결과·PR·운영 배포 증거는 실행 후 Issue #1243에 별도 기록한다. 앱 코드 미변경: `v0.353` 유지.
- **검증 경계:** 실제 GoTrue 신규 Auth user 생성·SMTP 송수신·수신함 클릭·실사용자 로그인과 세션, 격리 테스트 Sheet를 대상으로 한 전체 Edge→Apps Script→Google API 실제 왕복, 매장 POS 실기기 모두 이 SQL/Chromium 자동 QA가 대체하지 못한다. Supabase 독립 개발 브랜치 생성은 **비용 확인 및 사용자 승인 요청** 응답으로 생성되지 않음. 실제 운영 지점·HQ 관리자·인하대 원본에 테스트 DML 없음. **QA-04/QA-05/AUTH-01/FIELD-01/#1243는 부분 개발/외부 검증대기 [ ] 그대로**.

- **2026-10-20 실제 검증 확정 증거:** [PR #1253](https://github.com/koith/attendance-proto/pull/1253) main `af3a586e941c839fa3e540d107167bdbb94d7a49`. 최초 [SQL fixture FK 실패 #39365733758](https://github.com/koith/attendance-proto/actions/runs/39365733758) 원인을 보호 INHA 테스트 지점 미생성으로 특정, commit [f887cebb](https://github.com/koith/attendance-proto/commit/f887cebb6cb4562af2be5c15386ef086c92dcc17)로 수정. 수정 후 PR CI **51/51 SUCCESS**, [격리 전체 QA #39365835949](https://github.com/koith/attendance-proto/actions/runs/39365835949): 원본 Edge dispatch + JS/Chromium + **18개의 독립 PostgreSQL 16 fixture**(각 DB 개별 생성·실제 SQL 설치·검증·DROP) 성공. [main 통합 QA #39366048941](https://github.com/koith/attendance-proto/actions/runs/39366048941) SUCCESS. [P0 Pages #39366048998](https://github.com/koith/attendance-proto/actions/runs/39366048998) **4/4 jobs SUCCESS**(브라우저/필수 Sheets 운영 재동기화 포함), [독립 배포검증 #39366317499](https://github.com/koith/attendance-proto/actions/runs/39366317499) SUCCESS, [공식 성공 Issue #1254](https://github.com/koith/attendance-proto/issues/1254). **앱 v0.353 유지**; QA SQL·워크플로·문서만 변경. 운영 읽기전용 사전·사후 모두 **HQ 3 / INHA 직원 10 / 전체 지점 244 / INHA READY 활성 1 / INHA 대표 0**. 신규 운영 테스트 지점/실계정 생성·삭제, 근태·급여·레시피 운영 DML 없음. 실제 외부 SMTP/GoTrue 인증·격리 Edge→Apps Script→Google Sheets/API 및 POS 실기기는 여전히 별도 미검증으로 **#1243, QA-04, QA-05, AUTH-01, FIELD-01 [ ]** 보존. [Issue #1243 최종 증거 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6282946692). **정본 38개 중 [x] 19, [ ] 19 유지(부분 QA 추가만으로 체크하지 않음).**


## 41. 2026-10-20 #1243 무료 격리 실제 Auth/SMTP 및 실 Google Sheets API 검증

- **사용자 지시 정본:** [#1243 원문 접수 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6284288904). 기배포 v0.353/PR #1253/#1255 완료 작업 재실행 없이 실제 서비스 프로토콜 검증 진행.
- **실 Google Sheets API 완료(독립 테스트 파일에 한정):** 기존 업무운영 `2026 근태`와 분리해서 [QA1243 실제 테스트 파일](https://docs.google.com/spreadsheets/d/1iI8ywGtr7LqI24LUPhw31hBuuhi9DeGj8eaAg_L8ogI/edit) 생성. Native Google Sheets API `batchUpdate` 쓰기 후 `get_spreadsheet_cells`/`get_spreadsheet_range` 직접 재조회. QA_STORE_A 2개 행, QA_STORE_B 1개 행 별도 기록. 같은 A 이벤트 키에 대해 동일 write를 2번 재실행 후 행 중복 증가 없음(A 헤더 포함 총 3행); A 수정을 **360분/45,000원 revision1 → 390분/48,750원 revision2**로 실행 후 금액/수정 이력 readback; B **480분/60,000원** 및 행수 2 유지. QA_AUDIT에 수행 기록. [Issue #1243 Sheets 증거](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6284365571). 이는 **Google Sheets 실제 서비스 API 직접 왕복 PASS**지만 앱→Edge→Apps Script 인증·쓰기 또는 서로 다른 Google Sheet 파일 단위 ACL 격리 및 소스 엔진 자체의 멱등 처리 증거가 아니다. 기존 운영 시트 대상 변경 없음.
- **무료 격리 실 Auth/SMTP 환경 구축:** GitHub Actions runner의 **실제 Supabase GoTrue `supabase/gotrue:v2.197.0`** + PostgreSQL16 + **Mailpit SMTP `axllent/mailpit:v1.27`**; 모든 Auth 이메일은 `@qa1243.invalid` 및 SMTP 로컬 127.0.0.1:1025, HTTP 로컬 9999/8025. 운영 Supabase project URL/키·SMTP 비밀번호 불러오지 않으며, 유료 Supabase 개발 브랜치 생성 안 함. [PR #1256](https://github.com/koith/attendance-proto/pull/1256), 신규 `qa_gotrue_mailpit_live_1243.mjs` + `.github/workflows/qa1243-gotrue-mailpit-live.yml`. 초도 실행 [#39376823088](https://github.com/koith/attendance-proto/actions/runs/39376823088)에서는 GoTrue DB 마이그레이션이 시작되기 전 auth schema가 누락돼 실패, 두 번째 실행 [#39377098323](https://github.com/koith/attendance-proto/actions/runs/39377098323)에서는 런타임 search_path가 public이라 실제 `/invite`에서 relation users missing을 검출. QA 환경 초기화에 `CREATE SCHEMA auth` 및 `ALTER DATABASE ... SET search_path = auth, public`을 추가. **수정 후 실제 GoTrue+Mailpit #39377222293 SUCCESS / 13개 PASS**, 이어서 OTP 유효기간 60초를 지정하고 별도 초대 메일 링크를 70초 경과 후 검증한 [#39377499415](https://github.com/koith/attendance-proto/actions/runs/39377499415) **14/14 PASS** (실제 만료 거부 포함): 신규 초대 실제 SMTP 수신/링크 클릭/실 Auth 세션·암호 설정/로그인, 실 signup·확인 메일, 검증 기존계정 invite HTTP 422(재초대 불가), recovery 메일/링크/새 비밀번호 로그인, sandbox 사용자 제거 후 구 링크 미통과·재초대, 위변조/만료 유사 링크 거부. 실제 만료 링크를 60초 유효기간/70초 대기 뒤 실서버 GET /verify에서 거부한 사실을 확인했으며, 단순 가짜 토큰 거부와 분리해 기록한다. 초대 해임은 운영 SQL 사전심사 RPC의 별도 테스트이며 로컬 Auth 사용자 삭제를 앱 보조관리자 권한 회수와 동일시하지 않음.
- **제한/잔여:** GoTrue self-host SMTP가 실제 프로토콜 동작함은 검증해도 **운영 호스팅 Supabase Auth 프로젝트의 SMTP 설정, 외부 네이버/Gmail 실제 수신·스팸함·실점주 로그인**과 동등하지 않다. 신규 테스트 시트의 직접 API 사용은 **운영 Edge→Apps Script→독립 실 Google Sheet 자동 동기화**가 아니며 QA-05 전체 완료 전까지 [ ] 유지. 국내 운영 초대메일의 원격 한글 템플릿 적용도 미검증. **QA-04, QA-05, AUTH-01, FIELD-01, MTG-04/Issue #1243 전체 [ ] 유지.** 앱 UI/서비스 소스 변경 없이 **v0.353 유지**, 정본 전체 38·완료 19·잔여 19. 테스트 파일은 운영과 연결되지 않은 증거로 보존. 신규 시나리오 실행 결과/PR 병합/운영 Pages run은 별도 #1243 댓글로 갱신.


## 42. 2026-10-20 #1243 운영 호스팅 Auth 읽기 및 승인형 QA Sheets 경로

- **사용자 원문 접수:** [#1243 댓글 6284684376](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6284684376). 운영 계정 생성·초대·권한/데이터 변경·삭제는 **사전 영향 범위와 별도 사용자 승인 필수**. 기존 v0.353/#1256/#1257 테스트 반복하지 않음.
- **운영 Supabase 실제 읽기 전용 결과:** 프로젝트 `waluhdgqhwjjwmflhrle` ACTIVE_HEALTHY, Edge `server-sync-sheet` ACTIVE; `auth.users` 전체 **4 / 이메일 확인 4 / 초대 이력 필드 1** (개인정보 미조회), public.admin_users HQ **3**, INHA 직원 **10**, 지점 **244**, INHA READY+active **1**·primary owner **0**·delegate grants **0**. `QA1243_숫자` 코드 + `[QA #1243]` 지점명 조건을 만족한 운영 QA 지점 **0** (초대·계정·지점 DML 일절 없음). 
- **Hosted Auth 설정 실증:** [#1258 PR](https://github.com/koith/attendance-proto/pull/1258)에서 `scripts/qa1243_readonly_auth_config.mjs`, `.github/workflows/qa1243-operational-readonly.yml` 추가. Auth Public `GET https://waluhdgqhwjjwmflhrle.supabase.co/auth/v1/settings`를 운영 앱에 이미 배포된 공개 anon 키로 호출, [#39379829936](https://github.com/koith/attendance-proto/actions/runs/39379829936) **HTTP 200 / email signup enabled true / signup disabled false** readback. 운영 Supabase Management API `GET /v1/projects/.../config/auth`은 GitHub Actions `SUPABASE_ACCESS_TOKEN` **없음** (CI 로그), 따라서 **실제 custom SMTP host/user/password/sender, 초대 메일 원격 제목·템플릿·OTP 설정은 미확인**. GH CI 성공이 관리 API 실제 읽기 성공이라는 뜻 아님. 연결된 메일함의 기존 검색만으로 운영 테스트 이메일의 실제 송수신을 증명할 수 없으므로 외부 수신 QA 미완료. 읽기 전용 작업에서 production DML/발송 0.
- **실제 코드 블로커 탐지:** 현재 운영 Edge의 `sync`/`parity`가 store_id!==1일 때 `STORE_SHEET_SYNC_NOT_CONFIGURED`로 차단. Apps Script에는 `_annualBook(storeKey,year)`의 연도별 파일 분리 로직이 있으나 기존 Edge의 지점 게이트 때문에 신규 지점에서 앱→Edge→GAS E2E 수행 불가.
- **안전한 QA 전용 경로 구현(현재 기본 비활성, 반드시 승인 후 설정):** `edge-release/supabase/functions/server-sync-sheet/index.ts` 와 `supabase/functions/server-sync-sheet/index.ts` **완전 동일**하게 수정. 신규 지점에서는 ① 명시 `QA1243_APPROVED_STORE_ID`와 정확히 일치, ② DB `stores.code='QA1243_<id>'` 및 `stores.name` 시작문자 `[QA #1243]`, ③ READY/active 상태, ④ `QA1243_SHEET_WEBAPP_URL`이 production `SHEET_WEBAPP_URL`과 다른 독립 `https://script.google.com/macros/s/.../exec`, ⑤ 길이 ≥64인 `QA1243_SHEET_SHARED_SECRET`이 production `SHEET_SHARED_SECRET`과 다른 별도 키, ⑥ 기존 HQ/매장 대표 인증/인가 통과가 모두 되어야 `sync`/`parity`가 허용. QA payload store_key는 `QA1243_<id>`로 고정해 실운영 `1`/INHA workbook과 분리, 운영 sync/cron/deployment는 계속 store_id=1만 기록. 운영 ID 1이 아니고 승인 전용 라우트가 없으면 Google으로 요청 보내기 전에 fail-closed. **새 테스트 Apps Script 프로젝트 및 승인 QA 지점/계정·설정 미생성 상태이므로 완전한 실제 End-to-end 성공 주장은 금지.**
- **QA 시나리오:** `qa1243_approved_sheet_route_guard.mjs`에서 flag 누락/타지점/지점 코드·명칭 불일치/운영 URL 재사용/운영 비밀키 재사용/짧은 QA 키/미인가 write 차단과 승인 QA 독립 URL+키 사용, 기본 store 1 유지 검증. 네트워크 write는 테스트 스텁이므로 **실 GSheets/Apps Script E2E로 간주하지 않음**. 최초 source mirror mismatch와 기존 5인자 호출 호환 회귀를 CI가 검출했고 byte-equality 복원 및 legacy 기본 storeId=1을 적용. 최종 CI/배포 성공 여부는 PR #1258의 실제 run을 근거로 판단한다.
- **필수 승인 및 접근 조건:** 운영 실계정/지점 대상 변경 전 승인 범위 확정(예: 신규 QA store 1개, QA owner/assistant 각 1개, 송신 받을 외부 시험 이메일 주소 2개, 검사 후 삭제/비활성화 여부). 안전한 QA 스크립트 전용 Google Apps Script 웹앱 URL/시크릿 신규 발급과 운영 Edge `QA1243_*` 환경 설정, **개별 QA 대상만** 연결. 운영 `SHEET_WEBAPP_URL`과 `SHEET_SHARED_SECRET`는 변경 금지. 실제 외부 수신함 클릭과 로그인 완료는 수신자 승인 후에만 검증 가능. 승인 전 전체 QA-04/QA-05/AUTH-01/FIELD-01 미완료 [ ] 보존.
- **업무원장 정본 체크:** 전체 38, [x] 19, [ ] 19 그대로. 앱 버전 **v0.353** (사용자 대면 UI 변경 없음). CI/PR/배포와 운영 데이터 불변 읽기확인 결과는 #1243에 별도 기록.


## 43. 2026-10-20 #1243 실제 독립 GAS 웹앱 실행 403 진단 및 재사용 QA

- **사용자 최신 개발 지시 원문:** [Issue #1243 접수 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6290594463). 앞서 완료한 #1258 Edge v65, #1262 Pages 배포, #1264의 GAS 신규 deployments.create API 수정은 중복 수행하지 않음.
- **읽기 전용 승인·격리 점검:** 운영 DB 보호 인수 HQ **3**, 인하 직원 **10**, 전체 지점 **244**, 인하 READY·active **1**, 인하 대표 **0** 유지. 운영 `stores.code='QA1243_<id>'` / 이름 `[QA #1243]` 조건에 맞는 실제 테스트 지점 **0건**. 운영 계정 생성/초대/권한 변경·지점 생성/삭제는 승인 전 실행 금지. 별개 Google 테스트 파일 [A](https://docs.google.com/spreadsheets/d/1iI8ywGtr7LqI24LUPhw31hBuuhi9DeGj8eaAg_L8ogI/edit), [B](https://docs.google.com/spreadsheets/d/1epgQd8IsFfkASAL-UjimJLdB-y8F9g7yENC3T4s-NHM/edit) native Sheets metadata에서 각각 다른 spreadsheetId와 독립 탭 확인; 운영 시트 id `1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024`(2026 근태/12개월)는 별도. 이 파일들의 **존재**는 Edge→GAS 연결 증거가 아님.
- **실제 Edge→신규 GAS 첫 실패:** [main CI #39416911916](https://github.com/koith/attendance-proto/actions/runs/39416911916)에서 Google Apps Script API 프로젝트 CREATE, 소스 PUT, version CREATE, 독립 웹앱 deployment CREATE/GET 성공(ANYONE_ANONYMOUS/USER_DEPLOYING). 이후 운영 Edge의 합성 OIDC mode `qa1243_sandbox_e2e`가 `502 SHEET_NON_JSON_RESPONSE` 반환. 실제 Sheets 값 읽기나 중복/수정 PASS 없음.
- **실행권한 사전 검사 추가:** [PR #1268](https://github.com/koith/attendance-proto/pull/1268) **51/51 CI PASS, main af98499abab75735aa61317118ff8388dc15d04d**. 새 전용 GAS `/exec`에 유효하지 않은 secret만 보내 `{ok:false,error:"UNAUTHORIZED"}` JSON 응답이 확인된 이후에만 실제 Sheet E2E 진행. 이전에 Google 웹앱 실행이 막히면 시트 쓰기 0. [실행 #39421278882](https://github.com/koith/attendance-proto/actions/runs/39421278882) **12회 HTTP 403, text/html, Google script.google.com**, 약 2분 내내 변함없어 배포 전파만으로 해결 못 함. 메타데이터상 공개 허용과 실제 익명 실행 허용은 별도임.
- **QA 프로젝트 재사용/최소 승인 절차:** [PR #1270](https://github.com/koith/attendance-proto/pull/1270) **51/51 CI PASS, main cba447be802512af090ec04007a99a507de79339**. Google Drive에서 소유권·제목이 확인된 [QA 전용 script editor](https://script.google.com/d/1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw/edit)의 기존 프로젝트를 사전 프로젝트 title/ID 확인 후 재사용. QA 전용 자동 등록 코드에만 무해한 `qa1243AuthorizeServices` 함수 주입(Drive/Sheets/Properties/Lock 읽기만; 운영 `apps_script.gs`나 실제 운영 Script 변경 없음). 연속 403 HTML 3회는 권한/공개정책 장애로 fail-closed.
- **후속 실서비스 검사:** [run #39422177360](https://github.com/koith/attendance-proto/actions/runs/39422177360) 기존 QA script project 재사용, 신규 코드/버전/익명 웹앱 배포 실제 성공. 그러나 웹앱 POST 3회 `403 text/html`, `QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403`로 종료. **운영 Edge 실제 신규 전송·GAS 내부 doPost·Sheets 최초 쓰기/재조회/정정/중복방지는 수행되지 않았으며 E2E 불합격.** 새 스크립트의 첫 실행 권한 또는 외부 공개 정책 문제는 추가 Google 설정 확인 필요. 외부 실서비스 Google 단독 403을 이유로 운영 DB에 테스트 계정이나 실제 지점 승인 없이 생성하지 않음.
- **실제 차단 시 필요한 최소 조치:** 전용 Script 소유자에 한해 위 QA script editor → 함수 `qa1243AuthorizeServices` → 실행 및 Google 권한 허용. 그 후 같은 main의 `QA1243 isolated live production Edge GAS Sheets E2E` Actions를 재실행해 wrong-secret probe에 HTTP JSON `UNAUTHORIZED`가 돌아오는지 확인. 그래도 403이면 Google 계정의 익명 앱 공개 제한/웹앱 보안 정책을 별도 점검. 기존 운영 `SHEET_WEBAPP_URL`, `SHEET_SHARED_SECRET`, `2026 근태`·계정의 값 변경 절대 금지. **실제 신규 운영 QA 지점/대표·보조 관리자 신설은 별도 영향 범위 및 사용자 승인 전 금지**. 호스팅 Supabase SMTP/실메일 수신은 계속 별도 검증.
- **증거 댓글:** [Issue #1243 댓글 6290841046](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6290841046). 앱 UI **v0.353** 유지(테스트 코드와 CI만 추가), 정본 총 **38 / 완료 19 / 미완료 19** (신규 [x] 0). QA-05 완전 E2E 미검증과 #1243 Open 유지. GitHub Pages 배포의 원래 운영 시트 자동 새로고침은 정상 운영 프로세스이므로 실제 스프레드시트 전 셀 불변을 검증한 것처럼 보고하지 않음.

- **2026-10-20 21:36 KST 독립 추가 안전성 코드:** [PR #1273](https://github.com/koith/attendance-proto/pull/1273) **51/51 CI PASS / main dc89ecc8ee84a4a371ec30e99b75d0d840e91889**. 기존 `apps_script.gs` 운영 소스에는 전혀 영향 없이, GAS에 배포할 **QA 전용 일회용 소스 복사본**의 `_annualBook` 생성/이름정리에서 `2026 근태` 단독 파일명을 금지하고 `QA1243 <storeKey> 2026 근태`로 강제. 이후 실제 Google Sheets metadata API에서 `spreadsheetId`와 정확한 QA 스토어별 타이틀 재조회가 성공하지 않으면 E2E PASS 금지. 합성 네트워크만 검증된 PR CI는 실제 Sheets 성공으로 간주하지 않는다. [메인 실검사 #39423498538](https://github.com/koith/attendance-proto/actions/runs/39423498538)는 독립 QA 프로젝트 업로드·배포 성공, 실행 전 읽기전용 wrong-secret POST **3회 HTTP403 HTML**로 강제 종료. 따라서 이번에도 **새 시트 실제 생성/쓰기/재조회 미실행**, 실자료 및 운영 시트 변경 없으며 QA-05·#1243 [ ] 유지. [#1243 상세 증거 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6291017218). 앱 버전 **v0.353**, 업무원장 **38 / 완료19 / 잔여19** 유지.


## 44. 2026-10-21 #1243 인계 이후 실제 Google 격리 E2E 지점 매핑 보호 보강

- **새 개발 대화 지시 원문 접수:** [Issue #1243 댓글](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6303307582). 최신 main 7fa50b3c9e7a3fe5fcf4a18ae67fc4309bc9c93f, Pages 배포 성공 #1278, v0.353, 운영 Edge v66 / 기존 운영 Apps Script v87. 이전 배포 #1258/#1260/#1262/#1273/#1238 등 **재개발·재배포 반복 금지**. 운영 읽기전용: HQ 3 / INHA 직원 10 / 지점 244 / QA1243 테스트지점 0. 오픈 별개 PR #999(관리자 단일 기기 인증) 유지.
- **실서비스 E2E 경계 확인:** 기존 단독 QA Google Apps Script ID `1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw` 소유/메타데이터 재조회. 전용 익명 `/exec`의 가장 최근 기록상 세 차례 연속 **HTTP403 HTML**; `ANYONE_ANONYMOUS` 메타데이터만으로 실제 인증·실행을 증명할 수 없음. 실행 사전 검사 미통과 상태에서 합성 급여 행을 운영 Edge로 전송하거나 운영 지점·시트 DML 수행하지 않음. 이 단계의 최소 외부 조치는 **전용 QA 스크립트 프로젝트 소유자의 `qa1243AuthorizeServices` 실행 및 Google Drive/Sheets/Properties 권한 동의**, 이후 test-only `/exec`에 잘못된 secret을 전달해 JSON `UNAUTHORIZED` 확인. 그래도 HTTP403이면 Google 웹앱 외부/익명 정책 점검. 추가 운영 QA 지점/관리자 계정은 별도 영향 범위 승인 필요.
- **독립적인 QA-05 코드 위험 발견:** 기존 QA 독립 GAS 소스 복사본은 신규 생성/이름 변경시 `QA1243 … 2026 근태` 표식을 강제하지만, 같은 Apps Script 소유권에 접근 가능한 Script Properties의 `ATTENDANCE_BOOK_QA1243_…_2026`가 잘못 운영 `2026 근태` 또는 다른 테스트 지점 파일을 가리키면 `_annualBook`이 이를 열고 QA 이름으로 **개명/덮어쓰기**할 위험. 운영 앱 `apps_script.gs`는 변경하지 않고 **QA 전용 변환기** `scripts/qa1243_build_isolated_gas.mjs`를 도입. QA mapped workbook 제목이 정확히 `QA1243 <storeKey> <year> 근태`가 아니면 `QA1243_MAPPED_WORKBOOK_FOREIGN` 오류로 이름 변경/탭/clear/write **전 차단**. QA 웹앱 `doPost` 역시 `QA1243_SBX_[A-Za-z0-9]{8,24}` 전용 키만 허용하여 INHA/1/타점 직접 쓰기 차단.
- **QA 증거:** [PR #1279](https://github.com/koith/attendance-proto/pull/1279)의 `qa1243_gas_foreign_workbook_guard.mjs`: 실제 GAS `_annualBook`/doPost 함수 코드를 VM으로 실행해 운영 파일 ID 매핑/다른 QA 파일 매핑 시 개명·월탭·쓰기가 0인지, 올바른 QA 매핑 재사용과 새 QA 파일 생성 정상인지, 허용되지 않은 지점 키는 lock/Drive 접근 전 거부하는지 확인. [QA1243 branch run #39509617447](https://github.com/koith/attendance-proto/actions/runs/39509617447) sandbox guard PASS. 실제 Google 호출이 아니라 VM fixture 검증이며 **QA-05 전체 E2E는 여전히 [ ]**.
- **변경 범위:** QA 전용 소스 생성기/신규 regression/기존 E2E 테스트 runner·contract·CI와 이 업무원장만 수정; **운영 `apps_script.gs`, `SHEET_WEBAPP_URL`, `SHEET_SHARED_SECRET`, 원본 운영 Sheet, Edge, DB 근태·직원·계정·레시피를 직접 변경하지 않음**. CI·병합·Pages 배포 증거는 #1243에 후속 추가. 원장 38개 중 [x]19/[ ]19 유지(이번 항목만으로 QA-05 완료 아님).


## 45. 2026-10-21 QA1243 Google 웹앱 403 GET/POST 독립 진단 보강 (QA-05 부분, #1281)

- 이전 원인 추적의 혼동을 방지: QA 전용 Google 프로젝트는 메타데이터상 배포 및 `ANYONE_ANONYMOUS`가 확인됐어도 [실제 /exec POST #39509865781](https://github.com/koith/attendance-proto/actions/runs/39509865781)은 3회 연속 HTTP403 HTML. 따라서 Edge→Apps Script→Sheets 실제 E2E는 미완료. Google 공식 Apps Script 배포 메타데이터와 프로젝트 소유자 실행 권한은 별개.
- [PR #1281](https://github.com/koith/attendance-proto/pull/1281) QA 복사본에만 읽기 전용 `doGet` 도달성 검사 추가, 실패했던 잘못된 secret POST 이후 **쓰기·OIDC 이전**에 GET 결과를 추가 조사: GET 정상이면 `QA1243_GAS_POST_ROUTE_OR_METHOD_403`, GET까지 차단되면 `QA1243_GAS_AUTH_OR_PUBLICATION_POLICY_403`. 어느 쪽도 실연동 성공으로 기록하지 않음. QA 보안 regression에서 GET 시 운영 파일·시크릿·잠금 접근 불가를 검증. 운영 `apps_script.gs` 및 기존 Edge 실제 동기화 로직 불변.
- [첫 번째 PR head 705683fd](https://github.com/koith/attendance-proto/commit/705683fde8f11505cc25d98a3b7a86feda6b2dea) 50/50 PR Actions SUCCESS (개발 코드/합성 QA). 최종 병합·main 실 POST/GET 판정 및 배포 증거는 Issue #1243에 후속 기록. 실제 프로젝트 소유자 `qa1243AuthorizeServices` 동의 전 운영 데이터 테스트 쓰기 금지.
- **완료/미완료 원장 원칙:** QA-05와 #1243는 미완료, [x] 변경 없음. 전체 38건 / 완료 19 / 잔여 19 유지.


## 46. 2026-10-21 MTG-06/QA-07 매출 대사 읽기 전용 UI 비정상 원천 보강

- **추가 코드 개발:** [PR #1282](https://github.com/koith/attendance-proto/pull/1282) `operations_reconciliation_v1.js`에서 서버 대사 응답이 배열이지만 항목이 null/배열인 경우 기존에는 화면 렌더 단계에서 예외가 발생할 수 있었다. 실제 UI 진입 경계에서 유효하지 않은 레코드를 `RECONCILIATION_INVALID_RESPONSE`로 거부하고 버튼 복원·오류 알림을 보장. POS/배달 후보에 동일 transaction pair가 반복돼 점주에게 중복 의심 건수로 과대 표시될 위험도 `SUSPECTS_DUPLICATE_PAIR` 오류로 차단. 원천 데이터 삭제·중복 자동 차감은 하지 않음.
- **추가 실행 테스트:** [변경 QA](https://github.com/koith/attendance-proto/blob/fix/mtg06-reconciliation-response-guard-20261021/qa_operations_reconciliation_store_race_v1.mjs) 실제 렌더 함수 VM 레인 9→12 시나리오: null 원천 오류 메시지+재시도 가능·중복 후보 fail-closed·정상 단일 후보 보존. PR CI/병합/운영 배포 판정은 Issue #1243 후속 댓글에서 별도 확인.
- **외부 연동 경계:** 실제 POS·배민·쿠팡이츠 원천 취소/중복/정산 자료는 아직 검증되지 않았으므로 **MTG-06 및 QA-07 체크박스 [ ] 유지**. 운영 거래·근태·급여·시트 쓰기 없음. 원장 총 38건/완료19/잔여19 그대로.


## 47. 2026-10-21 금요일(10/23) 신규 지점 개통 P0 한시 우선순위 및 FAIL-CLOSED 게이트

- **사용자 긴급 지시 접수:** [Issue #1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6304358661). 최종 목표 10/22(목) 업무 종료 전 사전 개발·실 E2E·배포 PASS, 10/23(금) 아침 **사용자 승인 이후** 실제 신규 지점/대표 계정 개통. 실제 지점명·대표 이메일은 금요일 이전에 요구·추정하지 않고 운영 DB/Auth에 대체 계정/지점을 임의 생성하지 않음.
- **한시 개통 P0 우선순위 9개:** QA-04, QA-05, QA-06, QA-07(신규 지점 진입·권한·직원·레시피·매출 기본 진입 레인), SEC-01(권한 해임 뒤 구세션 서버 거부 레인), AUTH-01, FIELD-01(실계정 확인은 금요일로 유보), MTG-03(신규 직원 급여 승인/원천 검산), MTG-04(실제 지점과 동일하다고 추측 금지, 개통 절차 레인). 장기 범위 [ ] 전체 완료와 사전 P0 부분 검증 완료를 혼동 금지.
- **한시 후순위 10개:** FIELD-02, FIELD-03, MTG-05, MTG-06, MTG-07, MTG-08, MTG-11, MTG-12, MTG-13, MTG-16. 단 신규 지점 개통 보안·데이터보호에 직접 연결되는 결함 발생 시 우선 처리한다.
- **이번 신규 개발:** [PR (금요일 준비 게이트)](https://github.com/koith/attendance-proto/pulls?q=is%3Apr+QA1243+Friday) `scripts/qa1243_friday_preflight.mjs` + 독립 실패 주입 시험 + `.github/workflows/qa1243-friday-readiness.yml`로 실제 main Workflow 최근 실행의 성공/실패·배포 SHA 경계를 엄격히 판정, JSON/MD 독립 감사 아티팩트를 남긴다. 운영 데이터 무쓰기. `QA1243_FRIDAY_OPENING_20261023.md`에 실행 순서, 최소 외부 승인, 실패 복구와 PASS/NO_GO 기준 고정.
- **이전 이어받은 실제 개발 배포 완료:** [PR #1281](https://github.com/koith/attendance-proto/pull/1281) 병합 `56d4752ff440d6cb0650630c015e09eb8ea39a87` (QA GAS 403 GET/POST 분리; 실 GAS 재검증 [#39516040734](https://github.com/koith/attendance-proto/actions/runs/39516040734)은 GET+POST 모두 403 HTML → FAIL), [PR #1282](https://github.com/koith/attendance-proto/pull/1282) 병합 `864383ceeefa5ec9596886804efeb77505180685` (MTG-06/QA-07 서버 대사 비정상행/중복 pair 방어, PR 50/50 CI), [P0 Pages #39516799837](https://github.com/koith/attendance-proto/actions/runs/39516799837) SUCCESS 및 지점 개통 전체 QA [#39516799795](https://github.com/koith/attendance-proto/actions/runs/39516799795) SUCCESS. **운영 v0.353 유지**.
- **본 대화 신규 운영 읽기 전용 보호 기준선:** Supabase HQ3, INHA 직원10, 지점244, QA1243 운영 테스트 지점0, 대표 연결0, 보조 연결0, 급여 스냅샷0; attendance/franchise-ops ACTIVE_HEALTHY. 시트 전체 셀 바이트 불변은 확인되지 않아 **그렇게 주장하지 않음**.
- **미확인·외부 차단:** Hosted Google QA script 실제 /exec GET+POST HTTP403, 운영 Hosted Auth SMTP 테스트 수신·실제 관리자 계정 세션 회수·본사 데이터 사후 무변경 전체 증명 불충분. 운영 계정·지점 작업 승인 미부여. 개통 사전 **NO_GO** 유지하며 최종 PASS는 외부 실증 완료 후만. 정본 **전체 38건/완료19/잔여19** 유지.


## 48. 2026-10-21 #1243 Google 403 다중 경로 대체 진단 — 운영 무쓰기(부분 작업)

- 이전 [PR #1281](https://github.com/koith/attendance-proto/pull/1281) GET/POST 403 동시 확인 결과를 기반으로, [PR #1287](https://github.com/koith/attendance-proto/pull/1287)에서 **Google Apps Script API `scripts.run` 소유자 전용 읽기 전용 권한 probe**를 추가. 운영 `appsscript.json` 및 `apps_script.gs`는 변경하지 않으며 **기존 QA 전용 script의 복사 배포 manifest**에 한해서 `executionApi.access = MYSELF`를 설정해 다른 익명 클라이언트에 API 실행을 개방하지 않음.
- 실제 익명 /exec POST 403 HTML 3회 + 읽기 전용 GET 403 HTML 발생 후, 이미 연결된 Google OAuth로 오직 `qa1243AuthorizeServices`(Drive/Sheets/Properties 존재 여부 읽기, 쓰기 없음)를 `scripts.run` 단 한 번 호출. 결과는 HTTP 상태/안전한 오류 유형만 기록. 성공한 것처럼 오인하지 않기 위해 **잘못된 secret POST가 JSON `UNAUTHORIZED`를 반환할 때만** 기존 Edge→QA GAS→QA Sheets 경로 진행 가능.
- Google 공식 문서상 API 실행은 **공통 표준 Cloud 프로젝트·전체 스크립트 scope를 가진 OAuth**가 필요하며, `scripts.run` 403도 기능 불가능 증거가 아니라 별도 경로 제한을 뜻한다. 실제 자동 승인/웹앱 403 해소는 trusted main E2E 실행 전 **UNVERIFIED**.
- PR QA 성공과 운영 HTTP 성공을 구분. 사전 금요일 개통 게이트는 `NO_GO`이고 **QA-05 [ ]** 및 38/19/19 유지. 운영 데이터 무단 변경 금지.

## 49. 2026-10-21 — 금요일 P0 Hosted Auth 설정 미검증을 PASS로 오판하는 경계 수정

- 사용자 2026-10-21 P0 계속 실행 지시: Issue #1243 comment #6304726553.
- 과거 QA1243 Hosted Auth 설정 읽기 전용 워크플로가 운영 Management API 인증 없이도 public auth/settings 응답만 읽고 성공 종료할 수 있어 HOSTED_AUTH_READ 게이트가 거짓 PASS 되는 결함 수정.
- 운영 Hosted 한국어 초대 HTML/제목, 이메일 기능, SMTP 호스트/발신인 모두 실제 읽기 검증되었을 때만 PASS. 검증 불가/불일치/누락은 반드시 exit 1 및 NO_GO. Gmail 실 수신과 관리자 live 세션은 여전히 별도 차단 항목.
- 금요일 P0 게이트 workflow_run 트리거에 Hosted Auth 점검 완료 추가. 정상/미설정/6종 개별 부정 및 null 회귀 테스트 추가.
- 운영 Auth 설정 변경, SMTP 송신, 실제 운영 계정/지점/시트 쓰기 전혀 없음. 38개 중 19개 완료, 19개 잔여 유지. 테스트·배포 링크는 Issue #1243에 후속 기록.

## 50. 2026-10-21 — QA 전용 GAS scripts.run 표준 GCP 프로젝트 전제조건과 403 재호출 정리

- Google 공식 문서에 따른 `scripts.run` 조건(같은 **표준 Google Cloud 프로젝트**, 충분한 전 스크립트 OAuth scopes, API 실행 배포, Apps Script API 활성화)을 단순 API 진단 403과 구분.
- 사전 프로젝트 연결 여부를 실제 소유자가 확인하기 전에는 실패했던 owner-only `scripts.run` 호출을 반복하지 않는다. OAuth 클라이언트 앞 프로젝트 번호와 명시한 QA-only Apps Script 표준 프로젝트 번호가 일치할 때만 진단을 허용하며, 이것도 성공 증거가 아닌 접근조건 검사.
- 기존 QA-only 프로젝트에서 이미 재현된 GET/POST 403 HTML에는 불필요한 동일 POST 3회를 중복하지 않고 GET 1회+사전 조건 확인 후 NO_GO. 잘못된 시크릿 JSON UNAUTHORIZED 확인 이전에는 Edge/Sheets 쓰기 금지 유지.
- 회귀 단위 테스트 및 업무 #1243, P0 38/19/19 유지. 운영 Sheet/Apps Script/시크릿 미변경.

## 51. 2026-10-21 — QA1243 QA 전용 Google 계정 소유·OAuth 최소권한·운영 쓰기 차단 후속 (PR #1296)

- **원문 사용자 지시:** [Issue #1243 신규 접수](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6307713192). QA Google 계정은 `webuielf@gmail.com`; 실제 운영 시트 접근 시 '액세스 권한 필요' 확인. 기존 운영 Google 계정의 OAuth 승인은 계속 보류하며 운영 `2026 근태`·운영 Apps Script는 변경 금지.
- **기존 방식 폐기:** 과거 QA Script `1VkwzA0EKQAf9VQ9BECOcOLkikhIuHR7EtKt6mZkq6B8_Q9HH4w6lQmrw`가 **운영 계정 소유**임을 Google Drive 파일 메타데이터로 확인. §48/§50의 해당 스크립트 owner-only `scripts.run` 승인은 **새 절차에서 사용하지 않음**. 이 스크립트 ID의 재사용/운영 OAuth Secret 재사용은 fail-closed.
- **이번 신규 소스(초기 PR #1296):** QA-only OAuth 환경변수, `userinfo` 실제 소유자 이메일, tokeninfo 정확한 CI 최소 권한 목록, 운영 workbook/옛 Script 접근 거부(403/404), 신규 Script/신규 Sheets 실제 `owners.emailAddress` 비교. QA Apps Script는 명시적 `spreadsheets` 및 `script.storage`로 제한하고 `DriveApp`/`UrlFetchApp`/legacy active workbook 도입·파일 이동/이름 변경·시트 삭제/Execution API 제거. 실제 Google `projects.getContent` HEAD와 versionNumber 읽기·manifest scope 비교·배포 version ID 검증.
- **운영 시트 안전한 main 통합 조건:** `.github/workflows/p0-pages-deploy.yml`의 main 모든 push에 운영 Sheet 실제 쓰기 단계가 있으므로, 지정 QA-only 코드 변경과 특수 커밋 마커 `[QA1243-NO-OPERATING-WRITE]`가 일치하는 push에서만 기존 Pages build/deploy/Sheet refresh·독립 배포 성공 알림을 skip하도록 가드 추가. 미허용 파일이 섞이면 P0 게이트 FAIL; 마커 없이 병합하면 **운영 재동기화 위험**. 원본 Apps Script/Sheet·인하대 급여 셀은 이 PR 작업 범위에 없음.
- **정확한 사용자 화면 작업:** [QA 전용 계정 설정/권한/Secret 절차](QA1243_QA_GOOGLE_BOOTSTRAP.md), [금요일 개통 게이트](QA1243_FRIDAY_OPENING_20261023.md) 갱신. QA 계정 OAuth client / 새 Script ID / GitHub QA Secret는 외부 사용자 인증이 필요한 단계이며 이 대화에서 임의 인증·생성·승인을 하지 않음.
- **운영 읽기 전용 재점검:** 244 stores, HQ 3, INHA employees 10, store primary owners 0, assistant memberships 0, QA1243 store candidates 0. Google Drive 메타데이터상 기존 운영 Sheet의 ID·파일명·소유자 유지; 전체 cell hash의 불변은 별도 별칭 없으므로 증명하지 않는다.
- **완료 경계:** GitHub PR 정적/VM 회귀 PASS를 Google 호스팅 활성 스크립트 배포 PASS로 확대 금지. 실제 QA 계정 자격증명·소유자·Scope 검증 후 배포, 잘못된 secret JSON `UNAUTHORIZED`, 403 해소, Edge→독립 GAS→QA Sheet A/B 읽기/정정/멱등성은 **미실행/미검증**이면 `QA-05 [ ]`, 금요일 전체 `NO_GO`. 전체 38건/완료19/잔여19 유지.

## 52. 2026-10-21 — QA Script ID 수동 복사·변수 등록 제거 및 자동 재사용 (#1243)

- **사용자 추가 지시:** [Issue #1243 접수 #6308845159](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6308845159). 사용자가 QA 전용 `webuielf@gmail.com`, Cloud `qa1243-isolated`, QA 계정 소유 신규 Apps Script `QA1243 isolated Edge GAS 2026-10-21 QA-only`를 준비했다고 보고. 운영 계정에서 QA 리소스를 만들지 말 것.
- **도구로 증명한 경계:** 현재 연결 Google Drive는 `dokodemoitsho@gmail.com` 소유. 현재 계정 검색에서 QA 스크립트가 나타나지 않는 것은 QA 계정 리소스의 부재 증거가 아니므로 운영 연결로 생성하거나 변경하지 않음. GitHub 연결 도구는 repo 파일/PR/Actions 읽기와 일부 실행 재시도를 지원하나 Actions Secret/Variable 생성/수정 API는 노출하지 않아 자동 등록했다고 주장할 수 없음.
- **코드:** OAuth userinfo에서 QA 이메일을 검증하고 운영 파일 Drive 접근 거부를 확인한 뒤, QA 전용 Drive API metadata-only 검색으로 정확한 이름/소유자/유일한 Apps Script를 찾아 자동 재사용. `QA1243_GAS_SCRIPT_ID` 변수는 선택이며, 미설정 시 새 스크립트를 임의 생성하지 않음. 없거나 중복·잘못된 소유자·형식·페이지 탐색 오류는 소스 쓰기 전에 fail-closed. 기존 QA Script 소스·manifest Google API 등록과 QA Sheets 생성/검증은 QA 인증 수립 후 기존 GitHub trusted push QA 워크플로에서 자동 진행.
- **회귀:** 실 소유자·이름·MIME·중복·빈 목록·삭제 표시·불충분 소유자 메타데이터 테스트를 `qa1243_gas_foreign_workbook_guard.mjs`에 추가. QA-only Pages/운영 Google Sheet write 안전 마커 `[QA1243-NO-OPERATING-WRITE]` 유지.
- **인증 및 E2E는 미완료:** QA 소유 OAuth client와 승인된 refresh token, GitHub repository secrets 3개는 아직 외부 승인 단계이며 현재의 운영 연결로 대신할 수 없음. GitHub Secrets 직접 관리 connector 미노출. Edge OIDC는 `push`만 허용하므로 `workflow_dispatch`로 우회하지 않고 기존 main push QA workflow의 failed jobs만 다시 실행. `QA-05 [ ]`, 금요일 `NO_GO`, 정본 총 38 / 완료 19 / 잔여 19 유지.

## 53. 2026-10-21 — QA Google OAuth Desktop+PKCE 일회성 등록 도우미 (#1243)

- **지시 접수:** [Issue #1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6309077511). PR #1297 자동 Script ID 탐색을 재구현하지 않고, OAuth Secret 3건 수동 입력을 없애고 실제 최소권한·Desktop OAuth 경로를 검증.
- **Runner 최소권한 고정:** `userinfo.email`, `script.projects`, `script.deployments`, `drive.metadata.readonly`, `spreadsheets.readonly` 정확히 5개를 공용 모듈 `scripts/qa1243_oauth_scopes.mjs`에서 강제. **CI에서 Drive/Sheets 쓰기·삭제 scope 없음**. 독립 QA Apps Script runtime의 `spreadsheets`+ `script.storage`는 신규 QA Sheet 생성·수정에 필수이므로 별도 격리/소유자 검증을 유지.
- **도우미:** `QA1243_OAuth_Start.cmd`, `scripts/qa1243_oauth_bootstrap.mjs`; Google Cloud QA Desktop client JSON 파일을 사용자 PC에서 읽고, 127.0.0.1 PKCE+state 콜백·offline prompt=consent·email_verified `webuielf@gmail.com`·정확히 5 scope·refresh grant 재검증. GitHub CLI Admin 권한 확인 후 `gh secret set -f -`로 **프로세스 표준입력만** 사용해 Secret 3건 암호화 등록. Refresh Token/Client Secret은 PR/로그/채팅/임시 파일/프로세스 인수에 기록하지 않음.
- **자동 재실행:** 최신 main SHA에 일치하는 기존 failed `push` QA run에 한해 `gh run rerun --failed`; production Edge OIDC는 `workflow_dispatch` 허용하지 않으므로 별도 release/운영 Sheet 작성 없이 기존 trusted QA 경로만 사용.
- **Google 공식 확인:** Desktop+loopback+PKCE 지원, External/Testing 사용자에 QA 이메일 필요, 일반 이메일 이외 scopes 발급 refresh token 기본 7일 만료. Cloud Desktop client 생성/JSON 다운로드·최초 동의 및 QA GAS 자체 runtime 동의는 Google 소유자/관리자 인증을 요하는 단계이므로 connector로 우회하지 않음.
- **회귀 및 운영 안전:** `scripts/qa1243_oauth_bootstrap.test.mjs` 부정 테스트(운영 Cloud JSON·웹 클라이언트·과도 scope·다중 파일·잘못된 리디렉션·토큰 로그/임시 저장 탐지) 및 PR QA runner 단계 추가. 운영 Pages/운영 Sheet writer 보호 allowlist에 이 QA-only 파일만 추가, 보호 마커 `[QA1243-NO-OPERATING-WRITE]` 유지.
- **완료 아님:** 사용자의 로컬 QA OAuth 승인 전 실제 자격증명 발급/Secret 저장/Google-hosted script 업로드/QA Sheets E2E를 성공했다고 주장하지 않음. 증거는 Issue #1243 후속 로그에 기록. **QA-05 [ ], Friday NO_GO, 38/19/19**.

## 54. 2026-10-21 — QA1243 iPhone Safari 단기 OAuth 보조 인증(기존 Windows 경로 보존)

- **사용자 지시 원문:** [Issue #1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6316995575). iPhone Safari만 사용, PR #1298~1299의 Windows OAuth 도우미와 QA 자동화 경로 보존, 운영 Google 원본/기존 운영 DB 무쓰기, Friday NO_GO.
- **공식 경로 검토:** Google TV/Device Authorization은 `script.projects`/`script.deployments` OAuth scope 미지원. Desktop OAuth 127.0.0.1 callback은 모바일 Safari로 실행 불가. Confidential Web OAuth code flow는 서버 측 Google client secret 및 GitHub Secrets write 권한이 필요한데 현재 QA 구성에는 설정/승인이 없어 공개 브라우저에 내장 금지.
- **채택한 안전한 범위:** 별도 `supabase/functions/qa1243-mobile-auth/index.ts` **GET-only 정적 HTML**에서 Google GIS token popup으로 QA `webuielf@gmail.com`만 로그인·동의. 기존 Runner의 5개 정확한 scope를 검사. 단기 토큰은 브라우저 메모리에만 보유, Safari 클립보드로 **1회 복사**, GitHub 공식 Actions Secrets 화면에서 사용자가 직접 `QA1243_GOOGLE_OAUTH_ACCESS_TOKEN`으로 등록. 공개 사이트 자체는 GitHub 관리자 credential/PAT/Google Client Secret/Google 토큰을 수집하거나 저장·전달하지 않음. 다른 URL query/POST 및 XSS 동작은 차단.
- **Runner 연동:** trusted main push E2E는 Desktop OAuth 3종이 있을 때 기존 refresh grant를 우선 사용하고, 없을 때 QA 전용 단기 Access Token Secret을 사용. OAuth tokeninfo 검사는 토큰을 URL query에 넣지 않고 POST body로 변경, 최소 30분 잔여시간 및 Google QA 소유권/정확한 권한 검사. Windows 코드, 운영 Google/Apps Script/Sheets 보존.
- **보안 제한:** 단기 access token은 암호학적으로 한 번만 쓸 수 있는 credential이 아니므로 브라우저 페이지 자체 10분/1회 복사만 제한. 진정한 GitHub Secrets 자동 쓰기는 GitHub 권한이 필요하므로 공개 사이트에서 관리자 PAT을 요구하는 대신 **GitHub 공식 UI 등록 1단계는 유지**. Safari 실기기 팝업 및 실제 Google 계정 사용자 승인 미완료 시 **모바일 전체 동작 PASS 불가**.
- **검증:** PR의 모바일 Google/GitHub 부정 검증 테스트 및 QA-only Pages/운영 Sheet 배포 스킵 가드 테스트. 운영 DB DML/마이그레이션 없음. 실제 Google-hosted QA Script 업로드·Edge→GAS→Sheet A/B 실증은 별도로 누락을 명시한다. QA-05 [ ], Friday NO_GO, 정본 총 38/완료19/잔여19 유지.

## 55. 2026-10-22 — QA1243 금요일 신규 지점 사전 회귀 보강과 공유키 위험 확인

- 사용자 금요일 개통 전 실제 완료·실사용 대기 분리 요청: [Issue #1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6341565403).
- **전진한 실외부 증거:** [QA Google E2E #39781031886](https://github.com/koith/attendance-proto/actions/runs/39781031886) SUCCESS. QA 전용 Apps Script·Google Sheets A/B 원격 쓰기·재조회·정정·중복 방지·지점 격리가 실제 통과했음을 운영 Hosted Auth 실메일 검증과 혼동하지 않는다.
- **남은 금요일 게이트:** [#39782981047](https://github.com/koith/attendance-proto/actions/runs/39782981047) **5/8 NO_GO**: `HOSTED_AUTH_READ`, `PAGES_PUBLISH`, `INDEPENDENT_PAGES`. QA-only Google 코드 커밋은 운영 Pages 배포를 의도적으로 건너뛰므로 일반 Pages/시트 새 성공으로 오인하지 않는다. 외부 실제 테스트 초대 이메일·관리자 실세션·사전/사후 원본 불변 증거도 미확보.
- **기존 코드 범위 보존:** 격리 GoTrue/Mailpit 실제 테스트 이메일/비밀번호·재초대·회복·만료, 일회용 PostgreSQL의 대표/보조 권한·READY·직원/급여·레시피 및 Chromium 연속 UI QA는 기존 성공 증거와 구분; 임의 중복 생성·운영 실제 직원 초대/수정 금지.
- **이번 새 QA 회귀 코드:** `qa1243_live_edge_gas_contract.mjs`의 QA-only trusted E2E 선행 검사에 실제 지점별 근태 경로, 대타 출근 후보·지점 제한, 테스트/운영 대타 분리, 월 경계 급여 중복방지 등 **6개의 별도 실제 앱/엔진 소스 검사** 추가. `scripts/qa1243_live_edge_gas_sheets.mjs` Google·Edge 원격 오류 자유본문 로그 노출 제거: HTTP 상태 및 제한된 상태 enum만 출력해 screenshot 공유 비밀키 2차 노출 방어. 운영 Apps Script/Sheet/Edge Secret 변경 없음. 사용자 금요일 실계정/실이메일 입력 전까지 권한/메일/급여/레시피 쓰기 없음.
- **스크린샷 위험:** 코드상 `SHARED_SECRET` 값은 노출 가능하므로 사고 전제로 판단. 기존 운영 키와 동일·활성 여부를 증명하지 못한 상태에서 단일 키 일방 교체는 운영 시트 동기화 중단 위험. [금요일 대응 문서](QA1243_FRIDAY_OPENING_20261023.md)에 owner 확인 → dual-key → Edge 새 키 전환 → 기존 키 폐기, 무중단/승인/운영 불변 필요조건 기록. 현재 운영 키 **교체 미실시/승인·식별 검증 대기**.
- **업무원장 판정:** QA-05는 실제 Google E2E와 통합 QA 성과를 연결하되 원래 ID의 안전 정리/실운영 시트 권한까지 모든 종료 조건이 증명되기 전 전체 완료 체크 [ ] 유지. QA-04/QA-06/QA-07/SEC-01/AUTH-01/MTG-03/04/FIELD-01 각 소스 QA와 실제 Hosted 실증을 따로 표기. **전체 38개 / 완료 19 / 잔여 19**, 신규 완료 ID 0건. 운영 개통 **NO_GO**.

## 56. 2026-10-22 심야 — Google QA E2E 실증 재확인 + 금요일 신규 지점 대표 READY 필수조건 보안 보강

- **사용자 접수:** [Issue #1243 신규 지시](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6342552788). PR #1305–1308 OAuth/Google 작업 재실행 금지, 이미 성공한 실제 E2E 증거 연결, 대표 초대/수락/로그인·보조 권한·신규 지점 개통 집중.
- **재조회한 Google 실제 PASS:** [GitHub trusted push #39781031886 attempt 2](https://github.com/koith/attendance-proto/actions/runs/39781031886), main `50690f26e31b5ef9ae9bce830fcdd17bd4dd6551`; QA email `webuielf@gmail.com` 인증, CI 최소 범위, 운영 workbook/기존 스크립트 HTTP404, 독립 QA 소유 Script 기존 재사용·원격 source+manifest/배포 version=2 readback, 잘못된 키 `UNAUTHORIZED` HTTP200, 실제 production Edge JWT→GAS→QA Sheets A/B 생성·소유자 검증·재조회·중복방지·정정·A/B 격리·부적절한 지점/URL 거부까지 `QA1243_E2E_REAL_COMPLETE` 확인. 단 운영 Auth/실점주 메일/세션 테스트를 수행한 증거는 아님. 이 성공 항목을 과거 '403 미완료'로 재기록 금지.
- **현재 SHA에서 새 Google QA FAIL은 별개:** [#39786180198](https://github.com/koith/attendance-proto/actions/runs/39786180198)는 단기 모바일 Access Token의 만료 전 잔여시간 부족 `QA1243_MOBILE_TOKEN_EXPIRY_TOO_SHORT`; 이미 달성한 과거 실 E2E 유효성 자체를 부정하지 않지만 최신 게이트의 `LIVE_EDGE_GAS_SHEETS`를 자동 PASS로 허위 표시하지 않는다. 최신 [금요일 #39786329443](https://github.com/koith/attendance-proto/actions/runs/39786329443) 4/8 NO_GO: HOSTED_AUTH_READ, LIVE_EDGE_GAS_SHEETS, PAGES_PUBLISH, INDEPENDENT_PAGES. 실SMTP 수신/점주 LIVE 로그인/운영 전후 증빙도 별도 미확보.
- **운영 PostgreSQL 실제 RPC 결함 발견(읽기 전용):** `hq_store_onboarding_set`은 Verified provenance + sample count 0 + **인증된 일반 관리자 1명 이상**만 확인하고, `store_primary_owners`에 실제 대표가 지정됐는지는 요구하지 않았다. 따라서 대표 초대 미수락 + 인증된 다른 관리자 1명 상태에서 신규 지점 READY 가능성이 있었다. `hq_stores_onboarding_list.manager_count`는 일반 STORE_MANAGER 전체를 세므로 본사 UI의 READY 버튼 및 전국 CSV도 같은 거짓 적격 판정을 보였다.
- **신규 보강:** `supabase/migrations/20261022225500_qa1243_confirmed_primary_owner_ready.sql`에서 READY(인하대점 ID1 예외)에 **동일 지점 `store_primary_owners` 소속 대표의 실제 인증 이메일·설정된 암호·계정 활성/미삭제·미차단·비익명**까지 DB에서 재검증. 관리자/HQ/Provenance/샘플 직원 기존 보호 유지. 정상 대표 없이 보조만 있으면 `CONFIRMED_PRIMARY_OWNER_REQUIRED`로 차단. 함수 DDL만 교체하며 기존 지점 row CRUD 없음.
- **UI/CSV:** `hq_store_onboarding_ui.js` 개통 버튼/확인 재검사와 `readinessCsv`를 대표 연결 정보 기준으로 일치, '인증관리자수'와 '대표지정기록'을 별도 표시하여 일반 보조 관리자 존재만으로 개통 가능 오판 방지. 정확한 최종 대표 Auth 확인은 DB가 수행. 브라우저 앱 `v0.354`로 버전 표시 및 자산 캐시키 변경.
- **실제 합성 QA:** `qa_hq_store_onboarding_postgres_integration.sql` disposable PostgreSQL에서 출처 미확인, 데모 직원, 인증 불가 관리자, 대표 미지정, 대표 비밀번호 없음, 대표 차단+보조 인증, 다른 지점 대표만 지정, 정상 2지점 READY/중지/280지점 격리 확인. CSV VM/본사 UI 보안 QA 추가, PR/CI 및 운영 DDL 적용 결과는 Issue 후속 댓글에 증거 연결.
- **기존 Google/Sheets 운영 금지:** 버전 Pages 릴리스는 `[QA1243-NO-OPERATING-WRITE]`+`[QA1243-APP-PAGES]` 이중 마커, 변경 파일 whitelist와 HTML 정확한 3줄 버전·스크립트 변경 검사, 별도 Pages publish/readback 및 독립 원격 asset checksum을 사용해 **운영 Google Sheet 자동동기화 단계를 호출하지 않는다**. 운영 실매장/인원/Payroll/Sheet 관련 값과 Google Secret 원문 변경하지 않음.
- **마감 구분:** 새 DB/화면 결함 QA 및 배포 증거를 얻은 후에만 해당 세부 작업 완료로 기록. Hosted 실점주 초대/SMTP 설정/실세션/실데이터 전후 증빙은 승인/계정 확보 전까지 계속 `검증대기`. 전체 38건/기존 완료 19건/잔여 19건 원칙 유지, QA-05의 Google 실E2E 부분통과와 전체 QA-05 종료조건을 혼동하지 않음. 금요일 개통 **NO_GO**.


## 57. 2026-10-23 P0 실증 재집계 — PR #1310 이후 (기능 완료 체크 엄격 유지)

- **병합·배포 기초 증거:** #1310 MERGED `66cb74612baf47950ba2cc391a9cf019c32b95f6`; #1311 safe Pages retry MERGED, main `c6787aca4dae721524465161d155fc29d746639a`. 운영 앱 **v0.354**. Pages 실 게시 [#39814103615](https://github.com/koith/attendance-proto/actions/runs/39814103615) 실제 배포 단계 성공, `QA1243_SAFE_PAGES_V354_DEPLOYED`; 독립 읽기 [#39816437359](https://github.com/koith/attendance-proto/actions/runs/39816437359) `QA1243_SAFE_PAGES_V354_INDEPENDENT_PASS`. 운영 공개 index SHA256 `43c94b17ac420c4c7d5b9892af8abf14b1de81d7dfb4a0ae42dbab650d8e97ee` / owner UI JS SHA256 `283c17ddac26d9d5fc7b47468a9b4515fb6c458b6b8ceb989a2f82095a7e6b32`. 운영 Google Sheet 기록 없이 코드-HTTP 파일 동일성 확인. 구버전 캐시 실사용자 세션에 대한 현장 확인은 아직 별개.
- **DB 실제 적용 확인:** 운영 Supabase `supabase_migrations.schema_migrations`에는 `20261022161851 qa1243_confirmed_primary_owner_ready`가 있으며, 실제 `pg_get_functiondef(public.hq_store_onboarding_set)`에서 본사 권한, 출처 `VERIFIED`, 샘플 직원 차단, 대표 소속 `store_primary_owners`·동일 지점 `STORE_MANAGER`·인증 이메일·설정 비밀번호·차단/삭제 제외를 직접 확인. `CONFIRMED_PRIMARY_OWNER_REQUIRED` 에러로 보조만 있는 READY를 차단한다. DDL 적용을 PR 병합과 혼동하지 않음. 운영 행 CRUD 수행하지 않음.
- **통합 QA:** [전체 지점 개통 #39849819228](https://github.com/koith/attendance-proto/actions/runs/39849819228) 실 앱 코드/Chromium 모바일·데스크톱 및 **격리 PostgreSQL**, 직원·급여·시트·레시피 QA job 모두 SUCCESS. 과거 실 격리 GoTrue/Mailpit 14/14 PASS는 여전히 운영 Hosted Auth 메일 수신 증거가 아님. 실제 QA Google Edge→GAS→Sheets [#39781031886](https://github.com/koith/attendance-proto/actions/runs/39781031886) PASS는 재활용하고 단기 OAuth 토큰 만료로 인한 최신 재실패와 구분. Edge `server-sync-sheet` v66 ACTIVE. 실운영 Auth 세션·테스트 수신, 운영 데이터 전/후 전수 감사는 미실증.
- **자동 금요일 게이트의 검증 로직 결함 보완 진행:** 구 게이트 [#39816468437](https://github.com/koith/attendance-proto/actions/runs/39816468437)는 최신 실 게시가 `p0-pages-deploy`의 *안전한 별도 게시 job*에 있었고 독립 작업이 `qa1243-owner-ready-pages-independent.yml`이었다는 사실을 반영하지 못해 `PAGES_PUBLISH`/`INDEPENDENT_PAGES`를 과거 FAIL로 잘못 집계. 이번 전용 작업은 **게시 job 실제 성공 단계 + 독립 공개 HTTP job 성공 + 현재 main 파일과 운영 HTML·JS SHA256 일치**의 3중 검증인 경우에만 두 증거를 PASS로 화해시키며, Hosted Auth/실메일/Google 최신 토큰을 임의 PASS로 바꾸지 않는다. 미승인 실지점 개통은 여전히 NO_GO.
- **업무원장 구분 (중복 없는 38개):** [x] 완료 **19건**은 기존 엄격한 완료 기준 그대로. [ ] 남은 **19건** = 아래 *추가 개발/통합 QA 필요 13건*, *실인원·운영 연동·외부 증빙 검증 대기 6건*. 하위 작업 일부가 통과해도 해당 ID의 **전체 종료 조건**까지 입증하지 못했으면 미리 [x]로 바꾸지 않는다.
  - **개발·통합 QA 미완료 13개:** `QA-05`(Google E2E는 실증됐으나 전체 안전정리·장애 재시도 등 남음), `QA-06`, `QA-07`, `SEC-01`(WIP PR #999), `MTG-03`, `MTG-05`, `MTG-06`, `MTG-07`, `MTG-08`, `MTG-11`, `MTG-12`, `MTG-13`, `MTG-16`. 이 중 공급사 원격 장바구니/거래 실제 연결 및 매출 대사는 신규 지점 개통 최소 E2E와 구분하여 P1/P2 후속.
  - **외부·실인원 검증 대기 6개:** `QA-04`(격리 Auth 완료, 운영 Hosted SMTP 실수신/실세션 미확인), `AUTH-01`(실 SMTP 브랜드 템플릿 실수신 미확인), `FIELD-01`(실대표/보조), `FIELD-02`(실급여), `FIELD-03`(실재고/매출/공급사), `MTG-04`(특정 실제 지점·실대표 승인 및 개통). 실제 승인 없어서 개발 완료 기능을 재구현하지 않는다.
- **보존/승인:** 기존 운영 지점 244개·HQ 3명·인하대 직원 10명·실 레시피·기존 운영 Google Sheet·운영 Auth 초대 유지. 운영 인원·점주를 임의 초대하거나 운영 지점 상태를 변경하지 않는다.
- **GO/NO_GO = NO_GO**: live Hosted Auth 테스트 메일 도달·수락/비밀번호/로그인 및 관리자 해임 기존 세션 권한 회수, 승인된 신규 실지점·대표 identity, 매장별 최종 원본 전/후 대조 증거가 없어 실제 개통 실행 금지. 단 **v0.354의 Pages/DB 대표 강제 차단 코드는 운영 적용 및 독립 검증됨**. 오류나 새 미실증을 역사적으로 통과한 QA를 취소하는 근거로 삼지 않는다.


## 58. 2026-10-23 — QA1243 신규지점 통합검증 실행 누락 방지 (CI-only, 운영 무쓰기)

- **발견한 실제 검증 누락:** `.github/workflows/store-opening-full-journey.yml`의 PR/main 경로 필터에서 일부 핵심 `qa_*.mjs`·`qa_*.sql`을 열거하지 않아, 대표/보조/해임/재초대 SQL 또는 근태/급여/시트/레시피 QA를 단독 수정하는 PR에서는 전체 통합검증이 자동으로 재실행되지 않을 수 있었다.
- **실제 소스 변경:** PR 예정 `fix/qa1243-journey-ci-trigger-integrity-20261023`에서 PR/main 양쪽에 root `qa_*.mjs`, `qa_*.sql` 필터를 추가. 따라서 비슷한 누락이 다시 발생하더라도 전체 합성 정책·브라우저·격리 PostgreSQL 3개 레인을 실행한다. 코드 수정=실사용 이메일 수신/실점주 로그인/실Sheets 결과가 아님.
- **운영 쓰기 안전성:** 특별 표시 `[QA1243-NO-OPERATING-WRITE]`를 달고 변경할 `p0-pages-deploy.yml`의 허용 파일 가드를 좁게 확장하였다. 업무 화면·운영 SQL 함수·Apps Script·Sheet/Edge는 건드리지 않는다. CI 전용 push는 일반 Pages 게시와 운영 시트 쓰기 작업이 모두 SKIPPED여야 하며, 이를 `qa1243_pages_no_operating_write_guard.mjs`로 실제 Actions 가드 실행형 회귀검증한다. 검증되지 않은 배포 성공으로 집계하지 않는다.
- **이미 검증된 기준 재사용:** PR #1310 병합 SHA `66cb74612baf47950ba2cc391a9cf019c32b95f6`, v0.354 독립 Pages 배포 #39814103615 / 읽기 검증 #39816437359, 운영 마이그레이션 `20261022161851`, Edge v66 ACTIVE. 완료된 OAuth/실Sheets #39781031886 및 격리 GoTrue/Mailpit #39377974348 재구축하지 않는다.
- **금요일 GO 판정은 별개:** Hosted 실제 메일/수락/비밀번호/로그인과 지점 단위 대표-보조 실권한, 현재 유효한 QA 토큰 Edge→GAS→Sheets, 실점주·지점 승인 및 운영 불변성 전후 증빙 미확보 시 `NO_GO`. 기존 원장 38 / 완료19 / 개발·통합 QA 13 / 외부·실인원 검증대기 6. 위 회귀가 성공하기 전 신규 완료 체크 0건.


## 59. 2026-10-23 — 실제 격리 Auth JWT와 지점 권한 RPC 연속 검증 (#1243)

- **재실행하지 않는 완료 근거:** 앱 v0.354, #1310 SQL/Pages 독립 검증 및 Google 실 E2E #39781031886, #1313 최신 격리 통합 QA를 유지. 운영 Google OAuth·Sheet·메일·DB 쓰기 없음.
- **확인한 검증 공백:** 기존 GoTrue/Mailpit SMTP 검증과 DB 권한 fixture가 분리되어 실제 로그인에서 발급한 JWT의 대표 수락·READY·보조 권한 변경·해임·재연결을 하나의 서버 경로로 증명하지 못했다.
- **추가 구현:** `qa_auth_role_journey_1243.sql`은 GoTrue가 설치한 실제 auth.users를 그대로 사용하고, checked-in 대표/보조/기본거부/세부권한/재연결/READY migrations를 격리 DB에 설치한다. 새 워크플로에서 실제 Mailpit 수신→GoTrue 비밀번호 설정·로그인→동일 DB의 JWT 검증 PostgREST→대표 수락/본사 READY, 보조 직원·근태·급여 권한의 즉시 변경/해임을 연속 호출한다. 해임 토큰이 Auth /user에는 유효하지만 RPC 접근은 거부되는지 구분하고, 재연결 시 이전 권한이 살아나지 않는지 검증한다.
- **운영 보호:** 모든 HTTP 대상은 코드에 고정한 127.0.0.1이며 psql 대상 DB/host/port를 강제. 로컬 합성 HQ3·보호 직원10·다른 지점 직원·급여 행 전체 JSON의 사전/사후 동일성을 확인한다. 이것은 운영 원본 불변의 실측 증거가 아니다. 별도 workflow는 운영 Secret·Google API·Pages 게시를 호출하지 않으며, QA-only main 마커의 allowlist에 정확한 새 파일만 추가했다.
- **실제 검증 완료(격리 서버 범위):** [PR #1314](https://github.com/koith/attendance-proto/pull/1314), 테스트 소스 SHA `46bc7f85078f6c9f360f2bf4a8b6bf78f659a102`, [실제 Auth JWT 연속 E2E #39888114566](https://github.com/koith/attendance-proto/actions/runs/39888114566) **8/8 PASS**, job `120201010509`의 GoTrue 기동·실제 migrations 설치·JWT 검증 PostgREST·시나리오 실행·아티팩트·컨테이너 정리 모두 SUCCESS. 해당 SHA **63개 CI check 완료, 실패 0건**. `auth-role-journey-1243` 아티팩트 ID `12473029198`, SHA256 `72470e31e791040e1aeaba173401826323231147ed6ae90596ca419c3b9fcf0f`. 최초 준비 오류(GoTrue 기존 auth.jwt와 CREATE 충돌)를 CREATE OR REPLACE로 수정한 뒤 재실행 성공. 운영 무쓰기 가드에 신규 workflow 포함/앱 혼입 거부 실행형 회귀 및 Node 구문 검사 PASS. 직원·근태·급여 엔진→Sheet 페이로드·TEST 제외·지점 격리 소스 통합 검사 PASS. 기존 Google 실제 성공을 재실행하지 않음. Hosted 실메일 성공으로 확대하지 않는다.
- **운영 읽기 전용 확인:** 이번 세션 `BEGIN READ ONLY` 집계: 지점244/READY1/STAGED243/HQ3/인하대 직원10/대표0/관리자 membership0으로 이전 기준과 동일. 전체 셀/원본 행의 전후 hash를 확인한 것으로 주장하지 않는다. 앱 **v0.354 유지**, PR은 검증 코드·CI·원장만 변경하며 운영 배포·DDL 적용 없음.
- **남은 외부 작업:** Hosted SMTP 실수신·브랜드 템플릿·실대표/보조 계정 인증·실지점 승인과 운영 전후 감사. 실제 점주 정보/승인 전 운영 초대나 STAGED→READY 전환을 하지 않는다. **NO_GO 유지**, 전체 38/완료19/잔여19(개발·통합 QA13, 외부·실인원6), 신규 완료 체크 0.


## 60. 2026-10-23 — #1314 병합 승인 후 Google 성공 재실행 금지 보호

- 사용자 후속 지시: #1314 필수 체크/무쓰기 확인→병합→main QA, QA-05/06/07·MTG-03/05/06/07/08/11/12/13/16 실제 잔여 개발·QA·PR·병합·필요 배포. 기존 Google OAuth/E2E 및 v0.354 재배포 반복 금지. #1243 원문 접수.
- 병합 전 #1314 head ee517f21 **67 check 완료(60 SUCCESS/7 SKIPPED/0 FAIL)** 확인. main 57e52009, mergeable=true. 운영 읽기 전용 지점244/HQ3/인하대 직원10/READY1 확인.
- **추가 발견/수정:** Google live E2E가 p0 무쓰기 가드 변경만으로도 main에서 OAuth·GAS·Sheet 검증을 반복하는 트리거였다. Auth-only 병합에는 `[QA1243-NO-GOOGLE-RERUN]`+무쓰기 마커와 정확한 파일 allowlist/실제 diff 검증을 동시에 통과할 때만 기존 Google 성공 증거를 재사용한다. Edge/GAS/Google runner/앱 파일 혼입·알 수 없는 경로·삭제/rename·불명확한 diff는 실패. 일반 Google 코드 변경은 실E2E 경로 유지. Actions 실제 스크립트 VM 실패 주입 PASS.
- 기존 Pages/운영 Sheet skip 마커 유지. 이 CI 변경에는 운영 앱 버전 상승이나 배포·DB DML 없음. 병합 SHA/main 검증/잔여 개발 증거는 후속 갱신.


## 61. 2026-10-23 — #1314 main 검증과 MTG-05/06/08/12 실제 원장 보호 결함 수정

- **#1314 병합 완료:** squash main `8a6e9760b208e9b56d11de0f707e6a0e785ef817`; 최종 PR head `7dced43e` 68 check 완료/실패0. main 실제 Auth/SMTP/JWT/PostgREST [#39890295884](https://github.com/koith/attendance-proto/actions/runs/39890295884) SUCCESS. [P0 main #39890295883](https://github.com/koith/attendance-proto/actions/runs/39890295883) 게이트 SUCCESS, 표준/QA Pages build·publish·same-run 검증 SKIPPED. [Google workflow #39890296034](https://github.com/koith/attendance-proto/actions/runs/39890296034) scope/static PASS, OAuth/Edge attestation/실GAS·Sheets 단계 SKIPPED로 기존 성공 #39781031886 재실행 안 함. 앱 v0.354 유지. 전체 main 개통 QA #39890296010은 완료 상태 후 후속 증거 추가.
- **MTG-12 실제 결함:** 운영 `admin_store_inventory_overview_v3`가 미입력 단가를 COALESCE(...,0)으로 평가해 부분/전부 미확인 원가를 확정 0원처럼 반환. 동일 가격 자료 없는 출고도 일부 재고평가에서 누락되고 미래 입고도 현재 잔고에 포함됐다. 기존 API/권한/인하대 store_id NULL 호환을 유지한 함수-only migration으로 단가·수량이 유효하고 비음수인 평가액만 반환, 미확인/부분단가/비정상수량/음수자산은 NULL, 미래 이동 제외. 명시적 실제 단가0·수량0은 보존. 운영 가격이나 수량을 임의 채우지 않음.
- **MTG-05/06/08 실제 결함:** 같은 CSV 안의 중복 원천키가 마지막 행으로 덮어써지고 긴 키는 180자 잘림으로 서로 다른 영수증/매입 원본이 충돌할 수 있었다. 중복/긴 키를 행번호 포함 오류로 원자적 거부하고, 기존 정상 재업로드·수정 및 지점/원천/파일 경계 유지. 이 기능은 공급사 인증·POS 1/2번 단말 실제 의미를 추정하지 않음.
- **실행 검증:** 새 SQL fixture 2개가 실제 임베디드 PostgreSQL에서 PASS. 원래 재고 함수에 같은 테스트를 적용해 `UNKNOWN_PRICE_IS_NOT_ZERO` 실패를 검출하는 변이 증거 확보. PG16 CI에 2개 fixture 편입, 기존 및 신규 운영 무쓰기/Google 성공 재사용 guard 실행형 회귀 PASS. 운영에는 아직 함수 교체하지 않았으며 PR/CI/병합 후 명시적 함수 배포와 원본 hash 대조 예정.
- **완료 기준:** 두 결함 수정은 MTG-05/06/08/12의 전체 실제 원천 연결·재료비 계산 완료와 다르다. 체크박스 선변경 없음. 실제 외부 자동수집/공급사 원격 장바구니/실재료비·판매량 소스에 아직 개발이 필요한 부분은 현장 검증으로 숨기지 않는다. 전체38/완료19/잔여19 유지.


## 62. 2026-10-23 — MTG-12 사용 재료비 실제 서버 계산·v0.355 안전 대시보드 개발

- **#1315 병합/운영 반영 완료:** 최종 PR 69 check 완료/실패0, main `d0acd6eebd02274dff9b9791b2363656613251c9`. 운영 migrations `qa1243_inventory_valuation_fail_closed`, `qa1243_import_source_conflict_guard` 함수-only 적용 SUCCESS. 운영 pg_get_functiondef에서 NULL가격/중복키 차단 확인, anon 함수 EXECUTE=false. 배포 전후 stores244/admin_users3/employees10/attendance236/payroll_snapshot0/inventory_movements5/operations_transactions3323/raw0/store_recipe_overrides0/recipe_source_variants245의 전체 행 digest **10/10 동일**. 운영 실인원·근태·급여·재고·매출·레시피 행 불변이며 Google Sheet writer 호출 없음. 특정 DB 테이블 검증을 Google Sheet 전체 셀 hash 검증으로 확대하지 않음.
- **새 기능:** `admin_store_material_cost_report` read-only RPC와 기존 지점 대시보드 summary 연결. 선택 기간 직전/말일의 POSTED 실사, 모든 실재료의 확정 수량, 원장 수량과의 일치 및 양수/명시적0 단가 근거를 모두 충족할 때 `기초평가+입고-반품-기말평가=원장 사용원가`를 검산하고 기록된 폐기/서비스 원가를 별도로 반환. 기간미종료·실사초안·누락가격·평가불일치·알 수 없는 조정 이동은 NULL 유지. 구매 거래 총액/VAT/정산액과 혼동하지 않음. 이동원장 단가 기준·전체 합계 원 단위 반올림을 화면에 명시.
- **실행 QA:** 실제 PostgreSQL에서 기초1000+입고600-반품100-기말1000=사용500(폐기100/서비스100 포함) 독립 기대값 PASS. 타점·시연·기간 밖 이동 제외, 미가격·수량불일치·DRAFT·미래기간·익명 차단 검증. 실제 UI 계산 guard의 확정500/확정0 및 잘못된 출처/빈값/음수/소수/무한값 거부 PASS. 기존 미산출 동작은 자료가 없을 때 유지.
- **새 배포 계획:** 앱 v0.355(신규 작업 묶음). index는 버전2줄+operations_v1 캐시1줄만 변경. 기존 v0.354/OAuth/Google E2E를 재배포·재실행하지 않으며, 새 Pages 게시도 표준 Google Sheet 동기화 job과 분리. 정확한3줄 HTML diff·지정변경만 허용, 독립 HTTP index/JS checksum과 owner/근태/HQ/recipe 파일 불변성 검사 추가. 안전 가드 정상/혼입/무마커 실패 주입 PASS. PR/CI/운영 RPC 설치/신규 Pages 공개 검증은 후속 기록 전까지 완료로 표시하지 않음.
- **범위:** 실제 원가 자료를 대신 생성하거나 소급 입력하지 않는다. 실제 창고 단가·실사·매출 수량/원천 연결 및 현장 검토는 별도. MTG-12의 자동 계산 코드 공백을 메우되 원래 전체 완료기준을 선체크하지 않음. 총38/완료19/잔여19 유지.


## 63. 2026-10-23 — QA-05 실패 복구·QA-06 동일 실행 실제 Auth 증거 연결

- **QA-05 새 실행 증거:** 배포된 `googleWrite/claim/finish/writeClaimed` 함수 본문을 그대로 VM 실행. 잠금 충돌→실패 ACK→같은 보고 재시도 성공, 비JSON→복구, 원격 resize/readback 미확인 성공 금지, 오래된 완료 token 거부, 미변경 보고 중복 쓰기 없음, 강제 중복 잠금 거부, 승인되지 않은 지점의 운영 Sheet/비밀키 fallback 차단 **7/7 PASS**. 실제 Google/OAuth/Sheets 호출 0. 이미 성공한 #39781031886을 반복하지 않고 미검증 장애 레인을 보강.
- **QA-06 새 연결:** 기존 28개 소스/엔진 행렬과 별개였던 실제 GoTrue/Mailpit/PostgREST 8/8 결과를 같은 CI run/SHA의 artifact로 필수 소비. reusable Auth workflow→다운로드→엄격 parser→ADMIN-SESSION 서버 권한 회수 행으로 연결. SHA·scope·8개 이름/개수/중복·실패·Hosted 성공 과장·Google 재실행 표기가 맞지 않으면 FAIL. 누락 증거도 required CI에서 실패. 실제 계정 인증·공식 주소·실근태/급여 승인 등 현장 GAP를 자동 PASS로 바꾸지 않음.
- **검증:** parser 실패주입 및 writer VM 7/7, 무쓰기 가드 PASS. QA-only 변경으로 앱 v0.355 기능과 별개이며 추가 Pages 게시·운영 데이터·GAS/Google 쓰기 없음. PR/CI/main 증거는 후속 추가. QA-04/QA-05/QA-06 원래 전체 완료 체크는 단계별 실증과 구분.
- **외부 연결 조사:** 저장소의 원천 어댑터는 실제 POS/공급사 필드·인증 계약을 아직 확정하지 않은 상태이며 operationsCollectRequest는 connector_configured=false를 반환한다. 연결 Drive의 백억커피 자료에서 공급사 공식 API/테스트 연결 명세를 확인하지 못했다. 사용자에게 공식 계약/테스트 계정 준비 여부만 비동기로 확인 중(비밀번호/토큰 요구 없음). 외부 연동 미개발을 현장 확인으로 위장하지 않음.

## 64. 2026-10-23 — 온리원푸드넷 공식 연동 조사와 기존 계정 사용 범위

- **사용자 답변:** 인하대점 실제 사용 계정은 있으나 결제 가능한 안전 테스트 계정은 없음. 해당 계정으로 장바구니까지 허용, 주문 확정·결제는 범위 밖. 공식 API 계약은 없고 연동 가능성 조사 요청. 실제 계정의 기존 장바구니는 보존하며 임의 품목 추가·수량 변경으로 실제 주문을 방해하지 않음.
- **공식 확인:** CJ프레시웨이 공식 사이트가 고객 주문 플랫폼의 PC `https://onlyonefoodnetfo.ifresh.co.kr/` 및 모바일 `https://onlyonefoodnetmo.ifresh.co.kr/`를 연결. 두 사이트는 내용 조회 시 login_required. 현재 연결 브라우저의 signed_in_sites가 비어 있어 안전한 직접 로그인 창 준비 여부를 사용자에게 질문; 비밀번호·토큰은 채팅이나 저장소에 요구/저장하지 않음. 로그인 뒤 계정/지점·기존 장바구니 읽기 확인, 다운로드/대량 업로드/약관/지원 연동 경로를 확인해야 함.
- **연동 가능성의 실제 근거:** [공식 보도 2024-11-15](https://www.cjfreshway.com/newsroom/pr/view.do?seq=3432)는 오케이포스와 업무협약 이후 식자재 주문 시스템 연동 및 오늘얼마 주문 페이지를 명시. [공식 보도 2026-01-27](https://www.cjfreshway.com/newsroom/pr/view.do?seq=3529)는 프레시엔의 AI 장바구니와 오늘얼마·바로고 외부 연동을 명시. 따라서 계약을 통한 외부 연동 사례는 존재하지만 **프레시엔/파트너 기능을 온리원푸드넷 계정용 공개 API나 백억커피의 사용 권한으로 간주하지 않음**.
- **공개 API 결론:** 공식 데이터 솔루션 페이지/최신 2025 ESG 보고서/온리원 공식 검색에서 주문·장바구니 공개 API 명세·인증·테스트 환경을 확인하지 못함. API가 없다고 단정하지도 않음. 2023 ESG p27의 API 언급은 CRM/잠재고객 연계이며 주문 API 근거가 아님. [공식 문의 경로](https://www.cjfreshway.com/contact/index.jsp#faq)로 사업자별 온리원 주문조회/거래명세 다운로드, 장바구니 임시저장/외부연동, sandbox·인증 범위·중복방지 지원을 확인할 수 있음. 문의는 발송하지 않음.
- **운영 경계:** 조사 중 공급사 로그인·원격 장바구니·주문·결제·기존 Google Sheets 쓰기 0. MTG-08/11/16의 실제 외부 자동수집·원격 장바구니 어댑터는 공식 명세/인증을 확보한 뒤 개발·검증할 잔여이며 단순 현장 확인으로 바꾸지 않음.

## 65. 2026-10-23 — 신규 원가 기능 최종 병합과 통합 QA 진전

- #1314 main 전체 개통 QA #39890296010 SUCCESS. #1315 main #39891332684(전체 개통), #39891332748(실제 Auth), #39891332693(P0), #39891332689(Google scope/static만) 모두 SUCCESS. OAuth/Google E2E 및 v0.354 Pages 재실행 없음.
- #1316 최종 head fcdaff0e2f61f28881faa4b78c141e296ed0a6b2 **97개 체크 완료/실패0**, main squash `19409fd333541be8d9386742b138e13380235091`. Chromium 설치의 무조건 apt 의존을 실제 실행 probe와 필요시 제한시간 설치로 고쳐 geometry 검증을 생략하지 않음. v0.355 원가 기능 배포는 P0 게시/독립 HTTP 결과로 별도 확인.
- 신규 원가 RPC 운영 함수 설치 SUCCESS, summary 연결/익명 EXECUTE 차단 확인. 배포 직전/직후 위 10개 운영 테이블 row digest **10/10 동일**. 코드·DB QA와 실제 매장 원천 가격/실사 검증은 구분.
- #1317 선행 브랜치 QA-06 #39894872684 SUCCESS: 같은 실행 실제 Auth/SMTP/PostgREST 8/8 artifact를 소비한 **29/29 PASS, 실제 자료 GAP6, overall PARTIAL**. 전체 개통 #39894872650 및 P0 #39894872729 SUCCESS. 최신 main 위 재배치 후 다시 필수 검증하여 병합.
- 원장 총38/완료19/잔여19 유지. 이번 개발은 12개 우선 항목의 부분 기능·결함 수정 증거이며 외부 어댑터/실인원 인증을 전부 완료했다고 표시하지 않음.

- **v0.355 실제 공개 검증 완료:** [main P0 #39896134378](https://github.com/koith/attendance-proto/actions/runs/39896134378) 게이트 및 QA1243 전용 Pages 게시 SUCCESS, 표준 Pages/운영 Sheet 동기화 경로 SKIPPED. before/after owner_activation·actual_attendance·HQ·recipe 6개 자산 hash 불변. [독립 HTTP #39896251990](https://github.com/koith/attendance-proto/actions/runs/39896251990) SUCCESS, 공개 index SHA256 `65b2fd97d20b24489b621b897fbbc9c5d5a5f1cd0c7326f118ed647042e45078`, operations JS `164493241fcfe3766c8eaead30f82c3b2b423050c4150e89d6383e5a55a3e30d` main 바이트 일치. 실제 v0.355 신규 게시이며 v0.354 반복 게시 아님. 로컬 별도 HTTP 시도는 네트워크 ECONNREFUSED였고 위 두 실제 CI readback으로 확인.
- #1316 main [전체 개통 #39896134247](https://github.com/koith/attendance-proto/actions/runs/39896134247)·[실제 Auth #39896133940](https://github.com/koith/attendance-proto/actions/runs/39896133940) SUCCESS. [Google #39896134025](https://github.com/koith/attendance-proto/actions/runs/39896134025) scope/static SUCCESS, 실제 Edge 대기·GAS/Sheets 단계 및 모바일 실HTTP SKIPPED. 기존 Google 성공 증거를 반복하지 않음.

| 우선 항목 | 이번까지 실행·개발 증거 | 남은 실제 조건 |
|---|---|---|
| QA-05 | 기존 실 Google 성공 재사용 + writer 실패복구7/7 | 실제 장애/권한·안전정리 전체 종료 증거; 성공 E2E 반복 안 함 |
| QA-06 | 실제 Auth artifact 연결29/29, 명시 GAP6 | 공식 주소·실지각/조퇴/재입사·점주 사유·실월마감 |
| QA-07 | 실제 앱 연속 브라우저 + 격리 PG, CSV 충돌·가격 경계 추가 | 공급사/POS 실제 연결 및 승인된 현장 시나리오 |
| MTG-03 | 승인/반려/재승인·야간/휴게/월경계 독립 산식 PASS | 실제 점주 정책·사유·월별 확정 금액 |
| MTG-05 | 원천키 중복/180자 충돌 원자적 거부 | 실제 POS 단말1/2 의미·원천·인증 |
| MTG-06 | 기존 대사 후보/환불 경계 + 중복키 보호 | 실제 POS·배민·쿠팡이츠 취소/정산 원천 |
| MTG-07 | EXACT/행사/1L 단위 SKU 격리 QA PASS | 실제 승인 판매명/수량 검산 |
| MTG-08 | 매입 import 지점 격리/중복 방어 + 공식 연동 조사 | 공식 파일/API 필드·인증 확보 후 실제 어댑터 개발 |
| MTG-11 | 명시 선택 내부 발주 handoff QA PASS | 계정 직접 로그인·공식 지원 확인 후 원격 장바구니 어댑터 개발/재조회 |
| MTG-12 | v0.355 실제 원가 RPC·대시보드·가격/폐기/반품/시간 QA·배포 | 실제 단가/실사 및 원가 기준 수용 검증 |
| MTG-13 | 지점 레시피 override·수량/단위·허용오차 산식 QA PASS | 실제 판매수량·관측/폐기 원천 연결 개발/현장 검산 |
| MTG-16 | 공유POS/PIN 실사 초안·승인/모바일 검색 QA PASS | 공급사/POS 자동수집 개발 및 실직원 현장 UX |

- 외부 API/원천이 필요한 어댑터 개발은 단순 현장 검증으로 전환하지 않음. 안전한 계정 인증 전 실제 지점 READY/사용자 초대 발송·운영 결제/원천 입력을 수행하지 않음. 실점주 정보·공식 인증과 승인 후 진행할 실제 개통 절차는 QA-04/AUTH-01/FIELD-01로 추적.

## 66. 2026-10-23 — #1317 main 최종 QA·원본 보존 검증과 개통 게이트 실제 결함 수정

- 사용자 후속 원문은 [#1243 접수](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6357001116). #1316/#1317 및 v0.355/Google 성공을 반복하지 않고 최종 main 검증 후 잔여 개발 계속 지시.
- **#1317 병합/최종 main:** PR 최종 head ef24297179e20789788ef4cf58589845436dae12 **70개 체크 완료/실패0**, squash `cbd98e062c4db04746a291025ca7e91e366135de`. [전체 개통 #39896729154](https://github.com/koith/attendance-proto/actions/runs/39896729154) 소스·실제 브라우저·격리PG·실패보고 job 모두 SUCCESS. [실제 Auth #39896729116](https://github.com/koith/attendance-proto/actions/runs/39896729116) 및 [QA-06 #39896729157](https://github.com/koith/attendance-proto/actions/runs/39896729157) SUCCESS. [P0 #39896729012](https://github.com/koith/attendance-proto/actions/runs/39896729012) gate SUCCESS, 모든 Pages/Sheet 게시 job SKIPPED. Google #39896729146 scope/static만 SUCCESS, 실제 OAuth/Edge/GAS/Sheets 단계 SKIPPED.
- **원본 데이터 보존 최종 읽기 검증:** 지점244/HQ3/직원10/급여snapshot0/재고이동5/거래3323/raw0/지점레시피override0/원본variant245의 전체 행 hash는 초기와 동일. 근태는 검증 중 236→238건으로 증가했으나 기존236건(id≤5578) hash `60a45419247811b866d09ae303353cbd`가 초기와 정확히 동일해 원본 변경/삭제 없음. 새2건은 03:58:12·03:58:35 UTC 이후 추가됐으며 이 작업에서 근태 DML/되돌리기 없음. 자연 증가를 무변경 실패나 복구 대상으로 취급하지 않음. 기존 Google Sheets writer 호출 없음; 전체 셀 hash 검증으로 과장하지 않음.
- **QA-05/07 개통 게이트 실제 오류 수정:** scope/static만 성공하고 실Google을 SKIP한 최신 workflow가 실E2E 성공으로 분류될 수 있던 허점을 차단. 실제 Edge attestation·사전 contract·GAS/Sheets 실행 단계의 SUCCESS, 최근성·main·조상 SHA·실행 관련 소스 diff를 검증해 기존 실제 성공 #39781031886을 재사용. 그 이후 runner의 실패 로그 비밀정보 제거만 검토된 정확한 proof SHA/runner blob 조합으로 허용하고 다른 원천 변경·실패·삭제·rename·불완전 diff는 거부. Google/OAuth/Sheets 재실행 없음. 실제 GitHub MCP 조회 snapshot을 새 판정기에 입력해 해당 기존 실증으로 PASS를 산출한 근거 보존.
- **QA-06/07 미완료 판정 갱신:** 기존 readiness workflow는 전체 개통 QA가 아직 실행 중일 때 STORE_E2E=FAIL을 기록한 후 완료 시 다시 평가하지 않았다. 전체 개통 완료 event를 구독해 최종 상태로 재평가. v0.355 Pages 증거는 index/HQ뿐 아니라 실제 원가 JS hash도 필수로 확인. Hosted Auth·실수신·실사용자·개통 승인 미확인은 계속 NO_GO이며 녹색 CI로 대신하지 않음.
- **검증 지연 실제 수정:** 전체 개통/모바일 재고 CI가 무조건 Chromium system apt 설치를 수행하며 장시간 대기. npm/브라우저 다운로드/필요시 의존성 설치 각각 제한시간, 실제 Chromium launch probe 후 필요한 경우만 system repair, 최종 실제 launch 실패 시 FAIL. 모든 기존 브라우저 시나리오는 보존. 새 PR/최종CI/병합/main 증거는 #1243에 연결.
- 앱 **v0.355 유지**, 이번 변경은 QA 판정/설치 경로라 Pages·운영 DB·Sheet 배포 없음. 총38/완료19/잔여19, 개통 **NO_GO**. 실원천·공식 API/인증 없이 외부 어댑터를 완료로 위장하지 않음. 담당자 직접 로그인과 공식 연동 경로 확인이 필요한 온리원 원격 장바구니/매입 수집은 §64/65에서 계속 추적.

## 67. 2026-10-23 — Fetch 조회 경로와 Google 증거 재사용 차단 원인 분리·실제 수정

- 사용자 후속 원문 [#1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6357836077): #1316~1318/v0.355/전체 QA·Google 성공 재실행 금지, Fetch 실패 원인·증거 연결만 해결하고 실제 잔여 개발 지속.
- **최종 확인된 기존 상태:** #1318 squash `a022cc7b66de5cc47572c5f09533c7504fa28c94`, PR68체크/실패0. main 전체 개통 #39898681159 SUCCESS, P0 #39898681141 SUCCESS·Pages/Sheet 게시 SKIPPED. v0.355 배포·독립 공개 검증은 §65의 기존 성공을 재사용. 새 전체 QA/Google/OAuth/Pages 실행 없음.
- **Fetch 원인 구분:** GitHub connector는 `actions/workflows/.../runs`를 허용하지 않아 HTTP400 INVALID_ARGUMENT. 지원되는 compare/commit/run/job/log/contents 경로로 조상 main10개·Google main11개를 조회해 대체. 별도 로컬 프록시 연결 실패/추가 네트워크 권한 대기는 증거 조회 수단으로 더 사용하지 않음. CI 내 GitHub REST workflow 조회 자체의 실패와 혼동하지 않음.
- **실제 게이트 차단:** `LATEST_REAL_GOOGLE_EXECUTION_NOT_SUCCESS`, run #39875746583/job120160799749. 실제 로그는 00:03:47 UTC `REMOTE_HTTP_401 for www.googleapis.com /oauth2/v3`의 MOBILE_EPHEMERAL 사용자 확인 실패. 이전3회 #39868066368/#39814103770/#39812916300 역시401, #39786180198은 MOBILE_TOKEN_EXPIRY_TOO_SHORT. 5회 모두 runner의 scope 확인/원격Script·Sheets 접근 전 종료이며 실제 GAS/Sheets 회귀 실패가 아님. 각 실행 원본 blob `c516cde85456f0438e84794e0d4213651e1668e4`를 독립 확인.
- **실제 수정:** 실패 job의 완전한 로그·정확한 오류·사전 성공 단계·검토된 runner 원본을 모두 확인할 때만 인증 사전검사 실패로 분리. scope/Script/Sheets 단계 이후 실패·다른 runner·불완전 로그·임의 오류·새 실제 회귀는 계속 FAIL. 기존 실제 성공 #39781031886의 실행/attestation/contract·최근성·main 조상·원천 diff 검증을 유지하여 archived E2E PASS와 future_rerun_auth=REAUTH_REQUIRED_NOT_REQUESTED를 함께 기록. 테스트 계정 재인증을 실제 운영 Google 장애로 오인하지 않으며, 신선한 Google 인증이 되었다고 주장하지 않음.
- **실제 증거 검증:** GitHub MCP로 조회한 11개 실행/실제 job/log/원본/compare snapshot을 수정된 판정기에 실행해 run #39781031886 PASS, 인증사전실패5회 별도 보존, Google 재실행=false 확인. 새 Google/OAuth/Edge/GAS/Sheets 요청0. 단순 합성 fixture로 실제 성공을 만들지 않음.
- **표적 QA:** OAuth401/짧은 수명과 실제 후속 실패 구분, 불완전로그/변경원본/다중오류/실행단계 진입 차단, 서명 로그 redirect 검증 및 저장소에 GitHub Authorization 미전달, 실제 P0 evidence-only guard의 앱/운영GAS 혼입 거부 PASS. 판정 로그에 항목별 실제 실패 이유·재사용 성공 run을 추가. 증거 reader 변경을 위해 전체 개통 fixture를 수정/재실행하지 않도록 정확한 QA-only scope 허용.
- **경계:** 앱 v0.355 유지, 전체38/완료19/잔여19. Hosted Auth/SMTP 설정 읽기·실제 초대 수신·실점주 세션/개통 승인·현장 원천 검산은 별도 미확인으로 개통 NO_GO 유지. 외부 POS/매입/장바구니 어댑터와 실제 판매수량/레시피 원천 연결은 공식 명세·안전한 직접 로그인/원천 접근이 필요한 개발 잔여이며 완료/현장검증만으로 바꾸지 않음. PR/최종 CI/병합/main 증거 판정은 #1243 후속 기록으로 연결.

## 68. 2026-10-23 — 신규 지점 개통 필수와 후속 자동화 분리·Hosted 최소 읽기 권한 준비

- 사용자 원문 [#1243 접수](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6358796799): v0.355/#1319 완료 재실행 금지. Hosted Auth/SMTP 차단 원인·필요 최소 권한·기존 안전 인증정보 활용, 승인 전 초대 준비/QA, 개통 필수와 후속 자동화 분리. 운영 데이터 변경 금지.
- **현재 차단 재확인:** 기존 실패 감사 #39520668442의 조회 전용 job만 attempt2로 재시도. 2026-10-23 15:23 KST job120274230919에서 MANAGEMENT_API_CREDENTIAL_ABSENT·configReadable=false·공개settings HTTP200 재확인. SMTP 장애/미설정이 확인된 것은 아님. 현재 환경에 관리토큰/secret binding 없음, 연결 Supabase는 프로젝트GET 가능하나 Auth설정GET tool 없음, 브라우저로그인 기록 없음. 연결 자격정보/Secret 평문을 추출하지 않음.
- **공식 최소 권한:** 대상 프로젝트 waluhdgqhwjjwmflhrle의 GET /v1/projects/{ref}/config/auth에는 Auth Config Read(fine-grained auth_config_read / OAuth auth:read). 설정쓰기/DB쓰기/조직전체Owner 불필요. 계정 자체에도 대상 설정 열람 권한 필요. 공식 [API](https://supabase.com/docs/reference/api/v1-get-auth-service-config), [권한표](https://supabase.com/docs/guides/platform/personal-access-tokens), [2026-10-06 scoped PAT GA](https://supabase.com/changelog/scoped-personal-access-tokens-ga) 확인. 과거 문서의 alpha 안내 대신 최신 GA 공지 반영.
- **실제 준비 코드:** 전용 SUPABASE_AUTH_READ_TOKEN 우선·없으면 기존 SUPABASE_ACCESS_TOKEN 재사용하는 GET-only probe. 인증정보 없음/401/403(필요 auth_config_read)/네트워크/잘못된 응답 구분. 토큰/SMTP 주소·비밀번호/템플릿 원문은 결과·로그에 반환하지 않음. 전용 토큰이 거부돼도 더 넓은 기존토큰으로 자동재시도하지 않음. CI PR은 표적검증만, main/수동은 실제 읽기감사; 6개 기존엄격판정/실메일수신 미검증 경계 유지.
- **개통 범위 코드/문서:** 기존 필수8개와 실제 수신·점주세션·대상별승인/보호 증거를 모두 유지. 출력에 개통대상(관리자·근태·급여·시트·레시피)과 후속5개 자동화군(POS/배달·매입수집·장바구니·판매량/레시피/원가·재고현장UX)을 별도 표기. 전체38건 완료율로 개통을 막지 않음. 필수 실패/미확인을 제거·성공처리하지 않으며 미등록실패도 숨기지 않는 테스트 추가. 후속개발 항목을 원장에서 삭제/완료선체크하지 않음.
- **승인 전 준비·표적QA:** 신규/기존 계정 초대분기·받는주소/HQ권한·대표/보조의도·활성화 경로·미인증/불일치·SMTP 오류·미러 검사 PASS. 신규 관리 probe의 GET-only·최소권한·기존인증재사용·정보미노출·403/401/통신오류/blank 설정 실패검사 PASS. 실제 메일발송·계정/지점생성·비밀번호설정·권한변경·READY 전환·운영자료/Sheet쓰기 없음. 기존 실제 Auth8/8·Google·전체 QA·v0.355배포는 재사용.
- **개통에 지금 필요한 일:** 안전한 관리읽기 인증/기존로그인 화면으로 Hosted설정 확인. 이후 실제 지점·대표 정보와 운영 초대/연결/개통승인, 수신인 직접 수락·비밀번호·로그인/권한 및 지점별보호 최종대조. 비밀번호/토큰을 채팅으로 요청하지 않음. POS/공급사 자동연동은 앱 개통 후 개발가능하며 기존 사이트 업무와 현장 영업준비는 별도확인.
- 앱 v0.355, 전체38/완료19/잔여19 유지. 개통 NO_GO(Hosted설정·실수신/실세션·실개통승인 미확인). 정확한권한·안전한등록경로·선행QA·후속개발을 [개통문서7절](QA1243_FRIDAY_OPENING_20261023.md)에 반영. 신규PR/최종CI/병합/실제조회 결과는 #1243 후속증거로 연결.


## 69. 2026-10-23 — 최종 인증 준비·URL 검증 결함 수정·잔여19건 개별 완료조건 확정

- 사용자 이번 요청은 [#1243 접수 요약](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6359370961), 중간 실증 [진행 증거](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6359554768). 기준 main d42908c / v0.355 / #1320. 기존 #1310~1320·v0.355 배포·Auth8/8·Google·전체 QA는 재실행하지 않음.
- **관리 읽기 연결 조사 완료:** 현재 cloud spec52 binding0, Supabase 도구에 Auth config GET 없음, browser 로그인 사이트0. production 환경의 공식 GitHub App Edge 배포와 Management PAT를 혼동하지 않음. GitHub Secret API는 연결 도구에 없어 해당 job의 NONE을 저장소/조직 전체 부재로 과장하지 않음. 필요한 권한은 대상 프로젝트의 Auth Config Read(auth_config_read / auth:read), 설정/DB 쓰기·Owner 불필요. 기존 승인된 Secret을 감사 job에 바인딩하거나 소유자가 전용 읽기 Secret을 직접 등록하는 안전한 경로 준비; 인증값 채팅/로그 요구·추출 없음.
- **실제 결함 수정:** Hosted Auth 감사에 누락된 production Site URL 및 invitation/recovery의 실제 owner_activation callback 검사 추가. 기존6개 메일/SMTP 검사는 유지하고 URL2개 추가. GoTrue same-origin 지원을 upstream source와 대조해 정상 설정을 allow-list 부재로 오판하지 않으며 미구현 wildcard는 검토 필요로 남김. 원격 URL/메일·토큰 원문 반환 없음.
- **새 표적 QA 완료:** 실제 배포된 owner_activation.js VM20개 정상/오류/재시도 실행 PASS. 취소/만료/미권한 초대는 password PUT 이전 차단, 대표/보조·비밀번호·수락·통신·타점context·재시도·세션 저장 경계 확인. 인증 URL/최소권한/GET-only/자격정보 미노출/오류 fail-closed 및 증거 재사용/운영 무쓰기 guard 테스트 PASS. 실제 SMTP/Auth/Google 호출 없음.
- **잔여19건 재분류:** 개통 전 기술·검증 관리7(QA-04/05/06/07, SEC-01, AUTH-01, MTG-03), 실본인인증·개통 승인2(FIELD-01, MTG-04), 개통 이후10(FIELD-02/03, MTG-05/06/07/08/11/12/13/16). 전체38/완료19/잔여19 유지. [개통문서8절](QA1243_FRIDAY_OPENING_20261023.md#8-2026-10-23-최종-준비--인증-url실제-초대-화면-검증과-잔여19건-분류)에 19개 각 항목의 필수 최소범위와 전체 체크 조건을 명시. 분류 코드와 원장 unchecked ID 정확한 일치/중복0 검증.
- **SEC-01 누락 차단 보완:** 해임된 구JWT의 즉시 RPC 거부는 기존 실제 Auth 증거 있음. 새 장치 로그인으로 기존 장치 차단은 별개이며 WIP #999 open/unmerged/mergeable=false. 운영 read-only에서 guard 객체 존재=true, authenticator role hook 설정=false 확인; 이 조회만으로 모든 유효 운영 설정/실효성을 단정하지 않음. main 통합·실제 Auth 발급·익명/직원/HQ3·복구/롤백·실기기·승인된 활성화 미완료. 원래 P0를 임의 후순위/성공 처리하지 않고 개통 차단 목록에 명시. 단순 실사용자 인증 대기가 아닌 기술/통합·배포 잔여도 유지.
- **보호 기준선:** read-only10그룹의 원본 hash는 §66과 동일. stores244/HQ3/employees10, 기존 근태236(id≤5578; 전체238), snapshot0/movement5/transaction3323/raw0/override0/variant245. 최초 잘못된 attendance 테이블명 조회는 relation missing으로 종료/DML0, 실제 attendance_events로 교정한 읽기 검증 성공. Auth/운영 DB·Sheet쓰기/메일/READY 없음. 기존 Sheet 전체 셀 hash를 검증한 것으로 과장하지 않음.
- 앱 **v0.355 유지**. 변경은 감사/검증/문서만이므로 새 앱 배포 불필요, P0의 운영 Pages/Sheet 작업과 실제 Google E2E는 기존 무쓰기/재사용 마커로 차단. PR·최종 CI·병합·main 조회 감사/8개 판정·배포 SKIP 증거를 #1243에 후속 기록. 현재 개통 **NO_GO**: Hosted 설정 읽기/실수신·실인원/승인, SEC-01 통합·통제된 활성화 실증 미완료. 후속 자동화 미개발을 실인원 대기로 위장하지 않음.


## 70. 2026-10-23 — #1321 병합 완료와 SEC-01 로그아웃 JWT 결함·실제 복구 검증 준비

- [PR #1321](https://github.com/koith/attendance-proto/pull/1321) head065735ced6a3b9a1a61d59397ad874b3933a1b3a **56체크 완료/실패0** 후 squash50be119742dbcece42b9b26e7364ed64b7709cc9 병합. [Auth/URL/활성화20케이스 #39916730638](https://github.com/koith/attendance-proto/actions/runs/39916730638) SUCCESS. 기존8/8·Google·전체 개통·v0.355 배포 재실행 없음.
- **SEC-01 승인 전 실제 개발:** 원래 P0의 새 장치 로그인 구세션 차단/복구 미완료를 단순 인증 대기로 축소하지 않고, WIP #999의 서버 구현을 운영 비활성 staged 후보로 분리. 현재 운영 함수의 읽기 hash47c6b36b66f1834371f95a561e3f90d9, signed claims/관리자 범위=true, Auth session 존재 검사=false. latest_session만 같으면 로그아웃으로 삭제된 세션의 미만료 JWT가 남을 수 있는 결함을 후보에서 수정. 실제 auth.sessions의 session id/uid 존재까지 확인한다. 운영 함수/설정/사용자 변경 없음.
- **격리 검증:** embedded PostgreSQL에서 익명·직원·현재 관리자 허용, 새 세션 삽입 후 이전 JWT 거부, logout처럼 세션 삭제 후 동일 JWT 거부 PASS. 새 전용 CI는 실제 GoTrue 로그인/refresh JWT로 PostgREST 구세션 차단·관리자3/직원/익명 무회귀·logout·복구·실제 role RESET/reload와 재활성화를 기록. SMTP/초대/Google 재실행 없음. 환경 pre-request override로 복구를 가리는 검증 오류를 피한다.
- `scripts/qa1243_sec01/` 후보와 localhost 전용 fixture/러너만 추가, 새 workflow는 disposable PG/GoTrue/PostgREST만 사용. migration 디렉터리/앱/운영 Edge 변경 없음. 운영 Pages/Sheet 무쓰기·Google 재사용 guard의 정확한 파일 allowlist에만 추가. 기존 root QA/SQL·migration을 건드리지 않아 전체 개통/기존 Auth8 재실행을 유발하지 않음.
- 승인 전 준비와 실제 운영 적용의 경계·기존 유효 훅 보존/복구 조건은 [개통문서9절](QA1243_FRIDAY_OPENING_20261023.md#9-sec-01-승인-전-실제-세션복구-qa-준비). 운영 마이그레이션·활성화·실기기/승인된 계정 검증 전 SEC-01 전체 [ ] 및 NO_GO 유지. main 새 보안 CI와 기존 main read-only 감사/게이트·P0 no-write 결과는 #1243 후속 증거로 연결.
- 앱 v0.355 / 총38·완료19·잔여19 유지. 7/2/10 분류는 전체 완료 수를 변경하지 않음. 보호244지점/HQ3/직원10 및 원본 자료/기존 Sheet 쓰기0.


## 71. 2026-10-23 — Hosted 기존 환경 연결 경로 보완·초대 실수신 준비·SEC-01 운영 계획 확정

- 사용자 이번 원문 [#1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6360241412). #1321/#1322/v0.355·기존 Auth8/SEC9/Google/전체 개통/Pages 성공 재실행 금지, 기존 승인 연결부터 Auth 읽기 해결·필요한 관리자 조치 한 건만 요청, 실수신 준비와 별도 승인 전 SEC01 영향/복구/실기기 계획 확정 지시.
- **추가 확인:** cloud spec53 binding0, 알려진 로컬 관리변수 없음, browser 로그인0. GitHub connector environment GET은 HTTP400 미지원이며 실제 GitHub API 권한 거부가 아님. 기존 production 환경 Secret 문맥을 감사가 사용하지 않던 누락을 보완. Actions Read로 메타데이터만 읽어 환경 존재/보호규칙을 확인한 경우에만 해당 문맥의 기존 인증으로 Auth GET. 새 환경·권한·Secret을 만들지 않음.
- **보호 유지:** 저장소 전용/기존 인증 우선; 부재일 때만 환경 조회. 401/403 뒤 다른 권한으로 재시도하지 않음. production의 required reviewer/대기/branch 정책을 존중하고 custom/미확인 규칙이면 그 경로를 사용하지 않음. deployment:false로 가짜 운영 배포 객체 생성 없음. PR 준비에는 관리 인증정보를 주지 않음. 공식 GitHub 문서의 environment GET Actions Read와 non-deployment 환경 지원 확인.
- **실수신 준비 확정:** 설정/실제 TTL→동의된 시험 대상/범위→invite/recovery/기존계정연결 분기→수신/스팸·링크 안전 증거→본인 수락/비밀번호/로그인→대표/보조·지점 권한→승인 범위 내 종료의 실행표 작성. Google QA 이메일 동의를 Hosted 초대 동의로 확대하지 않음. 발송/재초대/정리/READY·실제 계정 변경은 실행하지 않음.
- **SEC01 새로운 운영 영향 읽기 분석:** HQ관리자3 중2계정에 Auth session 행90개, 복수 세션2계정, latest 연결 없는 관리자1, 존재하지 않는 Auth session에 대한 latest 연결0. 이 수를 유효 JWT/실사용 기기 수로 과장하지 않음. 명시 authenticator role hook 항목0·기존 guard hash47c6b36b66f1834371f95a561e3f90d9. 제공자 환경의 유효 설정은 별도 확인 필요.
- **운영 계획 확정:** 기존 유효 hook/함수·권한/trigger 비공개 복구본→본사3 본인 재로그인·복구 준비→정확한 영향/SQL·시간/계정의 별도 승인→현재 객체와 diff한 최소 migration→장치A/B의 실제 구세션·옛refresh/logout/복구→직원·익명·타점 무회귀→오차단시 정확한 이전 설정/함수 복구·reload/HTTP 확인. 과거 Auth 세션·refresh token·비밀번호를 복원하거나 다른 기존 hook을 무조건 RESET하지 않음. staged fixture 전체를 운영에 일괄 실행하지 않음.
- 자세한 실행/정지/복구 조건은 [개통문서10절](QA1243_FRIDAY_OPENING_20261023.md#10-기존-승인-연결로-hosted-읽기-해결실수신-준비sec-01-운영-계획-확정). 이번 추가 검증은 연결 선택/권한보호/GET-only와 workflow 문법에 한정, 기존 실제 E2E 재실행 없음. PR·최종 실제 Auth GET 결과·필요한 단 한 가지 관리자 조치는 #1243 후속 증거로 연결.
- 앱 v0.355 / 전체38·완료19·잔여19 유지. 운영 SQL/계정·메일/권한·SEC01 활성화/READY·기존 Sheets 변경0. 기존 성공 검증과 배포를 반복하지 않으며 현재 미확인 조건은 성공 처리하지 않음.


## 72. 2026-10-23 — 기존 production 인증 문맥 실제 확인 종료·관리자 조치 한 건 확정

- [PR #1323](https://github.com/koith/attendance-proto/pull/1323) head b8b6cc17ebda8ff3c0a16daa758ffdf6d0081056 **59개 체크 완료/실패0**, squash **a125554c04d79d3076deb4033fda5238b59c0222** 병합. 앱 v0.355 유지. 본 절은 최종 증거 문서만 추가하며, 문서 전용 [skip ci]로 기존 QA/배포/실패 감사를 반복하지 않음. branch protection/필수 체크는 우회하지 않음.
- **실제 연결 결과:** [Hosted 감사 #39923060344 attempt1](https://github.com/koith/attendance-proto/actions/runs/39923060344/attempts/1), 경로 선택 job120312789544: production 환경 GET HTTP200, requiredReviewerGate=false/waitTimerGate=false, 기존 환경 문맥을 정상 사용. 실제 GET job120312839663의 2026-10-23 **17:13:16 KST** 결과는 managementCredentialSource=NONE/configReadable=false/MANAGEMENT_API_CREDENTIAL_ABSENT. 저장소와 기존 환경의 **감사에 연결된 두 자격정보가 모두 제공되지 않음**을 실행으로 확인. 조직/보관함의 모든 다른 인증정보가 없다고 단정하지 않음.
- 설정을 읽지 못했으므로 SMTP/한국어 템플릿/인증 URL은 UNREAD이며 장애/설정 오류라고 단정하지 않음. 프로젝트/MCP 로그인이나 DB 접근만으로 Auth Management GET을 수행할 수 없고, 안전한 직접 Auth GET 도구/로컬 binding/브라우저 로그인도 없음. 인증정보 추출·권한 확대 없이 사용할 기존 실행 경로 확인을 마쳤으므로 동일 NONE 감사를 더 반복하지 않음.
- **당시 필요한 조치(아래 §73에서 연결 완료):** 대상 프로젝트 waluhdgqhwjjwmflhrle의 **Auth Config Read(auth_config_read / auth:read)만 허용된 관리 API 인증**을 저장소 Actions Secret `SUPABASE_AUTH_READ_TOKEN`으로 안전하게 연결. [등록 화면](https://github.com/koith/attendance-proto/settings/secrets/actions/new). 기존 승인된 읽기 인증이 있으면 재사용. 비밀번호/토큰 원문을 채팅·Issue·로그에 제출하지 않음. 설정 쓰기·DB쓰기·Owner 권한 요구 없음. 현재 환경 승인 대기 job은 없음.
- 연결 후 **AI 담당:** 인증 경로 선택+Auth GET 단계만 새 Secret 문맥으로 재실행,8개 설정 판정·실제 TTL·초대/복구 링크/템플릿 경계 확인, 불일치 변경안 준비·기록. 설정 수정/실메일 발송/계정·READY/SEC01 활성화는 승인된 범위 전까지 실행하지 않음.
- **준비 완료:** §71/개통문서§10의 실제 수신·수락·로그인 승인표 및 SEC01 본사3 영향·정확한 이전 설정/함수 보관·최소 diff·실기기 A/B/옛refresh/logout·직원/익명 무회귀·오차단시 이전 설정 복구 계획 확정. 향후 사람의 참여는 실제 수신자 동의/직접 인증 및 별도 SEC01 운영 적용 승인·실기기 확인. 현재 이들을 동시에 요청하지 않음.
- [최종 P0 #39923060166](https://github.com/koith/attendance-proto/actions/runs/39923060166) SUCCESS, Pages build/QA publish/deploy/validation 전부 SKIP. [기술 main 최종 개통점검 #39923200350](https://github.com/koith/attendance-proto/actions/runs/39923200350) 7/8 NO_GO(HOSTED_AUTH_READ), 기존 실제 Google39781031886 PASS 재사용. main 기술작업 pending0·예상 밖 실패0. 운영 계정·메일·SQL·권한·hook·READY·기존 Sheets 변경0.
- 정본 **전체38/완료19/잔여19**, 분류7/2/10 유지. 실제 설정 읽기·실수신/본인인증·개통 승인·SEC01 운영 실증은 성공 처리하지 않음. 다음 장애물은 기술 조사 반복이 아니라 위 최소 읽기 연결 한 건이며, 이후 조회·판정은 AI가 이어 수행한다.


## 73. 2026-10-23 — Auth Config Read 연결 완료와 실제 운영 설정 불일치 확인

- 사용자가 승인된 `SUPABASE_AUTH_READ_TOKEN` 등록을 완료. Secret 원문/목록을 조회하지 않고 기존 #1323 경로를 사용했다. [감사39923060344 attempt2](https://github.com/koith/attendance-proto/actions/runs/39923060344/attempts/2), 경로 job120351711030은 REPOSITORY/EXISTING_REPOSITORY_CREDENTIAL, 실제 GET job120351768596은 **18:51:15 KST HTTP200/SCOPED_AUTH_READ_SECRET/configReadable=true**. §72의 자격정보 부재는 해결됐으며 사용자에게 등록/화면 조작을 다시 요구하지 않는다.
- **Auth 설정 내부8개 중2 PASS/6 FAIL:** 관리 설정 읽기·email provider 활성 PASS. 저장소 한국어 초대 HTML/제목 불일치, custom SMTP host/sender 미구성, 운영 Site URL 불일치, 실제 owner_activation callback 허용 미확인 FAIL. SMTP host/port/user/pass/sender 존재 bool 모두 false; 원문은 기록하지 않았다. mailer_autoconfirm=false, signupDisabled=false, invite TTL3600초. public Auth settings도 HTTP200. 이 결과는 관리권한 부재나 SMTP 네트워크 장애가 아니라 **실제 설정 불일치**의 증거다.
- **추가 진단 개발:** Send Email Hook이 내장 발송을 대체할 수 있으므로 SMTP 공란만으로 발송 방식/장애를 단정하지 않도록 hook enabled/URI 존재 bool·발송 방식 enum, 빈 기본/다른 템플릿·제목 enum, Site URL 분류/redirect 개수만 출력한다. 필드 미제공은 UNKNOWN 유지. 어떠한 원격 URL/메일/템플릿·hook secret도 출력하지 않는다. 기존8개 검사 기준을 낮추거나 설정 GET200만으로 HOSTED_AUTH_READ를 PASS로 바꾸지 않는다.
- **적용 전 수정안 준비:** 한국어 HTML은 `supabase/email-templates/invite.html`(SHA256 접두 ae300e5409e99792), 제목 `[백억커피] 매장 관리자 계정 초대 안내`, Site URL `https://koith.github.io/attendance-proto/`, callback `https://koith.github.io/attendance-proto/owner_activation.html` **기존 uri_allow_list 전부 보존·정확한 callback 추가**. SMTP/메일 제공자는 기존 승인 공급자·검증 발신자가 확인돼야 한다. 다른 OAuth redirect·signup/autoconfirm·세션 정책은 수정 대상이 아니다.
- 공식 [SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp): 기본 메일 서버는 조직 팀 주소로 제한되고 운영용이 아님. [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)은 기존 발송을 대체하므로 실제 hook 상태를 안전한 추가 GET에서 구분했다(아래 §74). 현재 저장소/알려진 연결에서 승인된 운영 SMTP 설정을 확인하지 못했고 임의 공급자 계약/계정/과금·권한을 만들지 않았다.
- **운영 변경 승인 경계:** 읽기 Secret은 계속 Auth Config Read 전용. 설정 변경에는 별도 승인과 해당 프로젝트 Auth Config Write(`auth_config_write`)의 안전한 실행 경로가 필요하다. 현재 승인/쓰기 권한이 없으므로 PATCH를 권한 시험으로 보내지 않는다. 적용 직전 변경 필드의 정확한 이전 값은 승인된 비공개 저장소에 보관하고, 최소 변경→GET readback→실패 시 그 필드만 정확히 복구한다. SMTP 비밀번호/토큰·이전 원문은 채팅/Issue/CI 로그/공개 artifact에 남기지 않는다.
- 로컬 변경 대상 QA: 관리 Secret 비노출/GET-only/403 권한 확대 금지, hook/default/unknown 분기, 기존 allow-list·정책 보존 변경계획 PASS. 한국어 템플릿 dry-run PASS. 실제 Auth8/SEC9/Google/전체 개통/Pages는 재실행하지 않음. PR/CI/main 추가 진단 및8개 개통점검 결과는 #1243 후속 증거로 확정한다.
- 실수신·수락·로그인 실행표와 취소/만료/재초대·기존계정 분기, 대표/보조·타점 권한 확인은 개통문서§10대로 준비 완료. **실제 발송·수신·본인 비밀번호/로그인·계정 변경 미실행**. 설정 수정 승인, 동의된 시험 수신자·대상 범위, 본인 인증은 별도 필요. SEC01 미활성·READY 미전환·운영 DML/Sheets 쓰기0.
- 앱 **v0.355**, 원장 **전체38/완료19/잔여19** 유지. 이번은 QA-04/AUTH-01의 실제 설정 진단 진전이며 전체 완료 조건을 충족하지 않아 [ ] 유지. 개통 후 추가 POS/공급사/장바구니 개발10건을 이 오류의 원인이나 새 개통 필수조건으로 섞지 않는다.

## 74. 2026-10-23 — 실제 기본 메일러·개발 URL 확정 및 audit-only 배포 보호 결함 수정

- [#1325](https://github.com/koith/attendance-proto/pull/1325)는59개 체크 완료/실패0 후 main `dc6eeffa55ad6937cd72d4cc13338c2bf297e876` 병합. [실제 감사39948020251](https://github.com/koith/attendance-proto/actions/runs/39948020251) GET job120395473917 **20:43:23 KST HTTP200**으로 추가 진단 완료. Secret 연결 장애는 종료됐으며 설정 불일치는 유지한다.
- **실제 발송 경로:** sendEmailHookEnabled=false/URI=false, emailDeliveryMode=DEFAULT_SUPABASE_MAILER. custom SMTP host/port/user/pass/sender 미구성. 승인된 메일 공급자와 검증 발신자가 있어야 일반 점주 수신자를 지원할 수 있다. 기본 메일러의 조직 팀 주소 제한을 무시해 실제 점주 초대를 시도하지 않음.
- **메일/URL:** inviteTemplateState=DIFFERENT, inviteSubjectState=DIFFERENT(원격 본문/제목은 출력하지 않아 영어라고 단정하지 않음), siteUrlClass=LOOPBACK, redirectAllowListEntryCount=0. 실제 TTL3600초. 한국어 승인본/운영 URL/정확한 callback의 수정값 및 기존 정책·allow-list 보존/복구는 §73대로 준비. **내부2/8 FAIL6, 실수신 미검증** 유지.
- **발견 결함·실제 수정:** [P039948020668](https://github.com/koith/attendance-proto/actions/runs/39948020668)의 no-operating-write guard는5개 변경 모두 정확한 allowlist에 있어도, workflow 파일 없이 Auth runner만 바꾸면 필수 진입점 목록에서 누락되어 거부했다. 보호는 fail-closed로 모든 Pages/Sheet 게시 SKIP. 이미 allowlist된 Auth readscript/verdict/test3개만 진입점에 추가하며 새 운영 경로는 허용하지 않는다.
- **회귀 QA:** 실제 GitHub Actions guard 코드를 실행해 #1325의 정확한5파일 diff와 runner 단독 변경 PASS; owner_activation/index·운영 Edge/edge-release·Apps Script·unknown·문서만·P0만 변경은 계속 거부. 기존 Google proof/Pages 안전 guard 회귀 PASS, Google API 요청0. PR→CI→정상 병합 및 main P0/최종 gate 결과를 #1243에 후속 기록한다.
- 앱 v0.355/38·19·19 유지. 일반 점주 발송 가능한 SMTP 연결/초대문·운영 URL 설정 변경에는 별도 운영 승인과 Auth Config Write 실행 경로 필요. 읽기 Secret 권한 확대/설정 PATCH/DML/메일·계정 변경/READY/SEC01/Sheets 쓰기0. 승인된 수신자·직접 인증 전 실제 Hosted 메일/로그인 PASS로 표시하지 않는다.


## 75. 2026-10-23 — 최종 기술 main 결과·보존 증거·승인 전 단계 마감

- **앱 v0.355 유지.** [#1325](https://github.com/koith/attendance-proto/pull/1325)59체크/실패0, main dc6eeffa55ad6937cd72d4cc13338c2bf297e876. [#1326](https://github.com/koith/attendance-proto/pull/1326)63체크/실패0, 최종 기술 main **b16edff5e223df2e1482d4500c343974217b8309**. 운영 Auth 진단과 실제 발견한 배포 보호 결함을 수정→QA→PR→정상 병합 완료. 앱 자산/Edge/Google 기능 변경이 없어 새 배포는 필요하지 않다.
- **Auth 연결 해결/감사 완료:** [39923060344 attempt2](https://github.com/koith/attendance-proto/actions/runs/39923060344/attempts/2)에서 새 읽기 Secret으로200, [추가 원인 진단39948020251](https://github.com/koith/attendance-proto/actions/runs/39948020251) job120395473917에서200/SCOPED_AUTH_READ_SECRET. 실제 결과는 기본 mailer·Hook미사용·SMTP미구성·LOOPBACK Site URL·redirect0·초대 HTML/제목 승인본과 불일치. **감사는 실행 완료했으나 설정 검사는2/8로 불합격.** 자격정보 부재나 SMTP 통신 장애로 잘못 표시하지 않는다. 실제 메일 발송/수신은 아직 검증하지 않았다.
- **main 무쓰기 CI 복구:** [P039950041267](https://github.com/koith/attendance-proto/actions/runs/39950041267) SUCCESS, 실제 guard `QA1243_NO_OPERATING_WRITE_GUARD_PASS files=4`. Pages build120402426710/QA publish120402427347/deploy120402427677/validation120402428438 전부 SKIP. 기존 실패39948020668은 삭제/성공 처리하지 않고 실제 원인과 수정 증거를 §74에 보존했다.
- **Google 반복 없음:** [39950041476](https://github.com/koith/attendance-proto/actions/runs/39950041476)은 scope/static SUCCESS. 실제 Edge 대기·GAS/Sheets 생성/쓰기·실행 단계(job120402069451 step5/6) SKIP, 모바일 HTTP도 SKIP. 기존 실제 성공39781031886의 ancestry/runner/실행 증거 재사용을 최종 gate가 확인했다. Auth8/SEC9/전체 개통/Pages 배포도 재실행하지 않음.
- **최종 개통 자동8개:** [39950188173](https://github.com/koith/attendance-proto/actions/runs/39950188173) job120402472716, **7/8 NO_GO**, HOSTED_AUTH_READ만 FAIL. 앞선 gate39950041390의 Google WORKFLOW_NOT_FINISHED는 동시 실행 중 일시 대기였고 Google 재실행 없이 workflow_run의 최종 성공 증거로 해소됐다. 기술 main pending0, 실제 설정 실패에 따른 NO_GO 외 예상 밖 실패0.

| 개통 자동 항목 | 판정 | 근거/범위 |
|---|---|---|
| STORE_E2E | PASS | 기존 격리 PG·브라우저 개통 통합 성공 재사용 |
| MANAGER_POSTGRES | PASS | 기존 보조 관리자 권한·해임 격리 PG 증거 |
| HQ_STORE_POSTGRES | PASS | 기존 STAGED/READY·대표 확정 PG 증거 |
| TEST_MAIL_GOTRUE | PASS | 기존 격리 Auth/SMTP 성공; Hosted 실수신과 구분 |
| HOSTED_AUTH_READ | FAIL | 관리 GET200; 설정 내부2/8,6개 불일치 |
| LIVE_EDGE_GAS_SHEETS | PASS | 실제39781031886 재사용, Google E2E 반복false |
| PAGES_PUBLISH | PASS | 기존 v0.355 실제 게시·현재 앱 자산 일치 증거 |
| INDEPENDENT_PAGES | PASS | 기존 독립 HTTP 검증·현재 자산 일치 증거 |

- **보호 대상 전후 검증:** READ ONLY 두 시점의 동일한 행 정렬·hash 방식으로10그룹 count+전체 행 digest 모두 동일. 지점244/HQ3/인하대직원10/기존근태236(id≤5578)/급여snapshot0/재고이동5/거래3323/raw0/지점레시피override0/원본variant245. guard 함수 hash도47c6b36b66f1834371f95a561e3f90d9 동일. 신규 정상 근태 추가분까지 과거 기준과 같다고 주장하지 않음. 기존 Google Sheets writer 실행0이며 모든 셀 hash를 새로 조사한 것으로 과장하지 않는다.
- **AI가 완료한 준비:** 읽기 연결/실제 설정 원인 확정, 비밀 없는 진단과 최소 설정 변경안, 정확한 이전 필드 비공개 보관·기존 redirect/기타 Auth 정책 보존·실패 복구/GET 재확인 계획, 실제 초대/기존계정 recovery·재연결/취소·만료·재초대/대표·보조·해임·타점 권한의 승인 후 실행표. 운영 적용·실제 인증을 모의 QA로 대신 완료 처리하지 않음.
- **다음에 필요한 운영 결정:** §73의 한국어 HTML/제목·Site URL·callback **4필드 변경 + 승인된 메일 공급자/검증 발신자 연결의 운영 승인**. 현재 SMTP 정보/설정 쓰기 실행 권한은 없으며 Auth Config Read Secret은 그대로 유지한다. 실제 적용에는 별도 Auth Config Write(`auth_config_write`)의 승인된 안전한 실행 경로가 필요. 비밀번호/토큰 원문·추가 화면 조작을 채팅으로 요구하지 않는다. 승인만으로 읽기 토큰에 쓰기 권한이 생긴다고 주장하지 않음.
- **그다음 사람 참여:** 설정 통과 후 동의된 테스트 이메일/대상·발송 범위 승인→수신자 본인 수신·수락/비밀번호·로그인. 실제 지점명/대표 이메일·개통 승인, 별도 SEC01 운영 적용 승인과 실기기A/B/기존HQ 복구 확인. HOSTED_TEST_MAIL_RECEIPT/STORE_MANAGER_LIVE_SESSION/SEC01_SINGLE_DEVICE_ROLLOUT/PRODUCTION_PREPOST_DATA_PROOF4개는 실제 대상 실행 증거 전까지 PENDING. 이번 원본 hash 보존은 승인된 향후 지점 작업의 전후 증거를 대신하지 않는다.
- **정본 전체38/완료19/잔여19**, 개통 전7/본인인증·승인2/개통 후10 분류 유지. POS·배달·공급사·장바구니·판매량 연동은 미완료 추가개발이며 이번 메일/인증 개통 gate에 새 필수조건으로 넣지 않았다. QA-04/AUTH-01 등 전체 완료 조건은 아직 충족하지 않아 체크하지 않음.
- **최종 NO_GO 사유:** 운영용 메일 경로·승인 초대문/운영 URL 설정 미충족 및 실제 수신/본인 세션·개통/SEC01 승인·실기기 증거 없음. 운영 PATCH/DML/실메일·계정/권한·READY·SEC01/Sheets 쓰기0. 이 최종 증거는 문서 전용 [skip ci]로 기록해 완료 QA/배포/실패 감사를 반복하지 않는다.


## 76. 2026-10-23 — 승인4개 Auth 필드의 실제 전후 검토·기존 쓰기 경로 검사·안전 적용기 개발

- 사용자 지시 [#1243](https://github.com/koith/attendance-proto/issues/1243#issuecomment-6365519235): 읽기 연결 재요청 금지, 실제4필드 전후 제시·범위/영향 우선 보고, 기존 권한 체계로만 쓰기 가능성 확인, SMTP/발신 계정/기타 Auth·보안 설정 임의 변경 금지. 대표 초대/READY/SEC01/운영 데이터 변경은 별도 승인 전 금지.
- **범위 확정:** `mailer_templates_invite_content`=`supabase/email-templates/invite.html` 전체(ConfirmationURL1개); `mailer_subjects_invite`=`[백억커피] 매장 관리자 계정 초대 안내`; `site_url`=`https://koith.github.io/attendance-proto/`; `uri_allow_list`는 기존 원문 전체 보존 후 `https://koith.github.io/attendance-proto/owner_activation.html` 정확한 주소만 추가. 운영 전 실제 원문은 새 전용 GET으로 확인하며 LOOPBACK/DIFFERENT enum을 실제 문자열로 추정하지 않는다.
- **영향:** 향후 invite 메일 제목/본문 및 인증 복귀 기본주소·허용 callback만 변경. 기존 OAuth/복구 메일의 명시 redirect들은 유지되며, Site URL이 localhost에 머물렀던 기본 복귀는 운영앱으로 바뀐다. 기존 사용자/비밀번호/권한·세션/직원·근태·급여/Sheets는 수정하지 않음. SMTP·발신자/Hook/가입·autoconfirm/TTL·SEC01은 변경 대상이 아니다.
- **기존 권한부터 조사:** 현재 cloud spec69 runtime/secret/outbound binding0, 알려진 로컬 관리변수 부재, 저장된 Supabase browser sign-in0. Supabase MCP에는 Auth Config PATCH 기능이 없다. 기존 GitHub publish는 legacy관리 Secret으로 제목/본문2개만 쓰며 새4필드의 전후·동시 변경 검증이 부족했다. 기존 repository 및 확인된 production 환경에서 scoped write/legacy관리 Secret의 **존재 bool만** 검사한다. 읽기Secret은 쓰기로 사용하지 않고 토큰 발급/재인증을 다시 요구하지 않는다.
- **실제 개발:** `scripts/qa1243_auth_four_fields.mjs`는 명시적 요청4개 공개값만 비밀 검사 후 before/after로 반환; 전체 Auth config·SMTP·Hook/토큰 원문은 반환 안 함. `--apply`는 별도4필드 승인 scope·기존 쓰기 자격·승인된 beforeSHA가 모두 맞아야 PATCH. 직전 GET 전체 drift 감지, 허용4키만 부분 변경, GET readback/다른 설정 hash 비교, 불명확한 네트워크 결과 재조회, 인식 가능한 부분 적용만 해당 키 복구, 타인 변경은 덮어쓰지 않음. 403 이후 다른 자격/더 큰 권한으로 재시도하지 않음.
- **새 workflow는 REVIEW ONLY:** PR은 synthetic QA만, trusted main은 기존 Auth Read로4공개값 GET·쓰기 Secret 존재 확인 및 기존 production 보호 문맥 검사만 수행. 새 환경·Secret·권한·배포 객체 생성 없음. 현재 workflow에서 --apply를 실행하지 않는다. 실제 쓰기 후보가 확인되고 전후값/범위 보고 뒤에만 승인된4개 적용을 별도 실행한다.
- **검증:**14개 synthetic 복구/권한·동시 변경/4키 payload/403·불명확 결과·targeted rollback/비노출 PASS. 정확한7파일 변경의 실제 P0/Google guard 실행 PASS, 앱·Edge·Sheets·unknown 변경 거부 유지, 실제Google 실행false. workflow YAML 검증 PASS. SMTP가 없는 fixture는4필드 적용 후에도 내부6/8이어서 전체 PASS로 바뀌지 않는 것을 확인.
- 앱 v0.355/38·19·19 유지. 실제4값·기존 쓰기 권한 결과/PR·main 증거를 후속 절과 #1243에 기록한다. 운영 PATCH/계정·메일/READY/SEC01/DML/기존 Sheets 변경0.


## 77. 2026-10-23 — 실제4필드 현재값·기존 쓰기 경로 부재 확정·GitHub 승인 반복 해결

- **GitHub 승인 문제 해결:** 앞선 병합2회가 `user rejected MCP tool call`로 거부됐으나 사용자 “GitHub 항상 허용” 및 반복승인 최소화 후속 지시를 반영해 **GitHub 앱에만 plugin-specific full_access**를 적용(status=updated). 전역 기본값·Supabase OAuth/관리 권한은 변경하지 않음. 같은 병합 도구로 [#1328](https://github.com/koith/attendance-proto/pull/1328)66개 체크/실패0 후 정상 병합, 기술 main **c6bddf7c4f2cf6207a07e94a9817e10551b86faa**. 운영삭제·실제초대·보안설정은 별도 승인 원칙 유지. 다른 접근 도구/직접 main push로 우회하지 않음.
- **실제 GET/권한 검사 완료:** [39962969173](https://github.com/koith/attendance-proto/actions/runs/39962969173) SUCCESS. repository job120445486684의4공개값 GET 완료(22:39:28 KST까지 완료); production job120445579535도 기존 보호환경의 알려진 write/legacy 자격 존재만 확인. 새 workflow는 REVIEW_ONLY/applied=false/patchAttempted=false이며 운영 설정은 변경되지 않음.

| 항목 | 실제 현재값(GET) | 수정 확정값(미적용) |
|---|---|---|
| mailer_templates_invite_content | 아래 영문 HTML 전체 | [저장소 한국어 invite.html 전체](supabase/email-templates/invite.html),4202bytes/SHA256 접두 ae300e5409e99792 |
| mailer_subjects_invite | `You've been invited` | `[백억커피] 매장 관리자 계정 초대 안내` |
| site_url | `http://localhost:3000` | `https://koith.github.io/attendance-proto/` |
| uri_allow_list | `""`(빈 문자열) | `https://koith.github.io/attendance-proto/owner_activation.html` |

실제 변경 전 HTML 원문:

```html
<h2>You've been invited</h2>

<p>You've been invited to create an account. Follow the link below to accept.</p>
<p><a href="{{ .ConfirmationURL }}">Accept invitation</a></p>
```

- 변경 전4필드 SHA256 **d98d4b91f99b92b6fea05732eb90421ccfbad0088281d0309a20fe2b815c5f62** / 수정 확정4필드 SHA256 **32e7fe537adeb19c41bdb0a766fa24a66987b3f5476373142653e707e73226fd**. 이 두 번째 값은 아직 적용되지 않은 목표 JSON의 hash이며 운영 readback 성공값이 아니다. 실제 preimage/target/정확한4키 PATCH와 before4키 복구 JSON, before/after HTML은 작업공간 `qa-results/qa1243-auth-four-fields-20261023/`에 준비. 다른 config/SMTP·Hook/토큰 원문은 보존/공개하지 않았다.
- **범위/영향 확정:** 앞으로 발송할 invite의 본문·제목과 인증 기본 복귀/허용경로만 바뀜. 실제 현재 uri_allow_list가 빈 문자열이므로 운영 callback1개를 넣으며, 적용 직전 목록이 달라지면 승인 preimage SHA 또는 전체 config drift 검사로 중지해 기존 경로를 덮어쓰지 않음. 이미 발행한 링크/기존 계정·비밀번호/지점/권한은 수정하지 않음. SMTP 공급자/발신 계정·Hook·기타 OAuth/가입/autoconfirm·TTL·세션/SEC01은 변경 범위가 아님.
- **정확한 적용 차단 원인:** repository scopedRead=true/scopedWrite=false/legacyManagement=false. production 환경 메타데이터 GET200, 기존 requiredReviewer/waitTimer 없음 및 보호 문맥을 실제 검사했으며 **scopedWrite=false/legacy=false/EXISTING_WRITE_CREDENTIAL_ABSENT**. 현재 runtime 관리binding0·저장 Supabase browser로그인0·connector의 Auth Config PATCH 기능 없음. 기존 승인된 두 GitHub 실행 문맥에 Auth Config Write 자격이 없다는 실행 증거이며 읽기 인증 실패가 아니다. GitHub full_access는 Supabase Auth Config Write를 부여하지 않는다.
- **실제 쓰기 미실행:** 사용자 요청대로 새 토큰 발급·읽기 연결 재인증을 요구하지 않음. 읽기 전용 Secret을 PATCH/권한 시험에 쓰거나 별도 권한·계정/환경을 만들지 않았다. 현재4필드 적용에 필요한 것은 **승인된 기존 운영관리 주체의 Auth Config Write 실행 능력**이며 지금 확인된 연결로는 확보되지 않음. 같은4필드 운영 승인 자체를 다시 요청하지 않고 실제 capability 부족과 구분한다.
- **개발 완료와 미완료 구분:**4필드 제한 적용기·14개 synthetic QA·동시변경/403권한확대금지/불명확 결과GET확인/부분복구·실제 P0/Google scope guard QA 완료, PR66개 체크 실패0/병합 완료. 운영4필드 적용과 변경 후 GET검증은 **미실행**. 모의 적용 후 내부6/8은 SMTP2개를 남기는 회귀 결과일 뿐 실제 운영 통과값이 아니다.
- **실제 현재 Auth 설정2/8:** 위 GET에서도 관리읽기/emailProvider만 PASS, 한국어 승인본/제목·SMTP host/sender·운영 Site URL/callback6개 FAIL. [최종 개통39963164952](https://github.com/koith/attendance-proto/actions/runs/39963164952) job120446080163 **7/8 NO_GO**, HOSTED_AUTH_READ만 FAIL. 기존 실제Google39781031886 재사용/googleE2ERepeated=false. 외부 실수신·점주 세션/SEC01 운영실증·승인 대상 전후 증거4개는 PENDING 유지.
- [main P039962969106](https://github.com/koith/attendance-proto/actions/runs/39962969106) SUCCESS, build120445970297/QA publish120445970636/deploy120445972103/validation120445972629 모두 SKIP. Google39962968819 실제 E2E job120445481613의 Edge대기/GAS·Sheets 실행step SKIP, 모바일HTTP도 SKIP. 완료 Auth8/SEC9/Google/전체개통/Pages 반복 없음. 기술 main pending0·예상밖실패0(실제 설정에 따른 NO_GO만 유지).
- **보존:** READ ONLY 전후10그룹 count/행digest 동일: stores244/HQ3/인하대직원10/기존근태236(id≤5578)/payroll0/재고5/거래3323/raw0/지점override0/variant245. guard 정의47c6b36b66f1834371f95a561e3f90d9 동일. 모든 Sheet셀 hash를 새로 확인한 것이 아니며 실제 writer0. 운영PATCH/DML·초대/계정·권한/READY/SEC01 변경0.
- **앱 v0.355 / 전체38·완료19·잔여19(7/2/10) 유지. 최종 NO_GO:**4필드 운영 적용 능력 부재/설정 불일치·SMTP 미설정과 실제 수신/본인 세션·개통/SEC01 승인·현장 증거 미충족. SMTP/발신자 변경은 이번4필드에 포함하지 않음. 승인 없이 가능한 개발/검토·증거 연결은 마쳤으며 후속 자동화10건은 실제 미완료 개발로 유지한다.


## 78. 2026-10-23 — #1328 병합 재확인·4개 설정 실행 경로 완성·무쓰기 검증 분기 수정

- 사용자 재개 지시: #1328 병합 승인/항상 허용을 존중하고 미병합일 때만 재시도, 권한 오류를 코드 오류와 구분, 해결 가능한 개발·QA 계속. 실제 GET으로 #1328 merged=true/SHA c6bddf7c4f2cf6207a07e94a9817e10551b86faa/13:39:05Z 확인. 반복 병합하지 않음. 시작 main25692031396af932ceeb830040a1e6699393de7b/v0.355.
- GitHub 승인 차단은 이전 앱 설정 변경으로 해결된 상태. 현재 cloud spec85 관리credential/outbound binding0, 실제확인된 GitHub repository/production에는AuthRead만 있고write/legacy없음. 이는 권한/실행능력 문제이며 코드 오류로 표시하지 않음. 읽기연결 재인증/토큰발급을 다시 요구하지 않는다.
- **실제 추가 개발:** 조회 전용 workflow에 승인된4필드 적용 job을 repository/확인된 기존production으로 분리해 연결. 기본은REVIEW. trusted main의 명시적 `[QA1243-AUTH-FOUR-FIELDS-APPLY]` commit표지 또는 수동APPLY입력+유효beforeSHA일 때만 실행. 현재 승인preimage는 d98d4b91f99b92b6fea05732eb90421ccfbad0088281d0309a20fe2b815c5f62. 다른branch/PR/workflow_run/schedule/일반push는 쓰기실행 안함. main 실행은 직렬화하고 중간취소 금지.
- **적용 범위:** 기존 §77의 한국어invite HTML/제목/site_url/uri_allow_list4개만 부분PATCH. SMTP·발신자·기타Auth/보안·실제초대·계정/권한·READY·SEC01·운영DB/Sheets는 범위밖. main에는명시실행표지를 사용해 승인4필드 실행 경로를 실제 시도하며, 기존 P0 무쓰기표지는 운영자료·Sheets 게시 차단에 사용한다. Auth PATCH유무는실제 applied/patchAttempted값으로 별도기록하며 실행 전에0으로 단정하지 않는다.
- **변경 후 독립 감사:**4개 검증 완료 또는실제PATCH시도가있으면 별도job의 좁은 GitHub Actions Write로 기존 `qa1243-operational-readonly.yml`의 main workflow_dispatch만 호출. AuthSecret이없는 dispatcher에만 ActionsWrite를부여. GitHub공식문서의 GITHUB_TOKEN workflow_dispatch 예외를확인. 기존 감사의workflow_run으로 개통gate 재평가. Mail/Auth8/Google/Pages workflow는호출하지 않음. 자격부재로0PATCH이면불필요감사재실행 안함.
- **별도 실제 코드 결함 수정:** 이미4항목이목표와같아0write로확인할수있는데도write자격·과거preimage를요구하던순서를수정. 승인scope확인후목표일치면NO_CHANGE_VERIFIED, 실제변경이필요할때만write자격/preimage검사. 이경우SMTP2FAIL/실수신미검증을전체PASS로바꾸지않음.
- **새 QA:**18개 synthetic 적용기/복구 사례PASS(목표일치+쓰기없음/사용안하는readtoken/옛hash,scope불일치,동시변경,403무확대,불명확결과GET,부분복구). trusted-main/marker/manual입력/invalidSHA·권한분리·직렬실행·정확한5파일의P0/Googleguard/앱·Edge·Sheets·unknown거부PASS. YAML검증PASS. 기존성공Google·격리Auth8/SEC9·전체개통·Pages 반복안함.
- PR→CI→병합→main승인4필드실행과새GET결과/권한사유를후속기록. 앱v0.355/원장38·19·19유지. 실제점주초대·READY·SEC01·운영자료변경은별도승인전미실행.


## 79. 2026-10-23 — 통합 P0 지시 재접수·기존 권한 경로 한계 확정·실제 활성화 재시도 결함 수정

- 유실된 두 긴 지시는 실행됐다고 가정하지 않고 새 통합 지시 전체를 기준으로 작업한다. #1328/#1330은 재병합하지 않음. #1330 최종 main **2ec2b5ed7e293c7262c5302e5b22eb6e0fc971d3**, 앱 v0.355, PR61체크/실패0. [main 적용39972607294](https://github.com/koith/attendance-proto/actions/runs/39972607294) 실제 결과는 EXISTING_WRITE_CREDENTIAL_ABSENT/applied=false/patchAttempted=false이며 설정 정상화가 아니다. [개통39972754374](https://github.com/koith/attendance-proto/actions/runs/39972754374)7/8 NO_GO(HOSTED_AUTH_READ만 FAIL). Pages/Google/Auth8/SEC9 재실행0.
- **모든 확인 가능한 기존 경로:** repository/production에서 AuthRead만 존재/write·legacy없음(기존 실제 job 증거 재사용). GitHub 플러그인은 Secret API를 지원하지 않아, 기존 인증 gh CLI로 메타데이터만 요청했으나 HTTP403 Resource not accessible by integration. 현재 런타임 관리binding0/알려진 CLI 인증캐시0/CLI 바이너리없음. Supabase MCP는 실제 프로젝트 조회·main branch FUNCTIONS_DEPLOYED/공식 GitHub App 연결을 확인했지만 Auth Config PATCH 도구를 제공하지 않음. 저장 browser profile signed_in_sites0으로 인증된 관리 세션 미확인. [공식 GitHub 통합 문서](https://supabase.com/docs/guides/deployment/branching/github-integration#deploying-changes-to-production)는 production에서 Auth 설정을 기본 무시한다고 명시하므로 config.toml 추가로 실제 적용을 주장하지 않음. 임의 권한 생성/읽기토큰 PATCH/DB를 통한 관리권한 우회/SMTP 변경 없음.
- **추가 필요 권한을 정확히 정정:** [공식 scoped PAT 문서](https://supabase.com/docs/guides/platform/personal-access-tokens)의 각주3상 Auth config PATCH에는 **Auth Config Read-write와 Project Settings Read-write 둘 다** 필요. 운영 프로젝트 waluhdgqhwjjwmflhrle 하나에만 범위를 제한한 관리 인증을 기존 GitHub Secret SUPABASE_AUTH_WRITE_TOKEN에 안전하게 연결하는 한 가지 조치가 필요하다. 읽기 토큰 재발급·원문 채팅 제출을 요구하지 않는다. 기존 §77의 네 필드 제한/전후조회/동시변경 보호/복구 경로를 사용한다.
- **현재 운영 네 값:** site_url=http://localhost:3000, uri_allow_list=""(빈문자열), 제목 You've been invited, 본문 영문 기본 HTML. 실제 변경0. 목표 site_url=https://koith.github.io/attendance-proto/, callback=https://koith.github.io/attendance-proto/owner_activation.html, 제목 [백억커피] 매장 관리자 계정 초대 안내, 본문은 **PR#919 원본 blob9efd4d631285a2f817f7d1b4926ec91787c07158(4202bytes)** 그대로이며 재디자인하지 않음. SMTP/발신자·기타Auth/보안은 변경 범위가 아님. 사용자가 실제 수신을 보고한 사실을 SMTP 장애로 바꾸지 않으며, 기본 메일러의 외부 수신 제한/실수신은 별도 확인한다.
- **새 실제 결함:** 비밀번호 저장 후 대표 확정 요청 또는 비밀번호 응답이 유실되면 재시도 PUT은 GoTrue의422/same_password를 반환하고 초대 화면이 더 진행되지 않았다. 기존 VM이 서버의 동일 비밀번호 거부를 모사하지 않아 잘못 통과하던 것을 수정하여 먼저 FAIL을 재현. 공식 GoTrue v2.197.0 user.go의 정확한422/code만 처리해 계정 활성화를 재개한다. 매 시도 서버 preflight·취소/만료·대표/보조 권한 확정·동일 지점 context 검사를 유지하며 그 외 오류/상태를 성공 처리하지 않음. 기존 계정이 선택한 비밀번호와 일치하는 경우도 같은 서버 확인을 거친다.
- **수정 검증/배포 범위:** 실제 화면 VM28개 PASS. 신규 Chromium6개 PASS(대표 확정 재시도·보조 비밀번호 응답유실·기존동일비밀번호·취소·타지점·만료). WebKit은 로컬 시스템 라이브러리 부재로 미실행이며 CI에서 새12개 브라우저 범위를 검증한다. v0.356 버전표시2줄+초대 JS/HTML cache만 배포하고, 기존 Google/운영 Sheet writer·Edge·DB/SMTP·권한·READY·SEC01 실행은 금지. 배포 guard는 이 정확한 파일/버전/cache diff와 HTTP 전후 보호자산 hash를 검사하며 unrelated app/SQL 변경을 거부한다. 실제 CI·병합·배포·Auth readback 결과는 #1243에 기록한다.
- **통합 E2E 범위:** 기존 격리 Auth/SMTP/JWT/PostgREST8·SEC01격리9·신규지점→직원/근태/급여/재고/지점레시피·실 Google39781031886의 유효 증거를 재사용한다. 이번 신규 회복 시나리오와 새 앱 배포만 검증한다. 운영 Hosted 초대 수신→수락→비밀번호→관리자 로그인·실 권한회수는 아직 성공으로 표시하지 않는다. 승인된 실제 수신자/지점 작업이 없어 운영 초대는 보내지 않는다.
- **보존/잔여:** HQ3·stores244·인하대직원10 및 기존 자료/Sheets writer0. admin_users 전체4(HQ3+기존STORE_MANAGER1)는 구분·보존한다. 정본 전체38/완료19/잔여19, 개통 전7·본인확인/승인2·개통후10 유지. 추가 개발(POS/공급사/장바구니/실판매량 어댑터)은 실제 미완료지만 새 메일장애 개통필수조건으로 추가하지 않음. 최종 P0 정상화와 개통은 **NO_GO**: 운영 네 설정 미적용, Hosted 실제 인증 미검증, 승인된 SEC01 운영·실기기/개통·대상 전후 증거 미충족.


## 80. 2026-10-23 UTC — 실제 활성화 결함 수정·v0.356 배포·운영 Auth 현재값·동시 main 판정 보완

- **실제 완료:** [PR#1332](https://github.com/koith/attendance-proto/pull/1332) head cd8075e4f5a9cda1c35236e85f129c76978693f6,108체크 완료(성공93/스킵15)/실패0, 병합9792133ca8daa94d0c2ba0845e835153daccb2f5. 비밀번호 저장 후 응답/대표 지정 요청 유실 시 재시도422/same_password로 막히던 실제 화면을 수정. 코드 수정 전 실패 재현→VM28 PASS, [PR Chromium/WebKit12 PASS](https://github.com/koith/attendance-proto/actions/runs/39977817630/job/120496935581). 취소/만료·권한·동일지점 server 검증 유지.
- **main QA/배포:** [39979608974 attempt2](https://github.com/koith/attendance-proto/actions/runs/39979608974/attempts/2) SUCCESS. 최초 main WebKit 시스템 패키지 다운로드가 Ubuntu azure.archive에서117MB/181종 설치 중4분 timeout(exit124). 앱 실패가 아닌 bootstrap 지연으로 분리하고 실패 작업 대상 재시도; main [job120509496285](https://github.com/koith/attendance-proto/actions/runs/39979608974/job/120509496285)의 Chromium6/WebKit6 실제 PASS 로그 확인(15:49:26~34 UTC). DB/직원·근태·급여·재고·지점레시피 격리 fixture도 SUCCESS. 이전 성공 workflow를 수동 전면 재실행한 것으로 표시하지 않으며 코드 변경의 필수 자동 CI 회귀와 구분한다.
- **운영 웹 배포 실증:** [P039979608751](https://github.com/koith/attendance-proto/actions/runs/39979608751)에서 안전 정적 게시 job120503689327 SUCCESS, 기존 운영 Sheets 포함 일반 build/deploy/validation은 SKIP. [독립39979837619](https://github.com/koith/attendance-proto/actions/runs/39979837619) job120503917144 SUCCESS. index e483be3d2135d381391b1eea427bd351c76fa00e10012d96380676c78c8133ad / owner_activation.html a14456da0b244b1c4ee80e840b02db1be2e5c4471be857e2cbf4dc28503e3b2c / owner_activation.js 16b07e16038d5649e6886a2120496c529cefb81477edcde15c2348338f8484e7 정확 일치. 실제 앱v0.356, 한국어 브랜드 메일 원본은 재제작/변경하지 않음.
- **운영 Auth 네 값은 미적용:** [기존 REVIEW 문맥의 최종 GET](https://github.com/koith/attendance-proto/actions/runs/39962969173)15:47:36 UTC/job120508939561에서 site_url=http://localhost:3000, uri_allow_list="", 제목 You've been invited, 영문 기본 HTML 그대로. before4 SHA d98d4b91f99b92b6fea05732eb90421ccfbad0088281d0309a20fe2b815c5f62. scopedRead=true/scopedWrite=false/legacy=false; production job120509036561도write=false. REVIEW_ONLY/applied=false/patchAttempted=false. 이는 현재 공개4값만 재조회한 것이며 기존 Auth/SMTP·Google E2E를 반복한 것이 아니다. [새 main Hosted GET39979608917](https://github.com/koith/attendance-proto/actions/runs/39979608917)도HTTP200/LOOPBACK/allowlist0/HTML·제목불일치/기본Supabase메일러, strict2/8 확인.
- **운영 변경 범위/최소 조치:** 승인된 Site URL→https://koith.github.io/attendance-proto/, callback→https://koith.github.io/attendance-proto/owner_activation.html, 한국어 제목 및 PR#919 HTML4202bytes만 변경 가능. [공식 PAT문서](https://supabase.com/docs/guides/platform/personal-access-tokens) 각주3에 따라 단일 운영프로젝트의 **Auth Config+Project Settings Read-write** 인증을 기존 SUPABASE_AUTH_WRITE_TOKEN Secret에 안전하게 연결하는 한 가지 조치가 필요. 비밀 원문 채팅/로그 제출이나 읽기 인증 재발급 요청 없음. SMTP/발신자·다른 Auth/보안/계정/권한은 임의 변경하지 않음. 사용자가 보고한 기존 메일 수신을 SMTP 장애로 단정하지 않으며 기본 메일러의 실제 외부 점주주소 수신은 별도 미검증.
- **기존 GitHub 통합 대안도 검토:** 기본 production sync는Auth를무시. 명시remotes 방식도 검토했으나 [공개 기존 CLI Auth updater](https://github.com/supabase/cli/blob/main/apps/cli-go/pkg/config/auth.go)의 ToUpdateAuthConfigBody는 JWT·refresh·가입/비밀번호·MFA·세션 등의 값을 함께 구성한다. 승인 네 필드 부분PATCH를 보장할 수 없어 설정 커밋으로 운영시험하지 않음. 기존 읽기token을 writer로 쓰거나 DB/내부토큰으로 권한 우회하지 않음.
- **동시 main 변화 및 실제 판정 결함:** #1333/Issue1331이 main2217d87ad90ccc753d9e700bcac823e585ca8fc4로 병합하며 Google39981309610을 새로 실행. 이 #1243 작업자가 dispatch한 실행이 아니며 NO_GOOGLE_RERUN 표지 누락으로 실행된 실제 최초오류는 oauth2/v3 HTTP401, Script/Sheets 쓰기 전. 기존39781031886 성공과 runner/Edge/GAS 불변 증거는 유지. 최신 workflow가 FAILURE이면 기존 reader가 자격 preflight 로그를 확인하기도 전에 반환하는 별도 결함을 재현·수정. 정확히 알려진401/토큰만료+immutable runner+실제성공/조상 증거일 때만재사용; 미확인/취소·실제GAS/Sheets/변경source는계속FAIL. 새 회귀 PASS. 로컬 추가 실조회는 Azure 서명로그 저장소에 대한 fetch 제약이 있어 성공으로 표시하지 않으며, 승인 GitHub연결로 같은 실제로그를 확인했고 병합 후 Actions 읽기 전용 게이트에서 최종검증한다. 새 코드로 Google/OAuth/E2E·Pages를 다시 실행하지 않음.
- **보호9그룹 전후 완전 일치:** stores244/HQ3/INHAemployees10/기존attendance236(id≤5578)/payroll0/inventory5/transactions3323/recipeOverrides0/recipeVariants245. HQ digest6112d7a3700c07bdcbb6479149dc21bd. 관리자 전체4(HQ3+기존STORE_MANAGER1)는 별도 보존. 이번 작업의 운영 DML/실초대/계정·권한/READY/SEC01/기존Sheet writer0; 모든 Sheet 셀 hash까지 새로 확인했다고 확대하지 않음.
- **완료와 대기 구분:** 이번 초대 재시도 코드·격리QA·실제웹배포는 완료. 운영 Auth 네 설정 적용/변경후 감사, 승인 수신자의 새 한국어메일→수락→비밀번호→실제관리자 로그인, SEC01 운영승인·실기기, 실제지점·점주·READY개통승인/대상전후증빙은 미완료. POS·배달·공급사·장바구니·실판매수량 어댑터는 개통후 추가개발/실자료검증으로 유지하며 새 개통필수조건으로 추가하지 않음. **전체38/완료19/잔여19(개통전7·본인확인/승인2·개통후10)**, 신규 전체완료 ID0. 최종8항목 개별결과·새PR/CI/병합 SHA는 #1243 최신 연결 댓글로 확정하며 실제 Hosted 인증 미검증 상태에서 GO로 바꾸지 않는다.


## 81. 2026-10-26 — Codex 재개·최초 점주 로그인 복구·최신 개통 상태

- 최신 기준 main3f3d5cdd/v0.363(PR1392·82workflow/Pages40341823100)은 재사용. 과거v0.358 로컬수정은백업하고 최신main에서재개했다. 근무현황·중복정정은PR1381/1383·v0.360·VOID_ADD124/125로이미완료, 실제DB에서ADD108/109취소와원본5590/EDIT_TIME107보존을확인해반복하지않았다.
- **새 실제 결함 수정:** 일회용recovery링크소비후새로고침/초기통신실패시인증이사라져진행불가하던2건을수정전FAIL재현했다. 한탭에토큰만최대1시간보존하고 실제Auth사용자/서버초대·동일지점을재검증한다. 취소/만료/다른사용자·지점은실패및캐시제거. access만료는refresh1회만허용하고갱신사용자도동일해야한다. 비밀번호저장0, 기존HQ세션교체는실제권한+새비밀번호로그인성공후에만수행.
- **코드QA:** 새session복구9/기존password재시도4/정적운영무쓰기배포범위4 =17PASS. 기존임시점주보안계약·Google/Pages무쓰기guard·YAML/diff PASS. 실제메일송수신/개인비밀번호/실점주세션PASS와구분한다. 배포후운영자산해시/신규3개파일공개바이트확인절차를기존정적Pages/독립검증에연결했다.
- **읽기전용실상태:** store80 REAL_1 STAGED/비활성, admin_users0/primary_owners0. 실제점주의유효링크수신·본인비밀번호확정·실로그인/대표등록 및 HQ개통승인은미완료다. PR1365의READY/대표확정가정은현재DB와달라최신Edge재대조전병합/실Sheets생성을실행하지않는다. PR1361대체GAS메일경로403미완료를Native Auth실메일상태와혼동하지않음.
- 후보버전v0.364, 실제PR/CI/병합/배포증거는Issue1243후속체크포인트로확정. 운영DB쓰기·실초대/권한/READY/SEC01·기존Sheets변경0. TinyFish/결제/완료Google E2E재실행0.
- 실제수용조건이남아전체38/완료19/잔여19유지, 전체완료체크0. 기술준비/실인증·승인/개통후추가자동화를 `docs/qa1243-owner-opening-readiness.md`에분리했다.

## 82. 2026-10-26 — v0.364 실제 배포·독립 검증 및 남은 개통 조건

- PR1394/main e79ca85a0040f969201ac738c4f6fa8813893bd6 병합. Pages40362549251/독립40364553260 성공. 실제 공개 index·점주콜백HTML/JS 바이트일치와 다른운영자산불변 확인; operating Sheet writer jobs skipped, mailSent=false. 새로운점주세션복구17개QA PASS를 개인메일수신/본인로그인 성공으로 확대하지않음.
- 최신개통40364573219 6/8 NO_GO. STORE_E2E/MANAGER_POSTGRES/HQ_STORE_POSTGRES/TEST_MAIL_GOTRUE/PAGES_PUBLISH/INDEPENDENT_PAGES PASS, HOSTED_AUTH_READ/LIVE_EDGE_GAS_SHEETS FAIL. 실제수신/실관리자세션/SEC01실기기승인/대상작업전후운영증빙4조건 미충족유지.
- Hosted GET40358247538 HTTP200/strict4/8: 운영Site URL·정확한복귀URL정상, 한국어HTML·제목불일치, SMTP host·발신자미설정. DEFAULT_SUPABASE_MAILER/HookOFF. 기본메일수신보고를SMTP장애로단정하지않음.
- 기존four-field REVIEW39962969173의재실행(job121738176917/121738303790)은저장소·production에서scopedRead=true/write=false/legacy=false를실제확인. CLI401뒤정상GitHub연결로전환했으며읽기인증재발급요청0/APPLY0. 승인네필드적용에는단일프로젝트 Auth Config+Project Settings Read-write writer가필요하고 SMTP공급자/발신자는별도승인범위.
- Google39781031886성공은삭제/실패처리하지않음. 원성공SHA50690f26→e79ca85a 비교142파일중실행Edge두경로가변경됐으므로현재소스통신PASS로재사용불가. 기존실패GAS403/GoogleOAuth자격범위부족을모의성공으로대체하지않고, 완료Google E2E재실행0.
- 실제독립검증40342537778은Playwright1.55.1/ubuntu26.04미지원이원인. 지원ubuntu24.04로고정하고점주정적독립검증완료→기존개통게이트자동갱신·실제콜백HTML/JS공개해시확인을추가. CI-only 수정으로앱v0.364/운영데이터/Sheets/메일/Auth/권한/READY/SEC01은변경하지않음. 관련실제guard/evidence QA와YAML/diff PASS; 후속PR/CI/병합은Issue1243증거연결.
- 정본38/완료19/잔여19유지. 개통전7·본인확인/승인2·개통후10을구분하며, 이번기술결함수정만으로전체수용완료체크하지않음.

## 83. 2026-10-27 — 실제 대표 인증 성공·지점 개통 승인 분리

- 사용자 실제 최신 메일 클릭 후 비밀번호 설정 완료. store80/webuielf UID488139db-b765-4843-922d-481f7ca0bd3e의 admin_users1·primary_owners1, 임시 claim삭제, 이메일확정, 새 last_sign_in_at2026-10-27T05:40:36.091149Z를운영읽기로확인했다. 대표등록·새비밀번호로그인은성공이며재초대/재설정할필요없다. 수신자본인비밀번호를AI가조회/설정하지않음.
- 지점은STAGED/is_active=false다. 기존READY가드가운영메뉴를막는상태를계정인증실패로오판하지않는다. 현재1호점/id80의latest provenance VERIFIED·sample직원0/전체직원0·확정대표1 조건을읽기로확인. source_store_key=official_demo를실제운영원본으로임의변경하지않음. READY전환은별도본사승인전금지.
- 사용자화면오해수정(v0.367후보): 계정등록과지점운영승인은별도이며이미비밀번호/등록을완료했다면재설정·재발송불필요하다고안내. 익명/미확인계정의등록성공을단정하지않는다. READY/지점격리/라우트차단/권한/서버코드는불변이고정적HTML3줄(버전2·안내1)만변경한다.
- 엄격한기존정적Pages경로에이번정확한3줄·5파일범위만허용. 마커5개/실제diff확인·예상외라우트변경거부·DB/Edge/다른운영자산거부테스트6PASS. 기존READY격리·boot/startup·운영무쓰기guard PASS. 실제게시전후다른운영자산해시와index/점주HTML·JS공개바이트를독립검증한다. PR/병합/실배포결과는Issue1243에연결하며후보를미리운영버전으로보고하지않는다.
- 기존PR1397/v0.366·PR1400병합은반복하지않았다. 실제운영한국어recovery메일2필드적용40429637097 재시도는repository122029380725·production122029464698 모두 RECOVERY_AUTH_WRITE_CREDENTIAL_ABSENT/applied=false. 새메일발송0, 실제권한부여는수신자의정상기존인증절차결과이며AI운영DML/AuthPATCH/비밀번호설정/READY/SEC01/Sheets쓰기0.
- 전체38/완료19/잔여19유지. QA04전체수용/한국어운영메일/보조관리자실세션/SEC01실기기/실근태·급여·시트현장수용을이번대표1명인증으로일괄완료하지않음. 본사개통승인전전체개통GO로바꾸지않는다.

## 84. 2026-10-27 — 승인된 1호점 실제 활성화·대표 수락 후 자동 개통 개발

- 사용자 “1호점 활성화 해” 명시 승인에 따라 store80/REAL_1/1호점을 STAGED,false에서 READY,true로전환·커밋했다. 대표UID488139db-b765-4843-922d-481f7ca0bd3e의확정메일/개인암호/대표연결·provenance VERIFIED·샘플직원0을재검사하고, 다른지점/전체관리자·대표연결/직원/recipe_versions/recipe_components6그룹전후해시동일과대상기타필드불변을트랜잭션에서확인했다. 실제앱 list_stores HTTP200에도store80 active=true노출확인. 보호244/HQ3/인하대직원10/실레시피136 유지. HQJWT조작/기존계정·암호·Sheets/SEC01변경0.
- 본사대표초대후수신자암호설정이끝났는데다시운영승인으로막히는경험을수정중이다. 본사의새초대에만 auto_open_after_accept 승인을기록하고개인암호검증·대표등록과같은트랜잭션에서조건충족지점만개통한다. 기존초대는DEFAULTfalse, 취소·만료·중지·반려·권한회수·타지점/보조는자동개통하지않는다. 두HQ초대경로를canonical로통일하고기존미배정계정은본인인증메일로연결한다. 재발송은새승인/기한연장을하지않는다.
- 브랜치 feature/qa1243-approved-owner-auto-opening/base0362f205. CLI가생성한마이그레이션20261027070217_approved_owner_auto_opening.sql과격리PostgreSQLfixture/전용CI를준비했다. 로컬HQ요청body/재발송/보조·개인암호4/세션9/기존대표보안계약·canonical/Edge미러6파일검사는PASS. 새SQL의실제실행·전체CI·병합·SQL/Edge/Pages배포는후속증거전완료로보고하지않는다. 현재운영앱은v0.367이며개선배포후보는v0.368이다.
- 새개발로실메일/운영Sheets/Google E2E를재실행하지않는다. 원장38/완료19/잔여19유지. 1호점시험운영활성화완료와전체실지점개통·메일브랜드·Google현재소스·SEC01/현장수용의미완료를구분한다. 후속PR/CI/실배포증거는Issue1243에연결한다.

## 85. 2026-10-27 — 1호점 시험 중 인하대점 전환·직원 노출 P0 수정

- 사용자 실제 보고: webuielf/1호점 시험 중 지점명이 인하대로 바뀌고 인하대 직원이 보임. 운영 조회에서 계정은 store80 STORE_MANAGER/primary_owner만 있고 HQ/다른지점 역할 없음, store80 READY/직원0, 인하대 직원10 보존. 앞선 활성화 완료를 격리 수용 완료로 확대하지 않는다.
- 실제 경로: 근무현황 닫기에서 index.html#pos로 지점 번호를 버리고, 루트의 기본 지점1 공개 POS로 이동한다. 수정 전 실제 init의 닫기 동작으로 index.html#pos를 재현했다. 서버 list_store_employees는 can_manage_store로 지점 일치·READY/확정 Auth를 검사하며, 기존 공개 POS 카드 정책은 별도 SEC01 범위로 유지한다. 관리계정의 타점 사원·급여 권한이 생겼다고 단정하지 않는다.
- 수정: 근무현황 진입·직원 PIN 진입·로그인 복귀·닫기에 지점 번호를 유지한다. 일반/다른 지점 URL로 들어온 로그인 점주는 공개 직원 조회 전에 서버 admin_context의 자기 지점으로 이동한다. 인증/권한 조회 실패는 인하대 공개 POS로 복구하지 않고 차단한다. 근무현황은 URL/저장소 기본값1 대신 현재 서버 계정 지점을 확인하고, 역사 이름 복구 두 경로도 같은 scoped RPC만 사용한다. HQ의 명시적 지점 선택과 직원 본인 PIN 흐름은 유지한다.
- 회귀: 수정 전 닫기 주소·권한 없는 루트 진입을 포함한 7개 FAIL 증거를 남기고 수정 후7PASS. 배포 범위4/기존 근무현황·직원 신원·READY/Google·운영무쓰기 guard PASS. 실제 운영 데이터·권한·메일·SEC01·Edge·Sheets 코드 변경0. 최신 Chromium/WebKit 실제 페이지/다른 지점 캐시/근무현황 닫기/회수된 계정 검증은 PR CI에서 확인한다.
- 긴급 브랜치 fix/qa1243-store-navigation-isolation/base0362f205, 후보v0.368. 자동개통 개선 PR1404/61ff858c는 draft로 보존하고 이번 격리 수정 배포가 우선이다. 병합·Pages·독립 공개 바이트 검증 전까지 이번 수정의 운영 수용은 NO_GO. 원장38/완료19/잔여19 유지. 실제 PR/CI/배포와 보호 데이터 전후 결과는 Issue1243에 연결한다.


## 86. 2026-10-27 — v0.368 지점 복귀·계정 scope 긴급 수정 배포 완료

- **실제 병합:** [PR1405](https://github.com/koith/attendance-proto/pull/1405), head f88f223c2dd0c38a8b7cc6d9b0200037b6a2b57b → main ec525d78503ca5e649b4a37c0e2a60c17b686286(09:28:32Z). 최종 PR 체크112/성공95/의도된 스킵17/실패0. WebKit 설치 mirror azure.archive 다운로드240초 초과(exit124)는 앱 실행 전 외부 준비 실패로 구분하고 해당 통합job만 재시도; [최종 통합40476314281 attempt2](https://github.com/koith/attendance-proto/actions/runs/40476314281/attempts/2) 성공. 53개 source/policy·실제 격리 PostgreSQL·연속 브라우저 QA 통과. 실패 검사를 무시하거나 제거하지 않음.
- **새 요구사항 실증:** [40476314638/job122095303564](https://github.com/koith/attendance-proto/actions/runs/40476314638/job/122095303564)의 Chromium/WebKit × 393/1280px × 일반주소/타점주소/근무현황닫기/옛저장소/타점근무현황/회수계정/HQ =28/28 PASS. 타점 직원·이벤트 요청 전 차단, 자기 지점 복귀, 기존 mobile/desktop 관리자 권한·격리도 같은 실행에서 PASS. 실제 HTML/JS를 실행하되 모든 외부 요청은 합성 interception; 실제 수신자 세션으로 로그인했다고 확대하지 않음.
- **실제 정적 배포:** [P0 Pages40481055741](https://github.com/koith/attendance-proto/actions/runs/40481055741), 안전 게시 job122116609604, 09:41:38Z 성공. [독립40482731211/job122116824040](https://github.com/koith/attendance-proto/actions/runs/40482731211/job/122116824040)09:41:54Z 성공. 공개 index SHA256 5ddbc196272ce5ea292997e787c316836034345f2d873fc37685a4a34a3f7a2d / actual_attendance.html a5776ddd18011c23e55923340f6d61308c9769aa11c47ebe7a9b8a00e56279de / actual_attendance.js 3d4fb7df7e83a101887a5c8f4e3371ab65e399b3f5d8f9b99c610fc2550e0f97 정확 일치. 기존 HQ·초대·레시피·운영JS·근무현황CSS10자산 전후 바이트 불변. HTML의 JS/CSS cache 주소만 같은 새 버전으로 갱신했고 레이아웃/CSS 계산은 변경0.
- **운영 보존:** 긴급 수정 전후 stores/admin_users/primary_owners/employees/recipe_versions/recipe_components6그룹 전체 row digest 완전 일치. stores244/HQ3/인하대 직원10/활성 실메뉴136/store80직원0. 실메뉴의 역사 포함 version137행과 활성136종을 구분한다. store80=1호점/REAL_1/READY,true, webuielf는 store80 STORE_MANAGER+대표만 유지. 운영 DB DML/SQL schema/권한/초대메일/Auth설정/Edge/SEC01/기존Sheets 직접쓰기0.
- **자동화 실행의 실제 의미:** 운영 Sheets writer가 있는 일반 Pages build/deploy/validation3job은SKIP. Google40481055423의 job이 success여도 실제 service-to-service 실행 step은SKIP이며 새 Google E2E 성공이라고 보고하지 않는다. recovery메일게시40482731217의 실발송도 실행표지 없어SKIP. 기존 Google 성공은 재실행하지 않음.
- **현재 판정:** 이번 계정의 잘못된 지점 전환 결함은 수정·QA·병합·실배포/독립 검증 완료. 1호점은 활성 상태이며 새 비밀번호 설정·재초대가 필요하지 않다. 실제 사용자의 배포후 재확인은 아직 대신 통과시키지 않는다. 본사 사원·급여 scoped RPC의 서버 can_manage_store는 기존대로 유지; 익명 공용 POS의 기존 공개 직원 표시 정책을 SEC01 승인 없이 비공개로 바꿨다고 주장하지 않음.
- **전체 개통 게이트는 별도 NO_GO:** [40482763799](https://github.com/koith/attendance-proto/actions/runs/40482763799)5/8: STORE_E2E/MANAGER_POSTGRES/HQ_STORE_POSTGRES/PAGES_PUBLISH/INDEPENDENT_PAGES PASS; TEST_MAIL_GOTRUE는 기존39377974348 증거 기한 경과(RUN_STALE_OR_INVALID_DATE), HOSTED_AUTH_READ는 실제 한국어 메일 설정 미충족, LIVE_EDGE_GAS_SHEETS는 현재 소스의 실제 성공 증거 부재. 새 합성28PASS나 실제 대표1명 수신을 전체 Hosted SMTP/권한회수/SEC01/현장수용 PASS로 바꾸지 않는다.
- **보존한 잔여:** 자동개통 개선 PR1404/61ff858c는 draft로 보존·미배포. 이 긴급 main 이후 재동기화/다음 버전/배포 경계 재검증이 필요하다. 한국어 운영 메일 적용 권한·GAS 소유자 인증/실통신·SEC01 운영 승인·보조 관리자 실세션/현장 수용은 별도 남음. POS/공급사/장바구니 등의 추가 자동화는 개통 이후 개발로 구분한다. 정본 전체38/완료19/잔여19 유지.

## 87. 2026-10-27 — 대표 초대·본인 비밀번호 설정 후 즉시 개통 운영 적용 재개

- 사용자 원문 “실제로 적용해”에 따라 보존 PR1404/61ff858c를 최신 main3ef375e7(v0.368)과 통합했다. 기존 작업공간은 보존하고 release/qa1243-approved-owner-v369 새 worktree에서 개발한다. 근무현황 복귀/초기 admin_context 지점 격리 코드는 main과 정확히 동일하고 후보 index 변경은 버전v0.369·HQ 캐시3곳뿐이다.
- 새 본사 대표 초대 확인창은 이메일 발송과 수신자 인증 후 개통까지 승인하는 동작임을 명시한다. service-only 승인 claim에만 auto_open_after_accept=true를 저장하고, 이메일 확정·현재 개인 비밀번호 검증·대표 등록·지점 READY를 한 트랜잭션으로 처리한다. 수락 시에도 원래 본사 승인자·실재 검증·샘플 제외·STAGED 조건을 다시 확인한다. 기존 claim 기본false/보조/취소·만료·중지/타지점/권한 회수는 소급 개통하지 않는다.
- 새 임시/기존/native 초대를 하나의 HQ 대기 목록·취소 경로로 연결했다. 재발송은 역할·지점·승인·만료기한을 유지한다. 비밀번호 저장/완료 응답 유실 재시도는 실제 암호·기존 대표 연결을 확인하며 새 권한을 부여하지 않는다. 수락 후 POS 대신 해당 지점 #admin으로 이동한다.
- 실제 검증을 확장했다. 기존 격리 GoTrue+Mailpit+PostgREST+PostgreSQL 환경에 새 migration을 설치하고, 새 native 이메일 수신·개인암호·실제 로그인JWT·즉시READY와 기존 계정 복구메일·UID보존·새암호·즉시READY/타점거부 두 시나리오를 추가했다. 기존 8개 증거와 별도 필드로 기록하고 새2개가 같은head에서 실제 통과해야 한다. Google/Hosted운영 초대 없이 실행한다.
- 로컬 release guard7/기존 v0.368 guard4/지점복귀7/본사 body·기존 인증/증거 검증·YAML PASS. 기존 v0.368 배포 보호 guard는 완화하지 않고 테스트만 정확한 이전 index를 재구성해 검증한다. Supabase 현재 schema/ACL·관리읽기 연결·native Edge71 ACTIVE를 확인. 아직 새SQL/Edge/Pages 적용 전이며, CI/병합/실배포 결과는 Issue1243 후속증거로 확정한다.
- 적용 범위는 기본false 승인컬럼2개와 제한된 RPC, owner issue 분기 및 HQ/콜백 정적 자산이다. 다른 Edge·급여·Google writer 코드는 바이트 불변. 기존 운영자료/계정/초대·SEC01/다른 지점 READY/실메일/Sheets 직접쓰기 금지. 전체38/완료19/잔여19 유지, 실제수신자 수용을 합성QA로 통과시키지 않는다.

- CI 실행797b0d7a에서 새 실제SMTP/Auth/JWT/PostgREST2/2와 실제SQL/전체연속브라우저/P0는통과. 별도Chrome/WebKit job122139109478만azure.archive.ubuntu.com OS패키지다운로드가12분초과해앱실행전cancelled. 공식Playwright v1.55.1-noble 이미지에포함된동일버전브라우저/라이브러리를재사용하도록해설치지연을해결하고모든동일검사를유지한다. Python별도설치대신Node표준HTTP로127.0.0.1정적preview만구동한다. 운영앱/SQL/Edge소스는변경없다.

- 추가 실제 결함 수정: 취소 후 아직 미인증된 기존Auth계정을 신규대표경로가 confirmed+password lookup으로잘못보내재초대를거부했다. 실제Edge분기VM에서FAIL재현후기존UID의native claim을메일전에검증·등록해재초대/비밀번호미설정복구를지원한다. 이미다른지점/역할/초대가연결된계정은메일전에거부하고기존Auth를삭제/초기화하지않는다. Recovery콜백은같은임시설정화면에서server native preflight로만검증해native complete로연결한다. 취소후재초대·confirmed passwordless recovery까지실제SMTP/Auth/JWT 시나리오를4개로확장하고완료전동일head PASS를확인한다.


## 88. 2026-10-27 — v0.369 대표 초대·본인 암호 설정 후 즉시 개통 실제 운영 반영 완료

- **실제 병합·검증:** 사용자 “실제로 적용해” 지시에 따라 [PR1404](https://github.com/koith/attendance-proto/pull/1404)를 정상 병합했다. 최종 head656be9d05ea8113d7444bd06402b08254cba191b → main d0a1d2b3c17418113e9e22a8bcca18040a8b2399. 최종125check=성공101/의도된skip24/실패0. [P0 40494894249](https://github.com/koith/attendance-proto/actions/runs/40494894249), [실제SQL 40494893911](https://github.com/koith/attendance-proto/actions/runs/40494893911), [전체연속브라우저40494891253](https://github.com/koith/attendance-proto/actions/runs/40494891253), [분리Chrome/WebKit40494891150](https://github.com/koith/attendance-proto/actions/runs/40494891150) 모두PASS. 기존 v0.368 지점복귀/계정scope 수정은 그대로 보존했다.
- **변경한 실제 절차:** 본사가 신규 지점의 실재 검증과 개통 조건을 확인하고 새 대표 초대 확인창에서 개통까지 승인 → 수신자 이메일 인증·개인 비밀번호 설정 → 현재 Auth 암호 검증·대표 관리자 등록·해당 지점 READY를 동일 DB 트랜잭션으로 완료 → 해당 지점 #admin 진입. 같은 본사 승인을 수락 후 다시 요청하지 않는다. 기존 초대는 기본false로 소급 개통하지 않으며 보조/만료/취소/중지/타지점/회수된 본사 승인은 개통할 수 없다. 재발송은 기존 UID·지점·역할·승인·기한을 보존하고 새 승인으로 바꾸지 않는다.
- **실제 인증 증거:** [40494891479/job122157730545](https://github.com/koith/attendance-proto/actions/runs/40494891479/job/122157730545)의 격리 GoTrue·Mailpit SMTP·JWT검증 PostgREST·PostgreSQL에서 새4경로 모두 실제 메일→비밀번호 저장→실제 암호 로그인→READY PASS: 신규 native, 기존 계정 복구, 취소 후 동일UID 재초대, confirmed passwordless 복구. 기존8개 권한·역할 증거와 별도로 기록했다. provider-only 초기 계정 fixture만 localhost 격리DB에서 구성했으며 이후 통신은 실제다. 운영 수신자의 새 초대 수락을 대신 통과 처리하지 않는다.
- **실제 운영 SQL:** 검증 파일20261027070217_approved_owner_auto_opening.sql(SHA256030ef3ac9f38aa6ba0d684ed852c2f1e6993ae43cd34d632c733561b939395cb)을 Supabase apply_migration으로 반영했다. 운영 이력 version20261027112218/name approved_owner_auto_opening. 승인 컬럼2개 NOT NULL DEFAULTfalse, 함수13개 live body_md5 정확 일치, 익명실행0/비공개helper 일반실행0/service전용보호를 재조회했다. migration 자체는 기존 운영row를 변경하지 않는다. 기존 완료RPC4개와 Edge71의 복구 근거를 보존했다.
- **실제 서버 배포:** [공식 native Edge 영수증40495737989/job122160735823](https://github.com/koith/attendance-proto/actions/runs/40495737989/job/122160735823) SUCCESS. server-sync-sheet v72 ACTIVE, 배포6파일이 병합 소스와 정확 일치하며 owner issue 분기 외 Edge 본문과 나머지5파일은 이전과 동일하다. 기존 verify_jwt 설정은 불변이고 기존 커스텀 Auth 검증을 유지한다. 인증 없는 급여 요청 거부도 영수증에서 확인했다. 운영 Auth Hook/SEC01/SMTP설정 변경0.
- **실제 화면 배포:** [Pages40495737805/job122161164059](https://github.com/koith/attendance-proto/actions/runs/40495737805/job/122161164059)20:24:51 KST SUCCESS; [독립40495969843/job122161375596](https://github.com/koith/attendance-proto/actions/runs/40495969843/job/122161375596)20:25:04 KST SUCCESS. 공개 v0.369 index/HQ2/콜백HTML·JS4 총7자산이 소스와 일치한다. index SHA256446e6eb3617e7b2b1ccbc99080bf81dd0dc1dadfce13c8f3b16752a40b753d32. 운영JS·근무현황HTML/JS/CSS·레시피JS/CSS6자산 전후 바이트 불변. 운영Sheets writer가 있는 일반 build/deploy/validation3job은SKIP, 새Google/실메일 실행0.
- **운영 보존:** SQL전→직후→Edge/Pages후 stores/admin_users/store_primary_owners/employees/recipe_versions/recipe_components/temp_claims/native_claims 8그룹 전체row digest 완전일치. 지점244/HQ3/인하대직원10/활성실메뉴136/1호점직원0 유지. store80=1호점/REAL_1/READY,true와 기존 대표연결 그대로다. 기존 Auth 계정·비밀번호·권한·지점상태 변경, 실제초대, 운영Sheets 직접쓰기0. Supabase advisor의 기존 RLS60/익명definer21/암호보호1은 불변; authenticated definer199→201은 HQ전용 대기목록·취소2함수의 의도된 호출경로이며 실제 HQ확정메일/활성계정 조건과 타역할 거부를 SQL QA로 확인했다.
- **해결한 검사 장애:** Azure Ubuntu OS패키지 다운로드240초 초과를 공식 Playwright1.55.1-noble 사전설치 이미지로 해결했고 Chromium/WebKit 모든 시나리오를 유지했다. 관리자 직원카드 생성 후 subnav 생성 전에 내용을 읽던 별도 smoke의 경합도 실제 route완료 표시를 기다린 뒤 정확히3탭·타점요청0을 검사하도록 수정했다. 실패를 스킵하거나 보안 검증을 제거하지 않았다. 기존 dirty worktree와 수정본은 보존했다.
- **판정 구분:** 이번 자동개통 기능은 CODE_VERIFIED→MERGED→DEPLOYED 완료, 운영 실제 수신자의 새 초대 수용은 별도 미검증이다. 전체 개통 [40496013962](https://github.com/koith/attendance-proto/actions/runs/40496013962)은5/8 NO_GO: STORE_E2E/MANAGER_POSTGRES/HQ_STORE_POSTGRES/PAGES_PUBLISH/INDEPENDENT_PAGES PASS; TEST_MAIL_GOTRUE=이전Hosted증거기한경과, HOSTED_AUTH_READ=한국어메일설정미충족, LIVE_EDGE_GAS_SHEETS=현재소스실통신증거부재. 격리4PASS를 운영메일브랜드·GAS·SEC01/실세션수용 성공으로 바꾸지 않는다. 한국어 운영메일 writer권한, GAS소유자 인증·실통신, SEC01승인·실기기, 보조관리자실세션/현장수용과 개통후 POS·공급사·장바구니 자동화는 별도 잔여다. 정본 전체38/완료19/잔여19 유지, 이미완료된 Google/OAuth/과거배포를 반복하지 않았다.


## 89. 2026-10-27 — webuielf 재초대 시험을 위한 대표 해제·1호점 개통 취소 완료

- **사용자 명시 승인:** “webuielf지메일을 … 새로 수정한 방식대로 테스트 … 먼저 webuielf의 대표 관리자 해제”, 이어서 “대표 관리자 해제이기 때문에 해당 지점도 같이 개점이 취소되어야”. 앞선 §88의 READY 보존 기록 이후 이번 요청으로 대상 상태를 바꾼 것이며 과거 증거를 덮어쓰지 않는다.
- **실제 반영:** 운영 DB관리 연결의 단일 REPEATABLE READ 트랜잭션에서 기존 관리자변경 advisory lock과 대상계정/지점 row lock을 취득했다. store80/REAL_1/1호점·webuielf UID488139db-b765-4843-922d-481f7ca0bd3e의 정확한 기존 대표1/STORE_MANAGER1과 유일 지점연결을 확인하고, 해당 대표·관리자·기본권한1을 해제했다. 같은 트랜잭션에서 READY,true→STAGED,false로 개통을 취소했다. 지점을 삭제하거나 자료를 초기화하지 않았다.
- **세션·권한 확인:** 대상 기존 세션3/갱신토큰6을 정리했고 재조회0/0. 대표/관리자/위임권한/membership/임시·native초대 모두0. 별도 READ ONLY authenticated PostgreSQL역할 검사에서 admin_context의 role/store/email=NULL, can_manage_store(80)=false/인하대(1)=false를 확인했다. 이는 DB역할 검증이며 실제 수신자의 JWT·비밀번호로 HTTP 로그인했다고 표시하지 않는다. 권한행을 제거해 남은 access JWT의 관리자 권한도 복구되지 않는다.
- **보존 검증:** 변경 전후32그룹 전체 row digest를 트랜잭션 내부에서 비교하고 불일치 시 전체 ROLLBACK하도록 실행했다. 타지점·타계정권한/세션/초대, 모든 Auth계정/개인암호, 직원·근태·정정·급여·재고·레시피·실재 확인 이력은 동일하다. 대상 지점은 상태/active2필드 외 불변. 지점244/HQ3/인하대직원10/활성실메뉴136/store80직원0 유지, Auth UID·확정이메일·개인암호·지점 provenance VERIFIED 보존. 공개 list_stores에서도 비활성 1호점은 제외된다.
- **다음 시험 준비:** 대표 공석·STAGED/비활성·기존 미배정 Auth계정·검증된 실제 지점 조건을 확인했다. 이후 본사의 새 대표 초대에서 개통을 승인하고 수신자가 메일 인증·새 개인암호 설정을 완료하면 v0.369 흐름으로 대표등록+READY가 함께 처리된다. 이번 요청에서는 새초대/실메일발송/비밀번호초기화/계정삭제/SEC01/운영Sheets변경0. 기존초대·자동개통 QA/Google E2E/Pages배포는 반복하지 않았다.
- **버전·증거:** 앱 v0.369·Edge72 유지, 기능배포는 PR1404/main d0a1d2b3와 Pages40495737805/독립40495969843를 재사용한다. 이번 운영조치와 검증은 Issue1243의 최신 명시승인/결과 댓글에 기록했다. 문서전용 PR로 원장만 갱신하며 앱/서버를 재배포하지 않는다. 전체38/완료19/잔여19 및 전체개통5/8 NO_GO의 별도 세 조건은 그대로다.


## 90. 2026-10-27 — 본사 대시보드의 기존 대표 재초대 경로 점검·수정

- 사용자 요청은 본사 계정으로 대시보드에서 webuielf 새 초대를 보내기 전에 정상 동작을 시험하는 것이다. main c85079f5/v0.369, store80 STAGED,false/대표·관리자·대기초대0/기존 확정계정·개인암호·VERIFIED/HQ3 조건을 운영 읽기로 확인했다. 이번 검증 중 실제 webuielf 초대나 개통·계정 변경은 하지 않는다.
- **실제 결함:** 본사 대표 콘솔의 기존 계정 연결 버튼은 OWNER에도 메일 없이 직접 연결 RPC를 호출했고, 별도 개통 패널은 기존 점주 지정 RPC를 사용했다. 새 메일·개인암호·동시개통 흐름을 우회할 수 있었다. 수정 전 실제 클릭 handler를 VM으로 실행해 해당 회귀 FAIL을 남겼다.
- **수정:** 대표는 신규/기존 모두 '대표 초대·개통 승인 메일 발송'으로 처리하고 메일 없는 연결 버튼은 보조 역할에서만 표시한다. 대표의 옛 버튼을 프로그램에서 호출해도 현재 승인 확인창과 canonical 메일 발송 함수로 연결한다. 보조의 기존 계정 연결은 명시 ASSISTANT 전용 RPC와 기본 권한 없음으로 보존한다. 인덱스는 후보 v0.370 및 HQ 캐시만 변경하며 지점 격리/근무현황/콜백/Edge/SQL은 그대로다.
- **현재 QA:** 두 실제 클릭 handler의 대표 재초대/확인창 취소/전송 실패/기존 보조 연결8PASS, 정적 배포 범위5/역사 v0.368·v0.369 guard/변경된16개 관련 source·receipt·boot QA/YAML PASS. 브라우저는 두 실제 HQ 모듈 × Chromium/WebKit ×320/393/1280 × 기본/옛버튼24가지를 합성 HTTP로 검증한다. 실제 격리 Auth 기존계정 시나리오도 이전 대표 인증·개통 완료→해제·STAGED·세션 정리→같은UID 조회·복구메일→새암호·로그인·READY로 확장했다. CI/병합/실제 정적 게시 전에는 운영 수정 완료로 보고하지 않는다.
- **안전:** 새 정적 마커는 정확한 main/검토된3자산 바이트와 변경 파일 목록을 검사하며 SQL·Edge·다른 운영 자산을 허용하지 않는다. 기존 운영 Sheets writer와 Google E2E를 호출하지 않는 Pages 경로 및 3자산 공개 바이트/10기존자산 불변 독립 검증을 사용한다. 앱 버전 후보와 실제 배포 버전을 구분한다. 정본38/완료19/잔여19 유지, 전체개통의 별도3미충족 조건을 성공으로 바꾸지 않는다.


## 91. 2026-10-27 — 본사 기존 대표 재초대 사전 시험·v0.370 운영 게시 완료

- **실제 수정·병합:** [PR1409](https://github.com/koith/attendance-proto/pull/1409), head32a520a12bb08227a574799120ce572de845a8e9 → main2cea1178162229fb2d015c96bd0bafa6b6bb3b85. 최종113check=96성공/17의도된skip/실패0. 본사 두 화면에서 대표의 메일 없는 기존 계정 연결을 없애고, 옛 버튼 프로그램 호출도 현재 초대·개통 승인 확인창으로 연결한다. 보조는 ASSISTANT 전용 기존 계정 연결과 기본 권한 없음으로 유지한다. 본사 화면에는 대표 초대·개통 승인 메일 발송을 표시한다.
- **실제 UI 검사:** [40499535074/job122173442718](https://github.com/koith/attendance-proto/actions/runs/40499535074/job/122173442718)에서 실제 두 HQ JavaScript 모듈 ×Chromium/WebKit ×320/393/1280px ×기본/옛버튼24/24 PASS. 모든 HTTP는 합성 fixture로 제한했고 직접 OWNER 연결 요청0, 단일 이메일 요청의 지점/이메일/auto_open_after_accept=true·명시 개통 확인창, 발송 후에도 STAGED/비활성·대표 미확정을 확인했다. 실제 click handler의 취소/실패/기존보조 포함8회귀도PASS.
- **실제 격리 인증 검사:** [40499533530/job122173438218](https://github.com/koith/attendance-proto/actions/runs/40499533530/job/122173438218)의 공식 GoTrue+Mailpit SMTP+JWT검증 PostgREST+실제SQL에서 기존 계정 경로를 '과거 대표로 인증·개통완료→명시 해제·STAGED·세션정리→구 JWT 관리자권한false→동일UID 기존계정조회→새복구메일→새개인암호→실제로그인·READY'로 확장해PASS했다. 처음부터 미배정이었던 계정 테스트로 대체하지 않았다. 새 native/취소된미인증재초대/passwordless 경로도PASS. 운영 본사계정/실수신자의 새메일 수신·수락을 대신 수행한 것이 아니다.
- **실제 배포·독립 검증:** [Pages40499863351/job122175094663](https://github.com/koith/attendance-proto/actions/runs/40499863351/job/122175094663)20:59:08 KST SUCCESS, [독립40500241127/job122175826312](https://github.com/koith/attendance-proto/actions/runs/40500241127/job/122175826312)20:59:20 KST SUCCESS. 공개 v0.370 index/HQ콘솔/HQ개통UI3자산 정확일치, index SHA256d869110c8743d86f448159f214286707ae9a5f1ab9cf1370f14685284fff6e11. 기존 콜백HTML/JS4·운영JS·근무현황HTML/JS/CSS·레시피JS/CSS 총10자산 전후 바이트 불변. 기존 운영 writer를 포함하는 일반 Pages3job은SKIP. SQL/Edge코드·인증설정 변경0, Edge72 ACTIVE/6파일 모두 이전과 동일. 새Google E2E/운영Sheets직접쓰기/SEC01/실메일발송0.
- **운영 준비·보존:** 작업 전/병합 후/게시 후8그룹 전체row digest 일치, 244지점/HQ3/인하대직원10/활성실메뉴136/1호점직원0. 검증 시점 store80 REAL_1/1호점은 STAGED,false, webuielf 대표·관리자·대기초대0, 확정이메일·개인암호·VERIFIED 이력 유지. 실제 HQ목록/sample 판정은 source_store_key가 demo_%가 아닌 지점을 포함하므로 official_demo인1호점이 숨겨지지 않음도 정의·실데이터로 확인했다.
- **사용자의 실제 시험 절차:** 본사 계정 로그인→지점 관리→1호점→관리자 초대→대표 관리자→webuielf@gmail.com→대표 초대·개통 승인 메일 발송→확인창 승인. 기존 계정은 Supabase 복구메일('비밀번호 재설정')로 올 수 있으며 최신메일 링크에서 기존것과 다른12자이상 개인암호를 설정하면 대표 등록·개통·해당지점관리화면 진입이 이어진다. 메일 발송만으로 개통하지 않는다. 이번에는 사용자 대신 새 운영메일을 보내거나 지점을 재개통하지 않았다. 운영 한국어 메일 디자인 적용 완료로도 확대하지 않는다.
- 이번 사전 점검에서 발견한 UI결함은 수정→QA→PR→병합→실게시→독립읽기까지 완료. 정본38/완료19/잔여19와 실제 새수신자수용/한국어 운영메일·GAS현재소스실증거·SEC01/현장수용 등의 별도 미완료 상태는 유지한다. 세부 상태는 Issue1243의 실제 배포 증거 댓글에 연결한다.

## 92. 2026-10-28 — 기존 HQ/인하대 주소 장애 재개·v0.372 복구 개발

- 사용자 원문 핵심: “같은 서비스인데 접속 주소에 따라 동작이 다르다는 점이 핵심 단서”, “기존에 사용하던 링크를 그대로 열어도 정상 작동하도록 복구”, “기존 접속 주소에서 실제 장애가 사라져야 완료”. 운영 지점·권한·직원·근태·급여·레시피·Sheets 원본은 보존한다. 원문/범위는 Issue1243에 접수했다.
- main bd0e575a/v0.371·PR1412·Pages40605917183는 이미 성공하므로 반복 개발하지 않는다. 실제 공개 /, index.html, 두 store=1 경로, ?v=0.371 모두GET200/v0.371/동일index SHA256bf58225bf5b731b4a0c1b22bfc5f43f04009697b59f5cffe9cf9e208ceef2027. Cache-Control max-age600, 배포2026-10-28 09:02:41 KST. 저장소에 별도HQ/인하대 진입HTML이나 서비스워커는 없으며 실제 URL두개는 사용자에게 확인 중이다. 기록된 기존 경로들의 검증은 독립적으로 계속한다.
- 운영로그23:00Z~00:20Z에서 list_stores249건200, admin_context200/401과 Auth refresh_token_not_found/validation_failed/bad_jwt 오류를 확인했다. 지점 서버 전면 장애라고 단정하지 않는다. 로그는 코드·상태 집계만 읽었으며 인증정보/개인값은 출력하지 않았다. 개별 사용자의 실제 브라우저 세션이나 미제공 URL 원인을 직접 관측한 것으로 확대하지 않는다.
- 추가 재현: v0.371이 거부된 회전 refresh 오류를 복구하지 못하는2회귀FAIL을 확인. 관리자 계정 확인 실패가 모두 지점 네트워크 실패로 표시되고 연결됨 상태가 설정 존재 여부만 반영하는 문제도 확인했다. 후보v0.372에서 확정된 세션 거부는 해당 로컬 로그인만 정리하고, 권한 없는 유효계정/실제 네트워크 장애는 자격을 보존한 채 분류·재로그인/재시도를 제공한다. 권한 확인 전 다른 지점 직원 조회는 계속 차단한다. admin_context는6초로 제한하고 성공한 재시도는 오래된 실패 상태를 해제한다.
- 캐시 복구는 같은 경로·지점·기존 query/hash를 유지한 채 공개 버전표식을 no-store로 확인해 새 배포로만 갱신한다. 부분CDN게시/오프라인/저장소거부/반복 reload는 제한하고 운영 localStorage는 삭제하지 않는다. 버전표식은 실제게시SHA/index해시만 포함하며 비밀정보가 없다. 새스크립트 도입 전 v0.370/v0.371 캐시 안의 코드를 원격에서 이미 수정했다고 주장하지 않는다.
- 로컬 Auth13/캐시3/배포범위4/지점격리7·기존P0/boot/무쓰기/영수증 회귀 PASS. CI에서 실제 WebKit·Chromium의 기존 URL 형태, 저장프로필, 오류복구, 새로고침·프로세스재실행을 확인한다. 운영 게시 후에는 기존경로7개 정확 바이트·Auth설정GET/READY조회·실제공개주소 브라우저를 별도로 검증하며 쓰기 요청은 차단한다. 아직 후보이며 PR/실게시/실주소 성공 전 완료로 보고하지 않는다. 원장38/19/19 유지.


## 93. 2026-10-28 — v0.372 실제 수용 실패와 Hosted 숫자 오류 응답 수정

- PR1414/main1d7d5f4d의 v0.372는 Pages40618177630과 독립40618314046에서 성공했다. 공개주소7개 동일바이트·두브라우저26건(새프로필/refresh없는만료토큰/재시작)·변경전후13기존자산불변·운영8그룹digest불변까지 확인했다. 하지만 사용자13:00 KST Safari스크린샷은 같은v0.372에서 HQ/인하대 모두 '관리자 로그인 확인 서버에 연결하지 못했습니다'로 차단된다. 해당 실저장계정 수용은 실패/IN_PROGRESS이며 공개QA26건을 수용완료로 확대하지 않는다.
- 원인 재현: 실제 Hosted GoTrue는 HTTP400 응답에 숫자 code=400과 문자열 error_code=refresh_token_not_found를 함께 보낸다. v0.372가 code를 먼저 선택하여400을 Auth오류로 판정하고 명시된만료오류를 놓쳤다. 실제03:45~04:03UTC 운영집계도 token400/refresh_token_not_found8건, expiredJWT4031건이며 admin_context까지 도달하지 않았다. 개별 계정의 토큰은 조회/출력하지 않았다.
- 수정전 실제Auth/loadStores 코드로 일반주소/지점전용주소2FAIL 재현. 후보v0.373은 error_code를 먼저 읽고 문자열 legacy code만 보조로 사용한다. 서버가 확정한 무효세션의 로컬로그인만 정리하고 READY공개진입/본사정상로그인으로 복구한다. 알수없는400/네트워크장애/유효하지만권한없는계정은 자격을 보존한채차단한다. 다른지점직원으로 우회하거나 서버권한/계정/암호를 변경하지 않는다.
- Auth기존13+새응답2+미상400보존1=16PASS. 기존 브라우저검사에 숫자code/error_code와 폐기된refresh가 있는 프로필을 모든주소에 추가한다. 실배포 후에는 기존 계정과 무관한 고정된 무효QA문자열만 실제Authrefresh API에 보내 서버의 실제400응답/자동복구를 두브라우저에서 확인한다. 승인되지않은실계정로그인/메일/운영DML/READY/SEC01/Google·Sheets쓰기0. 실제사용자개인암호 재로그인은 대신했다고 보고하지 않는다.
- 기존worktree/18파일과 v0.372 공개검증 영수증을 보존하고 별도 fix/qa1243-auth-response-recovery에서수정한다. 기존 무쓰기 정적배포경로를 재사용하고 새main/index정확해시만pin한다. 후보의 PR/CI/Pages/실제Hosted응답QA 결과는 Issue1243의 같은SHA 후속증거로 확정한다. 전체38/완료19/잔여19 유지.


## 94. 2026-10-28 — v0.373 운영 반영과 실제 Hosted 응답 검증 입력 정정

- PR1415/head4d017323의97check=91성공/6의도된skip/실패0, Auth16/정적경계4/캐시3 및 실제브라우저합성48PASS 후 main7087f7c1c9ffaa3f1e09e91ebc0f4a57d7383265에 정상병합했다. Pages40635530911/job122641819049는05:02:27UTC 성공. 기존주소7개가모두v0.373/index8ebcfd5f3a72dc64a2325983c229bc75af4e6e6b1c48203f772bc0a3c6b8b725를제공, Auth설정GET/공개READY지점조회200·인하대활성 확인. 13기존업무자산 바이트불변.
- 독립40635677397/job122641961338 공개읽기는PASS지만 실제브라우저job122642013750은FAIL: 임의QA문자열에하이픈/잘못된길이가있어validation_failed400으로거부됐고, 검사는refresh_token_not_found를기대했다. 앱수정실패로단정하거나테스트를통과처리하지않는다. 공식supabase/auth internal/api/token_refresh.go의legacy정규식 ^[a-z0-9]{12}$를조회했다. 운영토큰은값없이길이12만확인했고, 대체12자QA값은DB에존재하지않음을boolean으로확인했다. 실제유저토큰/세션을쓰거나새토큰을발행하지않았다.
- 후속QA수정은12자고정비존재QA입력·같은400/refresh_token_not_found기대검사를유지한다. 현재게시SHA7087f7c1에고정한공개읽기와실제Hosted두브라우저검사를PR필수job에서실행한다. runtime/index/운영자산변경과추가Pages/Edge배포를금지하는5개QA파일전용범위·정확한runtime해시를검사한다. 기존독립실패증거는보존하며새검증은harnessSHA와실제게시SHA를별도로기록한다.
- 운영8그룹전후digest동일,244지점/HQ3/인하대직원10/실메뉴136유지. store80은요청대로STAGED,false/대표공석유지. 실제계정로그인·초대·권한/암호·READY·SEC01·운영DB/Sheets쓰기0. 본사실계정의만료세션은정상재로그인이필요하며인증을우회하지않는다. 실브라우저결과와최종수용범위는해당후속PR필수검사/Issue1243실제실행증거로확정하며,사용자개인Safari수용을자동PASS로바꾸지않는다. 전체38/완료19/잔여19유지.


## 95. 2026-10-28 — 1호점 실제 재초대·본인암호·개통 수용 완료와 동일암호 안내 개선

- 사용자 실제증거: 본사계정으로1호점대표초대·개통승인→webuielf메일수신→수락→최초암호설정에서PERSONAL_PASSWORD_NOT_VERIFIED. 운영로그05:23~05:27UTC에서Auth PUT422/same_password와complete400, 읽기로초대유효/개통승인true/확정이메일/초대직전암호와동일(true만반환)을확인했다. 암호·해시·토큰값은조회/출력하지않았다. 원인=기존과동일암호거부를저장응답유실재시도와혼동해어려운오류만표시한클라이언트안내결함.
- 이어사용자원문'다른 비번으로 세팅하니 정상 개통 되었다'. 운영읽기도store80=READY,true/대표1/STORE_MANAGER1/temp대기0 확인. 이전STAGED/대표0은사용자요청에따른취소시점기록이며새증거로덮지않는다. 이번개통은사용자가본사확인창과본인메일/개인암호로정상RPC를실행한것이며AI가권한/READY를임의변경한것이아니다. 해당사용자·1호점의기존계정재초대·실수신·본인설정·대표확정+개통은실제수용완료. 한국어메일/다른수신자/현장전체수용으로확대하지않는다.
- 후보v0.374는기존암호입력에명확한한국어안내와같은화면새암호재시도를제공한다. 422/same_password만으로권한을부여하지않고서버가현재암호및초대직전hash변경을검증한다. 저장응답유실후동일새암호재시도는기존대로성공하며미상오류·취소·만료·다른지점은차단한다. 별도기본콜백도실제Hosted숫자code422/error_code형식을지원한다. 두콜백HTML캐시키를변경해이전스크립트캐시를구분한다.
- 신규회귀1FAIL→동일암호설명·새암호재시도포함7PASS, 기존세션9/기본콜백VM29 및정적보안계약PASS. WebKit/Chromium393·1280의기존암호→새암호/저장응답유실/새암호정상12개를실제HTML·JS+합성전송으로검증한다. 실제운영암호변경/메일발송테스트는반복하지않는다. v0.369과거배포guard는당시정확한commit의index/HTML로검사하고보호코드와해시를완화하지않는다.
- 기존무쓰기Pages경로를재사용하고새parent/index·콜백4개정확해시·허용QA파일만게시한다. 본사UI·근무현황·운영JS·레시피·세션감시9자산은전후불변, 공개index/manifest/probe/콜백4개는게시소스와정확일치를독립읽기로확인한다. 새SQL/Edge/Auth설정/계정권한/운영DB/초대/READY/SEC01/Google/Sheets쓰기0. 사용자실제개통성공후의상태를보존한다. 앱후보의PR/CI/Pages/독립읽기결과는Issue1243같은SHA증거로확정한다. 전체38/완료19/잔여19유지;QA-04의실수신자하위수용은이번증거로갱신하되한국어운영메일등조건을묶어완료처리하지않는다.


## 96. 2026-10-28 — 직원 재고 파악 팝업·브랜드 메일 통합 추가 지시

- 사용자원문: 버튼/기능명을'재고 파악(직원용)'으로변경하고다른팝업과어울리도록디자인정돈. 이어초대메일에브랜드로고/이름을넣어기능적인영문디자인을개선하라고지시. 진행중PR1417의최종범위로통합하며후보v0.374를아직실게시로표시하지않는다.
- POS버튼/팝업제목은정확한새명칭, 연녹색공통헤더/닫기버튼/본인확인·수량입력섹션/입력품목수·수량목록/고정하단제출/모바일스크롤·16px입력창·Escape/포커스복귀를정돈한다. 직원PIN/실근무/지점격리·제출만으로재고미변경·점주별도확정RPC는보존. 선택품목추가/수정·PIN경합회귀는유지하고320/375/393/430/1280×WebKit·Chromium10개실제DOM/CSS합성브라우저검사와스크린샷을준비했다.
- 기존PR919기반한국어브랜드초대HTML의카드/색상/구조를재사용하고기존공식logo_combine.jpg와서비스이름을넣었다. 실제기존계정재초대는recovery메일이므로invite와recovery본문·제목4개만적용대상이다. 새초대제목'[백억커피] 매장 관리자 계정 초대 안내', 복구제목'[백억커피] 계정 인증 및 비밀번호 설정'. recovery는본사일반암호복구에도쓰이므로대표권한자동부여를약속하는문구를넣지않았다. ConfirmationURL1회·단일CTA·이미지차단시브랜드이름·한국어안내·실서비스주소를포함한다.
- 사용자디자인지시에따른4메일필드변경만허용하며SMTP공급자/발신계정·site_url/redirect·Hook/가입/보안/세션·실제사용자암호/초대는변경하지않는다. 기존production환경의AuthRead/AuthWrite/legacy승인인증자산만재사용해GET→드리프트검사→정확4키PATCH→GET·다른설정해시불변을확인한다. 읽기토큰으로쓰기·새권한발급·인증우회없음. write자격없으면미적용과필요권한을실제job영수증으로명시하며팝업배포등독립업무는계속한다. 새실메일재발송을검증대신임의실행하지않는다.
- 새메일적용기6회귀PASS/기존4필드18회귀PASS. GitHub연결의Secrets메타데이터URL은지원되지않았으므로이를자격없음의증거로삼지않고승인된기존Actions실행문맥에서존재여부만판정한다. Supabase연결에AuthConfigPATCH도구가없고실행환경관리binding없음을구분한다. 실제운영반영과같은SHA게시결과는후속Issue1243영수증으로기록한다. 사용자실개통1호점READY/대표등록과새직원자료를유지,운영DB/직원근태/재고원장/Sheets/SEC01임의쓰기0. 정본38/19/19유지.


## 97. 2026-10-28 — 지점 개통 메일·계정 설정 페이지 디자인 통일

- 사용자 추가 원문: '초대메일 뿐 아니라 지점 개설/개통과 관련한 메일/관련페이지 디자인은 통일성을 신경써서 디자인 맞춰줘.' 기존브랜드초대카드의녹색로고헤더/배경/색상/입력버튼을공통스타일로정리한다. 실제native초대/기존계정recovery콜백2페이지와이전1호점계정복구페이지를동일owner_onboarding_v1.css로연결한다. 인증/만료/재발송/비밀번호/오류표시·로그인복귀가같은카드안에서이어진다. DOM form/input/status ID와기존초대·계정scope/단일사용링크·암호확인·권한확정순서는보존한다.
- 메일invite/recovery는기존PR919계열디자인과로고를재사용하고두제목/본문4필드만운영적용대상이다. 실제인증URL/CTA토큰·기존SMTP발신계정/공급자·보안설정을바꾸지않는다. 이미지가차단되어도서비스이름과한국어안내가남는다. 본사일반복구에도적합한recovery문구로대표권한을잘못약속하지않는다.
- 후보v0.374의진행중PR1417에통합한다. 새직원재고파악팝업은320/375/393/430/1280×두엔진10검사,같은암호/새암호/응답유실의실제설정HTML·JS는같은5너비×두엔진30검사, 이메일375/1280미리보기와연결페이지스크린샷으로시각확인한다. Auth·직원PIN·지점격리RPC/운영데이터쓰기테스트는진행하지않는다. 게시소스정확바이트와운영9자산불변/실제지점URL은독립검증하며관리쓰기권한미존재시메일운영미적용을정확히별도보고한다. 전체38/19/19유지.


## 98. 2026-10-28 — v0.374 실제 게시 완료·보조 초대 주소 오류 확정·운영 메일 권한 경계

- **실제 병합/버전:** [PR1417](https://github.com/koith/attendance-proto/pull/1417), 최종 head `8318d7f182635054f9af14206d6ad89baac52902` → 기능 main `12e698d3056aaddcf1d9d26499df5b62082732e3`, 운영 앱 **v0.374**. 최종 PR125체크=성공101/의도된skip24/실패0. 앞선 후보81041e43의5실패는 원인 수정 후 같은 검사를 유지하여 통과했으며 기록을 삭제하지 않았다.
- **직원 화면/연결 페이지 반영:** POS 이름을 정확히 '재고 파악(직원용)'으로 변경. 연녹색 공통 헤더·명확한 본인확인/수량 입력·입력 목록·하단 제출·모바일 스크롤·키보드 포커스를 정돈했다. 초대/기존계정 비밀번호 설정/기존 계정복구3페이지는 같은 녹색 로고·브랜드명·카드/입력/버튼·한국어 안내로 통일했다. 서버 PIN·근무중 여부·지점격리·점주의 별도 재고확정과 기존 Auth 권한확정 순서는 보존했다.
- **새 디자인 QA:** [40641036880](https://github.com/koith/attendance-proto/actions/runs/40641036880)에서 Chromium/WebKit ×320/375/393/430/1280px의 실제 설정 HTML·JS30/30, 직원 팝업10/10 PASS. 메일375/1280px 미리보기도 생성했다. 합성 전송으로 검증했으며 실사용자 암호 변경/메일 발송·재고쓰기 성공으로 바꾸지 않는다. 스크린샷은 해당 실행의 owner-password-feedback-browser artifact에 보존했다.
- **실제 Pages:** [40644107224/job122669330032](https://github.com/koith/attendance-proto/actions/runs/40644107224/job/122669330032) 성공(06:30UTC). 운영 Sheets writer가 있는 일반 build/validation/deploy3job은 SKIP. 기존 HQ·근무현황·레시피·운영JS·세션감시9자산 게시 전후 바이트 불변. 공개 index SHA256 `38c67893de637cdd5d2232f3b3b937d159670816d74e75a7125098479fad900d`.
- **독립 실주소 검증:** [40644321621](https://github.com/koith/attendance-proto/actions/runs/40644321621) 두job PASS. 공개7주소 모두 같은 v0.374/정확 index 바이트, probe/manifest 및 변경 owner·staff·공통CSS8자산 정확 일치, 실제 Auth설정GET200/READY지점조회200/인하대활성 확인. WebKit/Chromium 실주소38/38 PASS: 새 프로필·옛 URL·저장된 무효 로그인 복구·새로고침·브라우저 재시작. 개인 Safari/실사용자 암호 로그인까지 대신 확인했다고 확대하지 않는다.
- **보조관리자 초대 오류의 실제 원인:** 사용자 화면/운영 Auth 응답은 `email_address_invalid`이며 실제 전달된 도메인은 `naver.con`(마지막 n). `naver.com`과 구분했고, 초대받을 사람이 의도한 주소를 확인해 사용자가 수정하도록 안내했다. 기본 SMTP의 별도 제한 오류 `email_address_not_authorized`로 추정하지 않는다. AI 주소 자동변경/실메일 재발송/계정 변경0. 올바른 주소의 실제 초대·수락은 아직 확인되지 않았으므로 완료 처리하지 않는다.
- **운영 메일 디자인은 아직 미적용:** 기존 PR919계열 한국어 카드/공식 로고를 재사용한 invite/recovery 두본문·두제목은 코드에 준비됐지만, [40644107184/job122669002233](https://github.com/koith/attendance-proto/actions/runs/40644107184/job/122669002233)의 실제 GET 결과는 영문 기본값(You've been invited / Reset your password). `readCredentialPresent=true`, `writeCredentialPresent=false`, `AUTH_CONFIG_WRITE_CREDENTIAL_ABSENT`, `applied=false`, `patchAttempted=false`;4메일필드 모두 미충족이다. 기존 production 보호문맥의 자격 존재검사도 쓰기/legacy 인증 없음. GitHub Secrets 메타데이터 URL 미지원과 구분한다.
- **필요한 최소 외부 조치:** 운영 프로젝트 `waluhdgqhwjjwmflhrle`에 대한 **Auth Config Write** 자격을 기존 Actions Secret **SUPABASE_AUTH_WRITE_TOKEN**에 안전하게 연결하는 한 가지다. 읽기 토큰 재발급/채팅에 비밀값 제출/광범위 새 권한/SMTP 공급자·발신계정·보안설정 변경은 요구하지 않는다. 연결 후 이미 병합된 approved-mail-branding job만 재실행하여 GET→4키 PATCH→GET/기타설정 불변을 검증할 수 있다. 실제 메일 재발송은 별도 사용자 동작이며, 디자인 변경으로 기존 인증 URL을 바꾸지 않는다.
- **운영 자료 보존:** 게시 전후 보호8그룹 digest 완전 일치. 사용자가 직접 개통/직원등록 중인 store80 관련 행은 타점 불변 비교에서 명시 제외하고 현재 상태를 별도 확인했다. 지점244/HQ3/인하대직원10/활성실메뉴136 유지; 1호점(store80)은 사용자가 다른 개인암호로 수락 성공한 **READY/active=true/직원1** 상태를 보존했다. 역사적 STAGED/대표공석 기록을 최신 상태로 오인하지 않는다. AI 운영DB/권한/초대/READY/SEC01/Sheets 직접쓰기0.
- **판정:** 직원 팝업·연결 페이지 디자인은 배포 완료. 브랜드 메일의 운영 적용은 쓰기 인증 부재로 **미완료**, 정상 주소의 실제 보조 초대/수락도 미확인이다. 원장 **전체38/완료19/잔여19** 유지. 기존 Google·전체 개통 QA를 새로 성공했다고 주장하지 않으며, GAS/실수신자·현장수용/SEC01 등 별도 잔여를 유지한다.


## 99. 2026-10-28 — 사용자 승인에 따른 보조관리자 테스트 계정 완전 초기화

- 사용자 명시 지시: 해당 테스트 수신자의 기존 계정 처리를 제거해 처음 초대부터 시험할 것. 16:04:55 KST 운영 트랜잭션 완료. 앱 **v0.374** 유지, 앱/Edge 재배포·초대메일 발송·READY 전환 없음.
- 정확한 UID+이메일 일치와 현재 관리자/대표/초대/직원/Storage 소유 참조 없음 확인 후 Auth 사용자1·identity1·로그인 session1·refresh1·latest_session1 및 세션 하위 AMR1을 제거했다. 과거 대상 해임감사1행은 비공개 복구본에 보관 후 현재 테이블에서 제거했다. 다른 계정의 권한이나 과거 업무자료를 지우지 않았다.
- 운영 migration `qa1243_private_account_reset_recovery_archive`로 기존 비공개 private 스키마에 복구 보관표를 준비했다. RLS/FORCE RLS, PUBLIC/anon/authenticated/service_role 권한 회수. 원본 Auth/identity/대상 감사의 복구 정보는 DB 안에서만 보관하고 비밀번호 해시·토큰·원문은 GitHub/로그/채팅에 내보내지 않았다. 백업 무결성 PASS, anon/authenticated 조회 불가. 예전 세션·메일 액션 토큰은 복구하지 않는다.
- 첫 시도는 세션 하위 AMR1이 보호 비교에 포함돼 전체 ROLLBACK됨을 재조회했다. 대상 세션의 하위 행만 정확히 제외하도록 수정 후 재실행: **보호89테이블 전후 해시 일치**. 지점244/HQ3/인하대직원10/실레시피136, 1호점 READY/active=true와 실제 대표 유지.
- 삭제 후 독립 재조회에서 해당 UID/이메일 관련 현재 public/Auth/Storage/session_guard 참조0. 실제 read-only `service_store_invitation_dispatch_preflight`(store80/STORE_ASSISTANT) 결과 **ok=true, delivery=INVITE, existing_auth_user=false, user_id=null**. 기존 계정 연결/RECOVERY 대신 신규 초대 경로로 준비 완료. 실제 수신/수락/개인 비밀번호 설정/보조 권한 수용은 사용자가 다음 초대를 보내 확인해야 하며 자동 PASS로 처리하지 않는다.
- 작업 영수증 `qa1243-new-recipient-reset-20261028-6c46faf0`. 실제 발송0/다른 계정 삭제0/기존 Sheets 변경0. 과거 감사·복구 자료는 사용자 계정으로 조회되거나 신규 초대를 막지 않는 비공개 이력이다. 전체38/완료19/잔여19 유지. 운영 메일 브랜드 설정 쓰기 인증 등 기존 잔여는 별도 유지.


## 100. 2026-10-28 — 보조관리자 분야별 권한·관리 팝업 개발 (v0.375 후보)

- 사용자 실제 신규 초대·비밀번호·로그인 성공 보고와 1호점 제한화면 수용을 기록한다. 모든 직원 근무현황을 관리할 수 없고 PIN 창으로 연결되는 현상은 미완료로 구분한다.
- 추가 사용자 지시: 대표가 명단 오른쪽 관리 버튼→팝업에서 근태조회/근태관리/직원관리 ON/OFF, 급여 절대 비공개, 기존 해임 포함. 근태 관리 ON은 조회도 포함, 조회 OFF는 관리도 해제한다. 관리·해임 서버 API는 현재 대표만 호출할 수 있다. 직원 관리는 기존 scoped 이름/메모 수정 범위로 명시하고 임금/계약/문서/대표지정 권한을 확장하지 않는다.
- 신규 전용 근태 API는 실제 Auth·자기 지점 READY·현재 권한을 매 호출마다 확인한다. 조회 로스터는 임금/세금/PIN을 포함하지 않으며, 조회 전용은 수정 버튼을 숨기고 직접 API 정정도 거절한다. 추가/시간수정/원본무효/추가무효 및 중복방어는 현재 검증된 운영 정정 로직을 보존한다. 구형 관리자 API의 전체권한 판단을 완화하지 않는다.
- 급여 토글/조회 화면을 제거하고 저장된 과거 payroll_view=true도 보조 전용 급여 API와 서버 scope에서 거절한다. 이전 setter가 급여 권한을 켜려는 요청도 거부한다. 대표의 원래 급여 기능은 유지한다. 새 attendance_view 기본false로 다른 지점 권한을 일괄 부여하지 않으며 실제 켜기/해제는 대표의 팝업 확인으로 진행한다.
- branch fix/qa1243-assistant-attendance/base16c456cb. 로컬 실제 핸들러/기존 역할/화면 검사와 새 격리 PostgreSQL/Chromium·WebKit 검사를 준비했다. SQL은 qa1243_assistant_attendance.sql에 정확 소스로 보존. CLI는 설치본의 read-only 설정디렉터리 오류·Go 백엔드 migration 미지원으로 사용할 수 없어, 실제 운영 적용은 기존 Supabase migration 도구를 사용한다. 운영 직원/근태/급여·실메일·Google/Sheets·READY·SEC01 쓰기0. QA/PR/병합/실제 SQL·Pages 반영 결과는 후속 Issue1243의 같은SHA 증거로 확정한다. 전체38/완료19/잔여19 유지.


