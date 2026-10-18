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

## 1. 최신 증거 스냅샷 (2026-10-17 21:40 이후 재확인; 진행 때마다 갱신)

- 리포지토리 main SHA: `b892bf18c6494a87610fc0904159bcdec772b2da`; 앱 `v0.316`.
- 실제 [지점 개통 전체 자동 QA 실행](https://github.com/koith/attendance-proto/actions/runs/39024771557): success.
- [Pages 퍼블리시](https://github.com/koith/attendance-proto/actions/runs/39024771709): success; [배포 P0 게이트](https://github.com/koith/attendance-proto/actions/runs/39024771511): success; [독립 배포 알림](https://github.com/koith/attendance-proto/actions/runs/39024965539): success.
- 신규 지점 격리형 QA: [#1001](https://github.com/koith/attendance-proto/pull/1001) → [#1003](https://github.com/koith/attendance-proto/pull/1003) → [#1006](https://github.com/koith/attendance-proto/pull/1006) 병합. 인수인계서 작성 시점의 'E2E 전면 미완료/v0.315' 판정은 **현재 검증 범위의 일부에 대해서는 오래된 기록**.
- 현재 미병합 PR [#999](https://github.com/koith/attendance-proto/pull/999): 관리자 1기기 로그인 서버 강제 준비 상태. 인증 및 익명 요청 호환성·롤백 검증 전 운영 적용 금지.
- 운영 Supabase 읽기 전용 2026-10-17 확인: 매장 244 / READY 1 / STAGED 243 / 대표 연결 0 / 보조 연결 0 / 급여 마감 0 / 급여 스냅샷 0 / 비시연 거래 0 / 비시연 재고 이동 0. 실운영 통합 성공을 가상 데이터로 위장하지 않는다.
- 참조: [기존 개발 원장 #699](https://github.com/koith/attendance-proto/issues/699), [지시 추적 #837](https://github.com/koith/attendance-proto/issues/837), [통합 QA #1000](https://github.com/koith/attendance-proto/issues/1000), [외부연동 후속 #1005](https://github.com/koith/attendance-proto/issues/1005).

## 2. 이전 대화 신규 지점 자동 통합 QA — 확인된 개발과 미검증 분리

- [x] **QA-01 (P0)** 운영 데이터와 분리된 신규 지점·대표/보조·직원·근태/급여·시트 페이로드·레시피의 다층 자동 QA 구성. **격리형 테스트 범위 완료**. 근거: PR #1001, CI run 39024771557, 운영 v0.316. *실제 외부 서비스의 송수신 성공까지 포함하지 않음.*
- [x] **QA-02 (P0)** 자동 QA 자체를 검증: 급여 테스트 직원을 포함시키는 변이, 취약한 비밀번호/잘못된 지점 활성화를 주입하고 실패 감지. **결함 주입 검증 완료**. 근거: PR #1003, main commit `da1361d21798`.
- [x] **QA-03 (P0)** 실제 앱 소스의 본사→대표→보조→직원·레시피 연속 Chromium 재생과 지점 격리. **모의 네트워크·가상 메일함 범위 완료**. 근거: PR #1006, SHA `b892bf18c649`, CI run 39024771557.
- [ ] **QA-04 (P0)** 격리된 실제 Supabase Auth/SMTP 시험메일 송신 → 별도 테스트 메일함 수신 → 링크 클릭 → 비밀번호 확정 → 실제 Auth 세션 재검증, 만료/재발송/취소. **실제 송수신 미검증**. 근거/후속: [#1005](https://github.com/koith/attendance-proto/issues/1005). 실제 점주/운영계정에 시험 메일 금지.
- [ ] **QA-05 (P0)** 독립 테스트용 Google Sheet에 Apps Script 실제 쓰기·재조회·정정 재동기화·중복 방지·월별 형식·장애 재시도·지점 격리·안전 정리. **Apps Script 전체 쓰기↔재조회는 미검증**. 2026-10-18 격리된 실제 Google Sheet를 신규 생성해 월 탭 12개·합성 급여 2건·재동기화 멱등성·긴 정정사유 WRAP/원문 note의 Google Sheets API 쓰기↔재조회 부분 검증 완료. 실제 앱→Edge→Apps Script E2E·지점별 권한은 별도 미완료. 후속 #1005. 운영 `2026 근태` 손상 금지.
- [ ] **QA-06 (P1)** 지점 등록의 중복/잘못된 주소·READY 전후 경계, 보조 관리자 권한 변경 직후 구세션, 직원 근태 정상/지각/조퇴/휴게/야간/자정/월말/입퇴사/정정/재입사, 계약 변경, 급여 독립 기대값·마감·취소·중복 방어의 누락 커버리지 **시나리오별 증거 행렬** 보완. 기존 CI 통과와 별개로 요구 목록 전체 완료 판정. **부분 진전:** [Issue #1055](https://github.com/koith/attendance-proto/issues/1055)/[PR #1056](https://github.com/koith/attendance-proto/pull/1056) main `e5378ba5f9c1771949990115afc6317bc3d7ff88` 병합으로 격리형 개통 QA 18→28개 레인 확대(근태 누락·수기 생성·정정·익일 퇴근·주휴·계약 변경·미타각 마감·미래 급여·권한 회수 등). PR CI 51/51 PASS. 요구 전체 예외조합·실외부·운영 연동은 아직 미완료. **2026-10-18 증거 행렬 확대:** [PR #1096](https://github.com/koith/attendance-proto/pull/1096), main `c562a0deb6dea722da55db3e11edae2361b9ebbf`. 실제 실행 19개 QA PASS, 테스트별 증거 JSON/Markdown CI 아티팩트 보존, 미확인 7개 예외(공식 주소 증빙·구세션 실차단·실지각/조퇴/재입사·실급여 정정 사유·현장 월마감)는 명시적 GAP로 보고. 기존 원장 [ ] 유지.
- [ ] **QA-07 (P1)** 실제 신규 지점 시나리오에서 재고·발주·입출고·POS·대시보드·권한별 메뉴 노출·해임 후 접근까지 연결되는 확장 통합 QA 및 음성 테스트 자동화. **2026-10-18 부분 개발·격리 QA 완료(전체 체크 아님):** [Issue #1060](https://github.com/koith/attendance-proto/issues/1060)/[PR #1061](https://github.com/koith/attendance-proto/pull/1061), main squash `0598867976f7b5e640d6749db27cca98a7ada090`. 개통 자동 검사 **28→39개**(재고·발주·실사·CSV·매출·대사·시연/실거래 구분), 서로 다른 격리 PostgreSQL DB **6→10개**(수기재고 RLS, 실사 draft/post, 거래 대사, 모의 POS·배달·매입 왕복), 중복 발주/취소 주문 오류 주입 검출. [PR 통합 QA #39111162735](https://github.com/koith/attendance-proto/actions/runs/39111162735)에서 39/39 소스 검사 + 10/10 DB 검증 + 가상 브라우저 실제 앱 스모크 포함 워크플로 성공. **남은 완료조건:** 한 지점 개통부터 POS·매입→재고·주문→대시보드·권한 회수까지 *연속된 사용자 시나리오*의 추가 동작/음성 검증, 실제 제3자 연동과의 차이 기록. 운영 원본 데이터 변경 없음.
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
- [ ] **MTG-05 (P1)** POS 시스템의 1/2번 단말 의미·키오스크·배달 경유 구조를 **실제 원천 자료로 검증**. 영수증 번호만으로 결합하지 않고 원천키·시간·금액·채널·메뉴를 사용한 거래 정규화. 회의 24:45~32:29.
- [ ] **MTG-06 (P1)** POS·배민·쿠팡이츠 등 매출 중복 제거, 취소·환불, 시간 편차, 배달 정산액과 총매출의 분리, 누락/의심 일치 검토 큐 및 대사 근거. 회의 05:11~06:31, 25:38~32:29.
- [ ] **MTG-07 (P1)** 동일 메뉴의 POS·배달·행사 판매명 매핑; 아메리카노/행사 아메리카노는 규칙대로 연결하고 1L 등 다른 단위는 별도 SKU를 유지. 메뉴 판매량 검산. 회의 28:18~28:57.
- [ ] **MTG-08 (P1)** 실제 주 공급사(CJ 계열, 코드상 ONLYONE/온리원푸드넷 등 서비스 확정 필요) 매입·입고 원천 확보 및 안전한 수집·중복 방지, 지점별 데이터 격리. 지원 API/다운로드 경로 우선. 회의 11:30~14:01.
- [ ] **MTG-09 (P1)** 모바일 현장 재고 실사: 직원 권한·품목/단위·수량 입력·초안/확정·실사 이력, 점주 승인과 운영 사용성을 검증. 기존 `operations_stocktake_v1.js` 확장. **2026-10-18 모바일 품목 검색 개발·QA·병합 완료(전체 완료 아님):** [Issue #1063](https://github.com/koith/attendance-proto/issues/1063), [PR #1065](https://github.com/koith/attendance-proto/pull/1065) main `1a3dc964aba65321b1eba190bace21f9a3f1ff61`. 모바일 품목명 한글 검색·미검색 시 품목 추가 차단·원본 선택 유지, 앱 v0.320 + 독립 JS 캐시키. 마지막 PR SHA `b07cda1723e37b8926508977ea1575c5559529bf`의 CI 77/77 PASS. **운영 배포 검증 완료:** [main P0 Pages #39112095365](https://github.com/koith/attendance-proto/actions/runs/39112095365) 게이트·빌드·게시·동일 실행 공개 UI 검증 성공; [독립 검증 #39112267835](https://github.com/koith/attendance-proto/actions/runs/39112267835) 공개 `index.html`/실사용 `operations_stocktake_v1.js` 파일 내용 SHA 일치, HTTP 200, 앱 v0.320, 모바일/데스크톱 운영 스모크 및 비로그인 POS 개인정보 접근 방어 PASS. **남은 완료조건:** 직원 역할/점주 승인 및 실물 모바일 재고실사 UX 검증; 별도 MTG-16 실제 POS·공급사 자동수집/입력부담 검증. **완료 수 불변**. 재고 원본·실물 실사 기록 무단 변경 없음. 회의 14:01~15:19.
- [x] **MTG-10 (P1, 개발완료·실자료 검증대기)** 지점 관리자가 설정한 목표·현재 재고, 미입고/부분입고 발주량 및 포장/재고 단위 환산을 반영한 **안전한 권장 발주량** 계산. 기존 UI의 `Math.max(1,target-on)` 중복·강제 발주 제안 결함 제거, 기존 주문 동일 품목/단위 식별 및 부정합 차단, 0 부족 시 0 제안, 공급사 주문/결제 자동 실행 없음. [#1049](https://github.com/koith/attendance-proto/issues/1049) [PR #1051](https://github.com/koith/attendance-proto/pull/1051) main `c9f3d8d5d9e0018262e938fe65be196a0f9f9afb`, 패키징·자산 캐시/앱 v0.319 [PR #1052](https://github.com/koith/attendance-proto/pull/1052) main `ed999003dac67a1225d90a64ea584de54dd16271`; PR QA 각각 51/51, 78/78 PASS, [실제 Pages P0 배포 #39101933897](https://github.com/koith/attendance-proto/actions/runs/39101933897) SUCCESS, [독립 배포 검증 #39102102998](https://github.com/koith/attendance-proto/actions/runs/39102102998) SUCCESS. **추가 안전 결함 수정(2026-10-18):** null/공백/비수치 미확인 재고를 측정 0개로 오인하여 발주를 권고하지 않게 통합 재고 화면·계산기 수정, 측정 0개는 계속 정상 부족량 계산. [#1071](https://github.com/koith/attendance-proto/issues/1071)/[PR #1072](https://github.com/koith/attendance-proto/pull/1072), main `381f52db339e5b0e2ecb20d8d92af0d464cb9577`, PR CI 77/77, v0.322 [P0 운영 배포 #39113607650](https://github.com/koith/attendance-proto/actions/runs/39113607650) 성공(독립 최종 검증은 별도 기록). **운영 실제 입고·발주 원천 데이터는 없는 상태이므로 현장 실자료 교차검증은 FIELD-03으로 유지**. 회의 14:53~16:22.
- [ ] **MTG-11 (P2)** 점주 명시 승인 후 공급사 장바구니에 필요한 품목만 반영·읽기 검증·중복 방지; 최종 수정/주문/결제는 공급사 사이트에서 사용자가 수행. 외부 API·권한·사용 정책 확인. 회의 16:22~17:11.
- [ ] **MTG-12 (P1)** 월별 `매입액`과 `사용 재료비`를 혼동하지 않는 지점별 비용 화면. 기초/기말 재고 불명=0으로 취급 금지; 원가·폐기·반품·시간 경계 QA. **2026-10-18 부분 개발 및 운영 배포 완료:** [#1069](https://github.com/koith/attendance-proto/issues/1069)/[PR #1070](https://github.com/koith/attendance-proto/pull/1070), main `43bd468248ed685d317fb8540fcdf18fc2e71e5b`, v0.321. 확인된 매입거래 총액과 미산출 사용 재료비를 대시보드에서 분리하고 재고평가 미확정 시 0원/추정값을 표시하지 않음. 소스 테스트 및 PR CI **77/77 PASS**; [Pages #39113259619](https://github.com/koith/attendance-proto/actions/runs/39113259619) 및 [독립 배포 #39113441316](https://github.com/koith/attendance-proto/actions/runs/39113441316) 성공. **최종 사용 재료비 자동 산출은 아직 미개발**: 실제 매출 품목 정규화·실사 기초/기말 평가·매입·반품·폐기 수량과 원가 검증이 필요하므로 미완료 유지. 회의 17:11~18:16.
- [ ] **MTG-13 (P2)** 실제 판매 수량 × **실제 지점별 레시피**의 재료 소모량 계산, 폐기·서비스 제공·손실 허용 오차 설정, 과부족 감지. 본사/지점 레시피 무단 수정 금지. 회의 18:16~19:07.
- [x] **MTG-14 (P3, 개발완료·실자료 검증대기)** 입고·사용 기록으로 장기체류 가능성을 알리는 재고 점검 경고; 실물 소비기한이 없는 경우 '유통기한 만료 확정'으로 표시 금지. **2026-10-18 코드/권한/합성 DB QA/운영 완료**: [Issue #1076](https://github.com/koith/attendance-proto/issues/1076), [PR #1079](https://github.com/koith/attendance-proto/pull/1079) `744cca0628b1f2674731c522ed7ed0a3b95d49f1` (지점범위·READY·실측 양수재고·마지막 입고/사용 기록·30/60/90/180일 점검, anon 권한 차단), [PR #1083](https://github.com/koith/attendance-proto/pull/1083) v0.325 (null/공백 누락 기록 안전 방어), [PR #1087](https://github.com/koith/attendance-proto/pull/1087) `f6a4d1c8cc0067e6b5ccaa2a7d25eb8afc2efdc0` (재고 화면 자동 점검 경고 v0.326). 각 PR 전체 격리/브라우저 QA 통과. [P0 Pages #39116206370](https://github.com/koith/attendance-proto/actions/runs/39116206370) 4단계 성공, [독립 검증 #39116552336](https://github.com/koith/attendance-proto/actions/runs/39116552336) v0.326 및 공개 3개 파일 바이트 일치·모바일/데스크톱 PASS. 운영 DB RPC 직접 확인: authenticated EXECUTE=true, anon EXECUTE=false. **실운영 비시연 이동 0건이므로 실제 체류 재고 판정은 FIELD-03 실자료 검증대기** (본 개발완료 체크와 별개). 실제 품목 수량·레시피·계정 무변경. 회의 19:07~22:34.
- [x] **MTG-15 (P2, 내부자료 분리 개발완료·세무 실자료 검증대기)** 내부 손익·물류 관리 자료와 세무 신고 자료의 용도·접근·출력 경계를 유지하여 내부 장부를 세무 신고 자료로 오인하거나 이를 근거로 누락된 법정 신고를 자동 확정하지 않도록 함. **2026-10-18 완료:** [Issue #1080](https://github.com/koith/attendance-proto/issues/1080) / [PR #1082](https://github.com/koith/attendance-proto/pull/1082), main `d768c82e154319fc1637ca79cc7d31e997fc7bbe`, v0.324. 실거래 CSV 11개 기존 원천·금액 열 유지, 12번째 각 행의 `자료용도`에 **내부 운영 참고용 · 세무신고 자료 아님** 표기, 다운로드 이름·매출 화면에 명확한 비법정 자료 경계. 익명·다른 지점 접근은 기존 관리 RPC 유지. 실제 1,007건 커서 페이지 전부의 용도 표기/데모·CSV 수식 주입/부분 파일 차단 QA PASS, PR CI 77/77, [독립 운영 배포 #39115457157](https://github.com/koith/attendance-proto/actions/runs/39115457157) SUCCESS. **법정 세무 신고자료 자체를 자동 작성·검증하거나 세무 신고 완결성을 보증한 것은 아님**. 세무 신고·원천 증빙 검증은 별도 자료와 전문 검토가 필요하며 FIELD-03/후속 업무로 유지. 회의 22:36~24:00.
- [ ] **MTG-16 (P1)** 매장 근로자가 실제로 사용 가능한 재고 화면의 입력 부담 검증: POS/매입 자동수집을 우선하고 입력이 반드시 필요한 실사만 최소화. **부분 UI 진전:** [#1063](https://github.com/koith/attendance-proto/issues/1063)/[PR #1065](https://github.com/koith/attendance-proto/pull/1065), v0.320에서 실사 품목명 검색/빈 결과 차단을 추가하여 기존 긴 선택 목록의 부담을 일부 줄임. 자동수집/직원 역할 및 실제 현장 UX 검증은 **미완료**; 이는 완성된 POS/매입 연동이나 실물 사용성의 근거가 아님. 회의 11:01~14:53.

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
