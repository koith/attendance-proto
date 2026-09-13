# 선배 요구사항 Production 재감사 — 2026-09-13

기준: 회의록 `업무자동화회의_20260912`, production `main@584a4b6e8ad1aaaae6ececbc16b1d9e722aaffea`, 운영 Supabase `waluhdgqhwjjwmflhrle`.

판정 원칙:
- 코드가 존재한다는 이유만으로 완료 처리하지 않는다.
- 선배가 회의에서 말한 사용 시나리오가 실제 데이터 흐름과 화면에서 성립해야 충족이다.
- iPhone 실기기 확인이 끝나지 않은 항목은 코드가 있어도 `ACCEPTANCE_PENDING`으로 둔다.
- 회의에서 확정하지 않은 정책은 임의 구현하지 않는다.

| 요구 | 현재 판정 | 확인 내용 | 필요한 조치 |
|---|---|---|---|
| 직원 가나다순 + 01,02… 번호 | IMPLEMENTED / ACCEPTANCE_PENDING | 관리자 직원목록이 이름순 정렬 후 `padStart(2,'0')` 번호 표시 | 실기기 확인 |
| 계약 입력 중 시급 등 값 유실 방지 | IMPLEMENTED / ACCEPTANCE_PENDING | form-state draft wrapper 존재 | 실제 편집 시나리오 재확인 |
| 익일(25시 개념) 계약시간 | IMPLEMENTED / ACCEPTANCE_PENDING | 종료시간이 시작시간보다 이르면 익일로 계산, 익일 UI layer 존재 | iPhone time input/표시 재확인 |
| 계약조건 작성 흐름 안에 근로계약서 첨부 | FIXING | main은 계약서가 저장 후 이력 상세에만 노출되어 회의 요구 미충족 | 본 재감사 브랜치에서 계약 저장 폼 안으로 이동, 신규 계약은 파일을 미리 선택 후 contract_id에 연결 |
| 계약서 아무 때나 삭제/교체 | BLOCKED_DB | 운영 `admin_doc_delete`가 업로더 본인 + 24시간 이내만 허용 | DB 함수 정책 변경 필요. 사용자 승인 후 migration |
| 계약서가 해당 계약과 연결 | IMPLEMENTED_DB | 운영 `employee_documents.contract_id` 및 contract-local RPC 존재 | UI가 이 연결을 실제 작성 플로우에서 사용하도록 보완 |
| 계획 스케줄보다 실제 출퇴근 결과 중심 | PARTIAL | 관리자 빠른 메뉴 `근무현황`은 actual attendance로 연결. 기존 계획 스케줄 편집기도 하단에 유지 | 실제 현황을 주 IA로 유지하고 계획표는 보조 기능으로 명확히 구분 |
| 월간 실제근무 현황 | IMPLEMENTED / ACCEPTANCE_PENDING | `admin_events_with_corrections` 기반 월 달력, 날짜별 실제 인원/시간 | iPhone 가독성 확인 |
| 일별 07:00~25:00 간트형 실제근무 | IMPLEMENTED / ACCEPTANCE_PENDING | 날짜 탭 시 07~25 축 + 직원별 가로 bar 렌더 | 사용자가 아직 실기기에서 확인 못함. 배포/진입/가독성 재검증 |
| 실제근무 정정 | PARTIAL | 일별 session에서 correction RPC로 IN/OUT EDIT/ADD 가능, raw attendance 불변 | 장기간 열린 session을 날짜별 00~24 리스트로 펼쳐 선택 수정하는 회의 시나리오 미충족 |
| 퇴근 누락 234시간 같은 장기 session 처리 | PARTIAL | 과거 미퇴근/16시간 초과 등 경고 및 바로 정정 CTA 존재 | 여러 날짜로 분할 표시하여 어느 날짜/시간을 정정할지 직관적으로 선택 가능하게 개선 |
| 영업시간 기반 자동 이상판정 | NOT_REQUIREMENT | 회의의 07~25는 간트 시간축 문맥. 자동 판정/강제퇴근 정책은 확정되지 않음 | 별도 구현하지 않음 |
| 계약값을 급여가 그대로 사용 | FAIL | 현재는 계약 저장 시 `employees.wage/tax_rate` legacy cache로 복사하는 bridge | 급여 계산이 해당 월 유효 계약을 직접 읽도록 전환 |
| 급여 화면 중복 기본설정 제거 | FAIL | 급여에 `기본설정`, 이달 시급/원천징수율 override가 남아 있음 | 계약과 중복되는 입력 제거/보조 조정만 남김 |
| 실근무/정정이 급여에 반영 | PARTIAL | 급여 월 계산은 corrected events를 읽을 수 있음 | 계약 기반 계산과 하나의 흐름으로 통합, 긴 open session 처리 재검증 |
| 급여를 아무 때나 들어가 현재값 확인 | PARTIAL | 진입 시 계산 가능 | 화면 체류 중 자동 재계산 없음. 실제 출퇴근 변화 후 계속 갱신 요구 미충족 |
| 주휴시간 계약값 연동 | PARTIAL / POLICY_BOUND | 기존 legacy 주휴 계산과 elapsed-week guard 존재 | 이미 확정된 주휴 정책은 보존하면서 계약 주당시간을 직접 사용하도록 연결. 미확정 J1/J2는 임의 결정 금지 |
| 야간수당 | PARTIAL | 계약 설정은 저장되나 actual time 급여 합산은 완결되지 않음 | RATE는 확정 의미 범위에서 연결 가능, FLAT은 정책 blocker |
| 월급제 급여 | BLOCKED_POLICY | 계약 저장은 가능, 실제 급여 semantics 미확정 | MONTHLY 정책 확정 전 계산 발명 금지 |
| 테스트용 시간 시뮬레이션 | NOT_STARTED | 운영 시간 흐름만 존재 | 운영 raw data와 격리된 테스트 clock 설계 |
| 대타 기록/연결 | RESEARCH | 회의에서 필요성만 있고 모델 미확정 | 설계 조사 후 별도 제안 |
| 하이웍스 전자결재 대량수집→Excel | NOT_STARTED | 별도 후속 자동화 요구 | 문서유형 선택→전체문서 수집→구조화→Excel 파이프라인 |
| 재고 수불부 | NOT_STARTED | 급여 이후 후속 프로젝트 | 근태/급여 완료 후 착수 |

