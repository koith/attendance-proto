# 선배 요구사항 Production 재감사 — 2026-09-14

기준: 2026-09-12 업무자동화 회의 요구, production main, 운영 Supabase `waluhdgqhwjjwmflhrle`.

판정 원칙:
- 코드 존재만으로 완료하지 않는다.
- 실제 데이터 흐름과 선배의 사용 시나리오가 모두 성립해야 한다.
- iPhone 실기기 미확인 UI는 `ACCEPTANCE_PENDING`이다.
- 정책이 확정되지 않은 급여/자동퇴근 의미는 임의 구현하지 않는다.

| 요구 | 현재 판정 | 현재 구현 / 남은 조치 |
|---|---|---|
| 직원 식별 번호를 이름과 함께 일관 표시 | IMPLEMENTED / ACCEPTANCE_PENDING | POS, PIN, 관리자, 급여, 계약, 실제근무에 고정 `No. XX` 보조표시. 실기기 확인 필요 |
| 계약 입력값 유실 방지 | IMPLEMENTED / ACCEPTANCE_PENDING | form-state draft 보존 |
| 익일 계약시간 | IMPLEMENTED / ACCEPTANCE_PENDING | 종료<시작이면 익일 계산 및 익일 UI |
| 계약 작성 안에서 계약서 첨부 | IMPLEMENTED / ACCEPTANCE_PENDING | 계약 폼에서 파일 선택, 저장된 contract_id에 첨부 |
| 계약서와 해당 계약 연결 | IMPLEMENTED | contract_id 기반 contract-local 문서 RPC 사용 |
| 계약서 언제든 삭제 | BLOCKED_DB | `admin_doc_delete`의 업로더+24시간 제한 제거가 필요 |
| 실제근무 중심 IA | IMPLEMENTED / ACCEPTANCE_PENDING | 관리자 빠른 `근무현황`을 주 진입점으로 사용, 계획 스케줄 버튼/예정정보는 선배 UI에서 제거 |
| 월간 실제근무 | IMPLEMENTED / ACCEPTANCE_PENDING | correction 반영 actual attendance 월 달력 |
| 일별 07:00~25:00 타임라인 | IMPLEMENTED / ACCEPTANCE_PENDING | 직원별 가로 막대 + 정상완료/근무중/확인필요 범례 |
| 비활성 과거 직원 이름 유지 | IMPLEMENTED / ACCEPTANCE_PENDING | historical employee id를 전체 직원 목록으로 resolve. `#11` 같은 내부 fallback 제거 |
| 장기/미퇴근 기록 날짜별 표시 | IMPLEMENTED / ACCEPTANCE_PENDING | 자정 넘김 세션을 날짜별 00:00~24:00 slice로 파생 표시 |
| 관리자 근태 정정 | IMPLEMENTED / ACCEPTANCE_PENDING | raw attendance 불변, correction overlay의 EDIT_TIME/ADD 사용 |
| 정정 결과가 급여에 반영 | IMPLEMENTED / REGRESSION_LOCKED | payroll이 `eventsWithCorrections → applyCorrections → pairEvents → hours`를 사용. 별도 회귀검사 추가 |
| 계약값을 급여가 직접 사용 | IMPLEMENTED / ACCEPTANCE_PENDING | HOURLY/BUSINESS_INCOME은 `admin_employment_bundle` 계약 시급·주당분·공제율 직접 사용 |
| 급여 중복 기본설정 제거 | IMPLEMENTED / ACCEPTANCE_PENDING | 계약 직원의 중복 시급/주휴시간/세율 입력 제거 |
| 세전 금액 최우선 | IMPLEMENTED / ACCEPTANCE_PENDING | 직원 카드 세전 급여 hero, 합계도 세전 우선; 세후는 보조 |
| 급여 지속 갱신 | IMPLEMENTED | 급여 화면 60초 refresh + visibility 복귀 refresh |
| 주휴 미래주 선반영 금지 | IMPLEMENTED | 현재월은 완료된 일요일 기준, 미래월 0. 수동 주수 입력은 선배 UI에서 숨김 |
| 야간수당 급여 반영 | PARTIAL / POLICY_BOUND | 계약 저장은 됨. 실제근무 야간시간 산정의 종료범위 및 RATE/FLAT 적용 의미를 확정해야 함 |
| 월급제 급여 | BLOCKED_POLICY | MONTHLY 계산 의미 미확정 |
| 4대보험 공제 | BLOCKED_POLICY | 공제 계산 의미 미확정 |
| 매장 오픈/마감 설정 | BLOCKED_DB | 현재 store/config 저장 구조가 없음. 관리자 매장정보 + open/close/grace 저장 구조 필요 |
| 마감근무 식별 / 마감 후 미퇴근 감지 | BLOCKED_BY_STORE_CONFIG | 마감시각 기준이 저장되어야 정확히 파생 가능 |
| 마감 후 자동 강제퇴근 | BLOCKED_POLICY_DB | 회의에서 아이디어/예시는 있었으나 정확한 grace와 correction 방식 확정 후 서버 처리 필요 |
| 장시간 근무 경고 | PARTIAL / POLICY_BOUND | 현재 16시간 초과 경고 존재. 회의에서 언급된 더 짧은 기준을 확정 없이 변경하지 않음 |
| 테스트용 시간 시뮬레이션 | NOT_STARTED | 운영 raw attendance와 완전히 격리된 테스트 clock 필요 |
| 대타 연결 | RESEARCH | 누구의 대타/몇 시간인지 모델 미확정 |
| Hiworks 전자결재 대량수집→Excel | NOT_STARTED / SEPARATE_AUTOMATION | 전자결재 전체문서 목록에서 대상 문서군 구조화 추출 |
| 재고 수불부 | NOT_STARTED / FOLLOW_UP | 근태·급여 핵심 안정화 후 후속 프로젝트 |

## 현재 남은 blockers

### 1. 계약서 무제한 삭제 — DB 변경 필요
현재 서버가 업로더 본인 + 24시간 이내만 삭제 허용한다. 선배 요구는 관리자라면 시점과 업로더에 관계없이 삭제 가능이다. `admin_doc_delete` 권한정책 변경이 필요하다.

### 2. 매장 오픈/마감 — DB 구조 필요
운영 public schema에 store/setting/config 계열 저장소가 없다. 최소한 매장별 `open_time`, `close_time`, `close_grace_minutes`를 저장하고 관리자 RPC로 읽기/수정하는 구조가 필요하다. 이 값이 있어야 마감근무/미퇴근 탐지를 하드코딩 없이 구현할 수 있다.

### 3. 자동 강제퇴근 — 정책 확정 필요
서버가 실제 OUT을 생성할지, correction ADD로 닫을지, 관리자 확인대기로 만들지 결정이 필요하다. raw attendance 보존 원칙상 correction 기반 또는 관리자 검토형이 안전하다.

### 4. 야간/월급/보험 일부 계산 — 정책 확정 필요
확정되지 않은 법/급여 의미를 앱이 임의로 만들지 않는다.

## 다음 작업 순서
1. correction→payroll 회귀 고정 및 전체 CI
2. iPhone actual attendance / 직원번호 / PIN 반복탭 acceptance
3. DB 변경 승인을 받으면 계약서 삭제정책 + 매장정보 저장구조
4. 매장 마감근무/미퇴근 파생표시
5. 테스트 clock
6. 대타 모델 제안
7. Hiworks 자동화
8. 재고 수불부
