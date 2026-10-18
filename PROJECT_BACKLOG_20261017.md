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
- [ ] **QA-06 (P1)** 지점 등록의 중복/잘못된 주소·READY 전후 경계, 보조 관리자 권한 변경 직후 구세션, 직원 근태 정상/지각/조퇴/휴게/야간/자정/월말/입퇴사/정정/재입사, 계약 변경, 급여 독립 기대값·마감·취소·중복 방어의 누락 커버리지 **시나리오별 증거 행렬** 보완. 기존 CI 통과와 별개로 요구 목록 전체 완료 판정. **부분 진전:** [Issue #1055](https://github.com/koith/attendance-proto/issues/1055)/[PR #1056](https://github.com/koith/attendance-proto/pull/1056) main `e5378ba5f9c1771949990115afc6317bc3d7ff88` 병합으로 격리형 개통 QA 18→28개 레인 확대(근태 누락·수기 생성·정정·익일 퇴근·주휴·계약 변경·미타각 마감·미래 급여·권한 회수 등). PR CI 51/51 PASS. 요구 전체 예외조합·실외부·운영 연동은 아직 미완료.
- [ ] **QA-07 (P1)** 실제 신규 지점 시나리오에서 재고·발주·입출고·POS·대시보드·권한별 메뉴 노출·해임 후 접근까지 연결되는 확장 통합 QA 및 음성 테스트 자동화. **2026-10-18 부분 개발·격리 QA 완료(전체 체크 아님):** [Issue #1060](https://github.com/koith/attendance-proto/issues/1060)/[PR #1061](https://github.com/koith/attendance-proto/pull/1061), main squash `0598867976f7b5e640d6749db27cca98a7ada090`. 개통 자동 검사 **28→39개**(재고·발주·실사·CSV·매출·대사·시연/실거래 구분), 서로 다른 격리 PostgreSQL DB **6→10개**(수기재고 RLS, 실사 draft/post, 거래 대사, 모의 POS·배달·매입 왕복), 중복 발주/취소 주문 오류 주입 검출. [PR 통합 QA #39111162735](https://github.com/koith/attendance-proto/actions/runs/39111162735)에서 39/39 소스 검사 + 10/10 DB 검증 + 가상 브라우저 실제 앱 스모크 포함 워크플로 성공. **남은 완료조건:** 한 지점 개통부터 POS·매입→재고·주문→대시보드·권한 회수까지 *연속된 사용자 시나리오*의 추가 동작/음성 검증, 실제 제3자 연동과의 차이 기록. 운영 원본 데이터 변경 없음.
- [x] **QA-08 (P1)** 신규 지점 개통 자동 QA의 **시나리오별 PASS/FAIL 표·CI 실행/커밋 상태·브라우저 실패 스크린샷 및 예외 스택** 영구 증거 수집. **지점 개통 CI 범위 완료**. 기존 `qa_store_opening_matrix_v1.mjs`는 세부 시나리오/종료코드를 `qa-results/store-opening-matrix.json`으로 생성, [PR #1031](https://github.com/koith/attendance-proto/pull/1031) main `bc0b046e9f0e93dd1c8153b7caa674abfdb0897b`에서 브라우저 실패 이미지/stack 및 source/browser/Postgres 결과 JSON을 `if:always()` 업로드(수집 실패도 로그 보존). PR CI 53/53 PASS, [main 통합 QA #39047895923](https://github.com/koith/attendance-proto/actions/runs/39047895923) SUCCESS, `store-opening-contract-results`, `store-opening-lane-status` 실제 아티팩트 readback, [P0 Pages #39047895833](https://github.com/koith/attendance-proto/actions/runs/39047895833) SUCCESS. 비현장 Gmail·Google Sheets 실연동 성공은 별도 QA-04/05 항목으로 남김.
- [ ] **SEC-01 (P0)** 한 관리자 계정의 새 장치 로그인 시 기존 장치의 **서버측 관리자 RPC** 접근을 실제 거부, 새 계정/지점/직원/익명 경로 정상, 복구/롤백/실기기 통합 QA 후 배포. [#998](https://github.com/koith/attendance-proto/issues/998), WIP [PR #999](https://github.com/koith/attendance-proto/pull/999).
- [x] **RECIPE-02 (P0, 이전 현장 요구 충돌 해결·정책 갱신)** 2026-10-11 직원 PIN/실출근 게이트가 2026-09-28 최종 승인 비로그인 보기전용 정책과 충돌했던 문제. 사용자가 2026-10-18 **READY 지점은 관리자·직원 로그인·PIN/출근과 무관하게 누구나 레시피 열람, 편집은 관리자만**이라고 재확정했으므로, 기존 이 항목의 '외부 익명 절대 공개 금지/기기 인증 세션 강제'는 **철회된 초안**으로 분류함. [#1036](https://github.com/koith/attendance-proto/issues/1036) → [#1038](https://github.com/koith/attendance-proto/issues/1038)/[PR #1039](https://github.com/koith/attendance-proto/pull/1039), v0.318. 운영 Supabase `anon` READY #1 레시피 126건·미존재 지점 0건, 내부 제조 원본 helper/관리자 수정은 익명 접근 제한 확인. 원본 레시피 불변. **매장 실물 PC의 화면 시각 확인은 별도 FIELD-01 현장 검증 범위**.
- [ ] **AUTH-01 (P1)** 한국어 브랜드 초대 메일 템플릿이 운영 Auth 설정에 실제 적용됐는지 읽기 확인, 안전한 실제 초대 발송 및 도달성·스팸 원인 검증. 코드 템플릿 병합됨([#919](https://github.com/koith/attendance-proto/pull/919)), **운영 적용·실수신 미확인**([#918](https://github.com/koith/attendance-proto/issues/918)).
- [ ] **FIELD-01 (실인원 검증대기)** 인증된 실제 대표·보조 점주 계정의 지점별 활성화/권한·근태·레시피 격리. [#916](https://github.com/koith/attendance-proto/issues/916), [#921](https://github.com/koith/attendance-proto/issues/921). 합성 QA로 실인원 인증을 대신하지 않음.
- [ ] **FIELD-02 (실자료 검증대기)** 실제 한 달 급여/주휴·승인·마감·스냅샷을 원천 기록과 검증(PAY-01).
- [ ] **FIELD-03 (실자료 검증대기)** 실제 비시연 매출·재고·공급사 데이터로 거래 연결 및 장부 정확성 검증(FEATURE-01).

## 3. 2026-10-17 회의 요구사항 — 신규 개발/검증 일정

회의 약속의 *목표 일정*: **10월 매출·재고 개발, 11월 말까지 최소 현장 검토·테스트, 12월 말 정확한 재고 기준 확보**. 이 날짜는 사용자 요청/회의 목표이며 달성 기록이 아님.

- [x] **MTG-01 (P0)** 월별 Google Sheet `급여 집계`의 **예상/확정 세전급여 합계** 계산·표시, TEST 제외·마감 원본 보존. **2026-10-17 운영 확인 완료**: [PR #1012](https://github.com/koith/attendance-proto/pull/1012), SHA `51f814ede2a744f4eeb5486c137ac80ac4997222`, PR CI 54/54 PASS, [Apps Script 배포·시트 자동갱신 PASS](https://github.com/koith/attendance-proto/actions/runs/39034718083), 운영 원본 `2026 근태` 10월 `B4=세전 합계 4,978,561원`, N6:N14 급여 9건 독립 재합산 4,978,561원 동일. **초기 '테스트 시트 read-back' 기준은 운영 시트의 실제 writer→read-back으로 기능 검증을 대체해 근거를 공개하며, 격리 테스트 시트 전체 E2E는 QA-05에 별도 미완료로 남김.** 회의 02:29~03:25.
- [ ] **MTG-02 (P0)** 예산 세전급여 N열/정정사유의 모바일 우측 경계·읽기 불편 개선. **코드 개발·QA·Apps Script 운영 배포·실제 Sheet 재동기화 데이터 검증 완료, 아이폰 화면 검증대기**: 기존 #1016/#1017의 26열/OVERFLOW가 실제 사용자에게 불충분함을 확인. [#1020](https://github.com/koith/attendance-proto/issues/1020), [PR #1022](https://github.com/koith/attendance-proto/pull/1022) main `c03d0d6424cf036b94a666f518cb89a5d5fe65db`: 12개월 A:AZ 52열, N열 WRAP, 긴 정정사유 행 높이 자동 확장, 원문은 셀 note/운영 DB 보존, 보고용 기술 로그/중복/단독점(.) 제거, A:N 외 빈 공간은 동기화 시 지우지 않음. PR 55/55 CI PASS, [Apps Script deploy #39043266512](https://github.com/koith/attendance-proto/actions/runs/39043266512) PASS. 2026-10-18 00:04 KST 자동동기화 후 10월 N65 정리한 두 줄 텍스트·원문 note/WRAP 및 9월 WRAP, 12/12 탭 52열 readback 확인. **남은 완료 조건:** 실물 iPhone 구글 시트 가로 스크롤·행 높이 시각 확인; 현장 직접 확인 없으므로 [ ] 유지. 회의 03:25~04:57.
- [ ] **MTG-03 (P1)** 직원 기록 vs 점주/관리자 확인 vs 급여 예상값 검산·사유 기록·최종 승인 프로세스. 주휴 적용 주수, 야간, 휴게, 수기 예외 계산의 고정 검산식과 승인 정책을 문서화·QA. 회의 00:07~02:29.
- [ ] **MTG-04 (P0, 현장 검증 포함)** 신대방삼거리점과 구로고척점 정보·공식 개통 증빙·기존 계정 안전 확보→근태 시트/대표 관리자 개통 플로우 준비. 실제 점주 인증 전 READY 강행 금지. 회의 24:09~25:16. QA-04·FIELD-01과 연계.
- [ ] **MTG-05 (P1)** POS 시스템의 1/2번 단말 의미·키오스크·배달 경유 구조를 **실제 원천 자료로 검증**. 영수증 번호만으로 결합하지 않고 원천키·시간·금액·채널·메뉴를 사용한 거래 정규화. 회의 24:45~32:29.
- [ ] **MTG-06 (P1)** POS·배민·쿠팡이츠 등 매출 중복 제거, 취소·환불, 시간 편차, 배달 정산액과 총매출의 분리, 누락/의심 일치 검토 큐 및 대사 근거. 회의 05:11~06:31, 25:38~32:29.
- [ ] **MTG-07 (P1)** 동일 메뉴의 POS·배달·행사 판매명 매핑; 아메리카노/행사 아메리카노는 규칙대로 연결하고 1L 등 다른 단위는 별도 SKU를 유지. 메뉴 판매량 검산. 회의 28:18~28:57.
- [ ] **MTG-08 (P1)** 실제 주 공급사(CJ 계열, 코드상 ONLYONE/온리원푸드넷 등 서비스 확정 필요) 매입·입고 원천 확보 및 안전한 수집·중복 방지, 지점별 데이터 격리. 지원 API/다운로드 경로 우선. 회의 11:30~14:01.
- [ ] **MTG-09 (P1)** 모바일 현장 재고 실사: 직원 권한·품목/단위·수량 입력·초안/확정·실사 이력, 점주 승인과 운영 사용성을 검증. 기존 `operations_stocktake_v1.js` 확장. **2026-10-18 모바일 품목 검색 개발·QA·병합 완료(전체 완료 아님):** [Issue #1063](https://github.com/koith/attendance-proto/issues/1063), [PR #1065](https://github.com/koith/attendance-proto/pull/1065) main `1a3dc964aba65321b1eba190bace21f9a3f1ff61`. 모바일 품목명 한글 검색·미검색 시 품목 추가 차단·원본 선택 유지, 앱 v0.320 + 독립 JS 캐시키. 마지막 PR SHA `b07cda1723e37b8926508977ea1575c5559529bf`의 CI 77/77 PASS. **운영 배포 검증 완료:** [main P0 Pages #39112095365](https://github.com/koith/attendance-proto/actions/runs/39112095365) 게이트·빌드·게시·동일 실행 공개 UI 검증 성공; [독립 검증 #39112267835](https://github.com/koith/attendance-proto/actions/runs/39112267835) 공개 `index.html`/실사용 `operations_stocktake_v1.js` 파일 내용 SHA 일치, HTTP 200, 앱 v0.320, 모바일/데스크톱 운영 스모크 및 비로그인 POS 개인정보 접근 방어 PASS. **남은 완료조건:** 직원 역할/점주 승인 및 실물 모바일 재고실사 UX 검증; 별도 MTG-16 실제 POS·공급사 자동수집/입력부담 검증. **완료 수 불변**. 재고 원본·실물 실사 기록 무단 변경 없음. 회의 14:01~15:19.
- [x] **MTG-10 (P1, 개발완료·실자료 검증대기)** 지점 관리자가 설정한 목표·현재 재고, 미입고/부분입고 발주량 및 포장/재고 단위 환산을 반영한 **안전한 권장 발주량** 계산. 기존 UI의 `Math.max(1,target-on)` 중복·강제 발주 제안 결함 제거, 기존 주문 동일 품목/단위 식별 및 부정합 차단, 0 부족 시 0 제안, 공급사 주문/결제 자동 실행 없음. [#1049](https://github.com/koith/attendance-proto/issues/1049) [PR #1051](https://github.com/koith/attendance-proto/pull/1051) main `c9f3d8d5d9e0018262e938fe65be196a0f9f9afb`, 패키징·자산 캐시/앱 v0.319 [PR #1052](https://github.com/koith/attendance-proto/pull/1052) main `ed999003dac67a1225d90a64ea584de54dd16271`; PR QA 각각 51/51, 78/78 PASS, [실제 Pages P0 배포 #39101933897](https://github.com/koith/attendance-proto/actions/runs/39101933897) SUCCESS, [독립 배포 검증 #39102102998](https://github.com/koith/attendance-proto/actions/runs/39102102998) SUCCESS. **운영 실제 입고·발주 원천 데이터는 없는 상태이므로 현장 실자료 교차검증은 FIELD-03으로 유지**. 회의 14:53~16:22.
- [ ] **MTG-11 (P2)** 점주 명시 승인 후 공급사 장바구니에 필요한 품목만 반영·읽기 검증·중복 방지; 최종 수정/주문/결제는 공급사 사이트에서 사용자가 수행. 외부 API·권한·사용 정책 확인. 회의 16:22~17:11.
- [ ] **MTG-12 (P1)** 월별 `매입액`과 `사용 재료비`를 혼동하지 않는 지점별 비용 화면. 기초/기말 재고 불명=0으로 취급 금지; 원가·폐기·반품·시간 경계 QA. 회의 17:11~18:16.
- [ ] **MTG-13 (P2)** 실제 판매 수량 × **실제 지점별 레시피**의 재료 소모량 계산, 폐기·서비스 제공·손실 허용 오차 설정, 과부족 감지. 본사/지점 레시피 무단 수정 금지. 회의 18:16~19:07.
- [ ] **MTG-14 (P3/후속)** 입고·사용 기록으로 장기체류 가능성을 알리는 재고 점검 경고; 실물 소비기한이 없는 경우 '유통기한 만료 확정'으로 표시 금지. 회의 19:07~22:34.
- [ ] **MTG-15 (P2)** 내부 손익·물류 관리 자료와 세무 신고 자료의 용도·접근·출력 경계를 유지하고 법정 신고 자료의 누락/왜곡 방지. 회의 22:36~24:00.
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

- [ ] **BUG-01 (P0, 현장 장애)** 인하대학교점 POS 공용 PC에서 관리자 비로그인 상태로 **근무현황**을 누를 때 `P0001 POS_AUTH_REQUIRED` 오류 없이 직원 본인 선택/PIN 인증 화면이 표시되어야 함. 실제 근태 조회는 본인 PIN 인증 뒤에만 허용해야 하며, READY 지점/활성 직원 외 노출과 임금·PIN 유출이 없어야 함. 현장 스크린샷 2026-10-18, [이슈 #1028](https://github.com/koith/attendance-proto/issues/1028). **기존 원인:** `openMyRecord`가 토큰 필요 `pos_employees_state`를 첫 목록에 사용. **수정:** 공용 POS 출퇴근에서 이미 쓰는 `pos_public_staff_cards`를 근무현황 선택에 사용; `my_events` PIN 검증 유지. [QA](qa_pos_attendance_guest_v1.mjs) 및 P0 Pages 배포 게이트 추가. **완료 조건:** PR 필수 QA 통과→main 병합→앱 버전 증가→보장 배포/운영 버전 read-back→현장 POS 실제 확인. 현장 확인이 아직 없다면 별도 대기 표시.

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