## 이번 재감사에서 정정한 기존 오판

1. `계약서 문서 DONE`은 잘못된 판정이었다. contract_id 구조는 생겼지만 계약 작성 UX에 포함되지 않았다.
2. `실제근무 정정 DONE`도 회의 시나리오 기준으로는 과했다. 단일 session 정정은 되지만 장기간 열린 기록을 날짜별로 펼쳐 수정하는 요구가 남았다.
3. `계약→급여 연동 DONE`으로 볼 수 없다. 현재 bridge는 authoritative contract를 payroll이 직접 읽는 구조가 아니라 legacy cache 복사다.
4. `07:00~25:00 영업시간 기반 이상판정`은 직접 요구가 아니다. 07~25는 일별 결과 화면의 시간축 요구다.

## 수정 순서

1. 계약 작성 폼에 계약서 첨부 통합 + contract_id 연결
2. 실제근무 간트 진입/표시 배포 재검증
3. 장기 열린 session을 날짜별로 펼치는 근태 상세/정정 UX
4. 급여 계산의 authoritative contract 직접 참조 + 중복 입력 제거
5. 급여 자동 갱신
6. 전체 회귀 QA + exact-SHA Pages 배포 확인 + iPhone acceptance 목록

DB 변경 blocker: `admin_doc_delete`의 24시간/업로더 제한 제거는 별도 승인 후 적용한다.
