# 선배 요구사항 Production 재감사 — 2026-09-13

기준: 회의록 `업무자동화회의_20260912`, production `main@f16334295a91f69c9d3eb46e8f709459feba4fa7`, 운영 Supabase `waluhdgqhwjjwmflhrle`.

판정 원칙:
- 코드 존재만으로 완료 처리하지 않는다.
- 선배가 회의에서 말한 사용 시나리오가 실제 데이터 흐름과 화면에서 성립해야 충족이다.
- iPhone 실기기 확인이 끝나지 않은 항목은 배포됐어도 `ACCEPTANCE_PENDING`으로 둔다.
- 회의에서 확정하지 않은 정책은 임의 구현하지 않는다.

| 요구 | 현재 판정 | 현재 production 상태 | 남은 조치 |
|---|---|---|---|
| 직원 가나다순 + 01,02… 번호 | DEPLOYED / ACCEPTANCE_PENDING | 관리자 직원목록 이름순 + 2자리 번호 | iPhone 확인 |
| 계약 입력 중 시급 등 값 유실 방지 | DEPLOYED / ACCEPTANCE_PENDING | unsaved form-state 보존 | 실제 편집 재확인 |
| 익일(25시 개념) 계약시간 | DEPLOYED / ACCEPTANCE_PENDING | 익일 시간 계산/표시 layer | iPhone time input 확인 |
| 계약 작성 흐름 안에 근로계약서 첨부 | DEPLOYED / ACCEPTANCE_PENDING | 계약조건 폼 안에서 파일을 미리 선택하고 저장된 contract_id에 연결 | iPhone 파일선택/저장 확인 |
| 계약서가 해당 계약과 연결 | DEPLOYED | `employee_documents.contract_id` + contract-local RPC + 작성폼 연동 | 없음 |
| 계약서 아무 때나 삭제/교체 | BLOCKED_DB | UI 삭제는 있으나 `admin_doc_delete`가 업로더 본인 + 24시간 제한 | DB 함수 정책 변경 승인 필요 |
| 실제 출퇴근 결과 중심 IA | DEPLOYED / ACCEPTANCE_PENDING | 관리자 빠른 메뉴 `근무현황` → actual attendance | iPhone 진입 확인 |
| 월간 실제근무 현황 | DEPLOYED / ACCEPTANCE_PENDING | 정정 반영 실제 event 기반 월 달력 | iPhone 가독성 확인 |
| 일별 07:00~25:00 간트형 실제근무 | DEPLOYED / ACCEPTANCE_PENDING | 날짜 탭 → 07~25 축 + 직원별 가로 bar | 사용자가 실기기에서 직접 확인 필요 |
| 실제근무 정정 | DEPLOYED / ACCEPTANCE_PENDING | raw attendance 불변, correction overlay RPC | iPhone 저장/read-back 확인 |
| 234시간 같은 장기 session을 날짜별 표시 | DEPLOYED / ACCEPTANCE_PENDING | 자정 넘는 세션을 날짜별 slice로 펼치고 00:00–24:00 표시; 정정은 원본 IN/OUT에 연결 | iPhone 장기기록 확인 |
| 영업시간 기반 자동 이상판정 | NOT_REQUIREMENT | 07~25는 회의상 간트 시간축 요구이며 자동 강제퇴근 정책은 미확정 | 별도 구현하지 않음 |
| 계약값을 급여가 그대로 사용 | DEPLOYED / ACCEPTANCE_PENDING | HOURLY/BUSINESS_INCOME은 `admin_employment_bundle`의 유효 계약을 직접 읽어 시급·계약 주당시간·세율 계산 | iPhone 급여 화면 확인 |
| 급여 중복 기본설정 제거 | DEPLOYED / ACCEPTANCE_PENDING | 계약 보유자는 payroll `기본설정` 제거; 월 조정에서 시급/주휴시간/세율 숨김 | 확인 |
| 계약 미등록 직원 이행경로 | DEPLOYED | legacy 계산은 임시 유지하되 `계약 등록`으로 유도 | 직원별 계약 전환 필요 |
| 실근무/정정 → 급여 반영 | DEPLOYED / ACCEPTANCE_PENDING | corrected events + contract-authoritative payroll 계산 | 실제 정정 후 금액 변화 확인 |
| 급여를 아무 때나 현재값 확인 | DEPLOYED / ACCEPTANCE_PENDING | 진입 계산 + 화면 노출 중 60초 갱신 + 앱 복귀 시 갱신 | iPhone 확인 |
| 주휴시간 계약값 연동 | DEPLOYED / POLICY_BOUND | 기존 calcPayroll 공식은 그대로 두고 contract weekly minutes를 입력원으로 사용, 미래 주 선반영 방지 유지 | 확정된 주휴 정책 외 확장 금지 |
| 월중 서로 다른 계약조건 | SAFE_BLOCK | 임의 단일 시급으로 계산하지 않고 확인 필요 표시 | 구간별 급여 정책이 필요하면 별도 확정 |
| 월급제 급여 | BLOCKED_POLICY | 계산값을 발명하지 않고 미확정 표시 | MONTHLY semantics 확정 필요 |
| 4대보험 공제 | BLOCKED_POLICY | 공제값을 발명하지 않고 미확정 표시 | 정책 확정 필요 |
| 야간수당 급여 합산 | PARTIAL / POLICY_BOUND | 계약 설정 저장은 됨 | RATE/FLAT 등 확정 의미 범위 확인 후 연결 |
| 테스트용 시간 시뮬레이션 | NOT_STARTED | 운영 punch는 서버시간 사용 | 운영 데이터와 격리된 test clock 설계 필요 |
| 대타 기록/연결 | RESEARCH | 회의에서 필요성은 확인됐으나 모델 미확정 | 설계 조사/정책 결정 |
| 하이웍스 전자결재 대량수집→Excel | NOT_STARTED | attendance-proto와 별도 후속 자동화 | 문서유형 선택→대량수집→구조화→Excel |
| 재고 수불부 | NOT_STARTED | 후속 프로젝트 | 근태/급여 핵심 이후 착수 |

