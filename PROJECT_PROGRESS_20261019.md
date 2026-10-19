# 백억커피 업무자동화 — 2026-10-19 개발 실행 증거

**기준:** `PROJECT_BACKLOG_20261017.md`의 37건 중 17건 완료, 20건 미완료. 아래 신규 개발은 전체 요구 완료 증거가 아닌 부분 이행 증거다. 실사용 레시피/근태/급여/재고 수량은 직접 수정하지 않았다.

## MTG-07 (#1137): 판매명↔지점 SKU 매핑 결과 보존
- [PR #1138](https://github.com/koith/attendance-proto/pull/1138) / main `f243d32d75ea74b18a8264f30be40dd6e4dacec4`, 운영 v0.336.
- 승인된 지점 SKU 검사 결과를 별도의 감사용 CSV로 내보내기; 원문·EXACT/PROMOTION/AMBIGUOUS/UNMAPPED·SKU·별칭·검토 상태 보존.
- 1L 메뉴의 개별 SKU 보존, Excel 수식 악용 문자열 이스케이프, 검증 이후 입력 변경 시 다운로드 차단, 판매수량을 임의 생성하지 않음.
- PR CI **78/78 PASS**; [운영 Pages 성공 #39173980492](https://github.com/koith/attendance-proto/actions/runs/39173980492), [동일 바이트 독립 검증 #39174228943](https://github.com/koith/attendance-proto/actions/runs/39174228943) 성공.
- **미완료:** 실제 POS/배달 개별 상품 판매수량 정규화와 지점별 판매수량 검산.

## QA-07 (#1139): 서로 다른 모듈 연결형 DB 통합 QA
- [PR #1140](https://github.com/koith/attendance-proto/pull/1140) / main `215d3f2f88ecbba549072cfd7f69329475a38ea6`.
- **하나의 격리 PostgreSQL**에서 KIS_POS/BAEMIN/ONLYONE 원천 수집→실제 정규화 RPC→확인된 매출 거래 판매명→지점 승인 SKU 검사 RPC 연결.
- 환불/매입의 판매 SKU 오집계, 다른 지점 SKU 유출, 1L 합산, 수정 영수증의 구별칭 승계 금지; 기존 대사·페이징·취소·오류 주입 회귀 보존.
- **CI 51/51 PASS.** 실제 신규 점주 개통/실원천 POS 자동수집/현장 실기기는 별도 미완료.

## SEC-01 (#998): 운영 세션 가드 준비, 차단 미활성
- [PR #1142](https://github.com/koith/attendance-proto/pull/1142) / main `3c879a5624f742b80b7f2a7363307e17e6887c6e`. **CI 52/52 PASS.**
- 이전 WIP #999의 검증된 SQL 및 격리 PostgreSQL/실제 테스트 PostgREST JWT HTTP 검증을 최신 main으로 안전하게 옮김.
- 운영 Supabase migration `single_admin_session_guard_prepare_20261019` **적용 성공**: guard 세션 기록/trigger/검사 함수 설치, 82개 auth.sessions 기록 중 고유 최근 세션 소유자 3명으로 backfill. 세션 기록 테이블에 anon/authenticated 직접 SELECT 권한 없음.
- 운영 **`pgrst.db_pre_request` 활성 설정은 없음**; 따라서 기존 로그인/익명 POS 지속. 익명 POS 직원 선택 10건 정상 readback.
- **미완료:** 운영 관리자 실제 인증 세션 검증, 단계적 강제 차단 적용, 롤백/기기 QA. 이를 완료했다고 주장하지 않음.

## 실원천 및 연결 가용성 점검
- Supabase 실제 비시연 `operations_transactions` **0건**, 실제 비시연 재고 이동 **0건**, 승인 판매명 별칭 **136건**, READY+활성 지점 **1곳**.
- 연결된 사용자 Drive/Gmail에서 백억커피 POS·온리원 공급사 실제 파일 또는 거래 첨부 후보를 찾지 못함. 검색 부재만으로 외부 공급사 API가 불가능하다고 단정하지 않음.
- 따라서 MTG-05/08/12/13/16, FIELD-03의 실자료 단계는 완료로 표시하지 않음.

## 상태
정본 원장과 비교해 **완료 17 / 미완료 20**, 세 신규 PR은 모두 병합 완료. 개발 코드 및 독립 QA는 진전됐으나 아직 나머지 20건을 전부 완료하지 못했다. 실제 인증 메일 송수신, 별도 Apps Script 종단 검증, 지점 점주 개통과 급여 검산은 명시적 검증대기다.

## MTG-09/MTG-16 (#1145): 실사 확정 전 응답값 검산
- [PR #1146](https://github.com/koith/attendance-proto/pull/1146), main `b77bfdee97bf2ac623a42a4942a59b6f91d84edf`, 운영 앱 v0.337.
- 예상재고·실측재고·차이 수량이 모두 유한한 숫자이고 `실측-예상=차이`를 만족해야 실사 상세 검토 및 확정 가능. 데이터 누락·0으로 허위 변환·중복 품목·잘못된 실사 ID 차단; 실제 측정 0, 음수 차이, 기존 취소 기록은 보존.
- CI 78/78 PASS, [운영 배포 #39175300359](https://github.com/koith/attendance-proto/actions/runs/39175300359) 및 [독립 검증 #39175517497](https://github.com/koith/attendance-proto/actions/runs/39175517497) SUCCESS.
- MTG-09 직원 본인 역할/점주 승인 및 MTG-16 POS/매입 자동 수집과 실제 현장 사용성은 여전히 미완료.

## SEC-01 (#1148): 이전 세션 차단 안내 UI
- [PR #1149](https://github.com/koith/attendance-proto/pull/1149), main `ca09dafbc9e027af16df23d2de3cb5035a31e976`, 앱 v0.338.
- 서버가 `SESSION_SUPERSEDED`를 실제 반환할 때만 관리자 토큰 제거·명시적 다른 단말 로그인 안내·재시작. 비로그인 POS·일반 권한 거부·네트워크 단절·숨긴 탭은 자동 로그아웃 금지. Node VM 실제 모의 환경 회귀를 지점 개통 매트릭스에 편입.
- PR CI 78/78 PASS. 운영 강제 세션 단일화 훅은 아직 OFF, 별도 실인원/복구 검증 필요. v0.338 운영 배포는 검증 결과 확인 후 확정해야 함.

## 다음 실행시 주의사항
- **사용자 지시:** 장애/CI 차단이 생기면 다른 경로를 찾아 재개하고 GitHub를 정본 증거로 유지. 이미 완료된 레시피 권한 문제 재개발 금지.
- 이 파일은 일감 완료 여부를 강제로 바꾸지 않는다. `PROJECT_BACKLOG_20261017.md` 완료 17/37, 미완료 20/37 체크 판정을 현장 수용/실자료 없이 임의로 변경하지 말 것.

## QA-06 (#1008): 근태·점주 권한·주휴·급여 마감 증거 행렬 확장 (2026-10-19)
- [PR #1200](https://github.com/koith/attendance-proto/pull/1200) / main squash `0b539ae8356fbe418e4e7d91151a55266c68fdbc`. 사용자 17:44 KST 잔여 업무 처리 지시를 #1008 댓글에 원문 보존.
- 실행형 검증 19→26개: 관리자 해임/구세션 알림, 정정 사유의 원본 보존, 서버 주휴 계산의 근거/0원 구별, 주휴 월경계/미완결 근무, 확정 급여 스냅샷 구성·불변성.
- 테스트 파일 자체가 사라지거나 실행 실패하면 전과 달리 JSON/Markdown FAIL 증거를 남기고 CI도 실패하도록 복구. [QA-06 전용 #39225419383](https://github.com/koith/attendance-proto/actions/runs/39225419383) SUCCESS; PR 전체 **53/53 Actions SUCCESS**, main 병합 완료. 운영 원본 변경 없음.
- **원장 QA-06 여전히 미완료:** 현장 지점 공식 주소, JWT 권한 즉시 차단 실제 기기, 지각/조퇴/재입사, 실제 급여 사유 및 점주 마감 검산의 7개 GAP. 합성 26 PASS를 현장 전체 QA 완료로 보고하지 않는다. 앱 화면 자산 미변경이므로 **v0.348 유지**.
- 운영 Supabase 2026-10-19 읽기 전용: stores 244, 활성 READY 1, STORE_MANAGER 행 1, CLOSED payroll 기간 0, payroll snapshot 0, 비시연 operations_transactions 0, 비시연 inventory_movements 0, 시연 transactions 3323. STORE_MANAGER 행 개수는 실제 대표·보조 실인원 인증 E2E 완료 증거가 아니다.

## MTG-08/11 공급사 연결 조사 (2026-10-19, 개발/연동 완료 아님)
- CJ프레시웨이 공식 2024-08-23 보도자료는 온리원푸드넷의 주문·배송·결제·입고검수·재고·증빙서류 출력 기능을 확인함: https://www.cjfreshway.com/newsroom/pr/view.do?seq=3411
- 공식 2026-01-27 자료는 새 식자재 플랫폼 ‘프레시엔’의 AI 장바구니 입력과 일부 외부 주문 시스템 연동 소개: https://cjnews.cj.net/?p=73396
- **미검증:** 백억커피 실제 공급사가 해당 시스템을 사용하는지, 로그인 권한, API/파일 내보내기/외부 장바구니 쓰기 권한 및 거래 원천 확보. 이 확인 전 공급사 주문 자동실행이나 실재고 반영을 하지 않는다.