## 이번 재감사에서 실제로 다시 고친 기존 오판

1. `계약서 문서 DONE`을 취소하고 계약서 첨부를 계약 작성 폼 자체에 다시 통합했다.
2. `근태 정정 DONE`을 취소하고 234시간 같은 자정 초과 세션을 날짜별 00:00–24:00로 펼치는 표시/정정 흐름을 추가했다.
3. `계약→급여 연동 DONE`을 취소하고 legacy employee wage 복사 방식 대신 payroll이 유효 계약을 직접 읽도록 변경했다.
4. payroll의 중복 시급/주휴시간/세율 입력을 계약 보유 직원 흐름에서 제거했다.
5. 급여 화면은 60초 및 앱 복귀 시 재계산하도록 보강했다.
6. `07:00~25:00 영업시간 기반 이상판정`은 회의 직접 요구가 아니므로 폐기했다. 07~25는 일별 실근무 시간축이다.

## 배포 확인

- PR #36: 계약 작성 ↔ 계약서 통합
- PR #37: 장기 근태 날짜별 slice/정정
- PR #38: 계약 authoritative 급여 + 중복 설정 제거 + 자동 갱신
- 현재 production SHA: `f16334295a91f69c9d3eb46e8f709459feba4fa7`
- GitHub Pages run #152: exact SHA 기준 SUCCESS

## 현재 blocker

`admin_doc_delete`는 현재 **업로드한 관리자 본인만, 업로드 후 24시간 이내** 삭제를 허용한다. 선배 요구는 **언제든 삭제 버튼으로 삭제/교체**이므로 이 제한을 제거하려면 DB 함수 정책 변경이 필요하다. 사용자 승인 전에는 변경하지 않는다.

정책 blocker(MONTHLY, FOUR_INSURANCE, 야간수당 일부)와 설계 미확정(대타)은 회의에 없는 의미를 임의로 만들어 구현하지 않는다.
