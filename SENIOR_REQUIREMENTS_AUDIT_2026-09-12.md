# 선배 회의 요구사항 Production Audit — 2026-09-12

기준 production: `main@9d6cb0950c48bacca1b15f42e5ead173d00f49bb`

판정 원칙: UI field 존재만으로 DONE 처리하지 않는다. 실제 production code, DB object/RPC, QA를 함께 확인한다. 정책 미확정은 임의 구현하지 않는다.

| 요구사항 | 상태 | production 근거 | 남은 작업 | 정책 blocker |
|---|---|---|---|---|
| 직원 출근/퇴근 | DONE | `punch`, `attendance_events`, POS PIN flow | 현장인증은 별도 PoC | 없음 |
| 하루 복수 session | DONE | `pairEvents`, punch IN/OUT 반복, M8.5 분할근무/FUZZ QA | 없음 | 없음 |
| raw attendance 보존 | DONE | correction은 `event_corrections` overlay, raw 불변 QA | 없음 | 없음 |
| 근태 summary/detail | DONE | 관리자 오늘 근태 + 본인 기록/세션 상세 | 없음 | 없음 |
| 직원별 예정 근무일/시간 | DONE | `work_schedules`, schedule RPC | 없음 | 없음 |
| 일별 schedule | DONE | `daily_schedule.*` | 없음 | 없음 |
| 월간 schedule | DONE | `monthly_schedule.*` + batch/save QA | 없음 | 없음 |
| WorkSchedule planned / Attendance actual 분리 | DONE | 별도 DB/RPC 및 관리자 화면 분리 | 없음 | 없음 |
| 고용기간 | DONE | `employment_periods`, period RPC, contract UI | 이력 IA 단순화 필요 | 없음 |
| HOURLY 계약 | DONE | `employment_contracts.payroll_type`, hourly wage, save/read-back QA | 없음 | 없음 |
| MONTHLY 계약조건 저장 | DONE | MONTHLY + `monthly_salary` 저장 구조/RPC | 급여 계산은 별도 | 없음 |
| MONTHLY 급여 계산 | BLOCKED_POLICY | 현재 월 급여 엔진은 legacy hourly 기반 | 월급제 계산 semantics 확정 후 구현 | MONTHLY semantics |
| 계약 근무요일 | DONE | `employment_contract_workdays.weekday` | 없음 | 없음 |
| 계약 근무시간 | DONE | planned_start/end, iPhone native time UX | 없음 | 없음 |
| 주당 계약시간 | DONE | server-derived `weekly_contracted_minutes`, UI 표시 | 없음 | 없음 |
| 주휴 후보(>=15h) + 계약시간/5 공식 구조 | PARTIAL | `admin_contract_weekly_preview`가 candidate와 `/5` preview 제공 | 실제 월 급여 엔진을 contract 기반 weekly entitlement로 연결 | J1, J2 |
| 명시적 무단결근 판정 구조 | PARTIAL | `absence_decisions`, `admin_absence_decision_set/list` 존재; 자동 무단결근 없음 | 관리자 review UX + 주휴 entitlement 연결 | J1/J2와 주 단위 적용 |
| 야간수당 설정 | PARTIAL | 계약에 enabled, start, RATE/FLAT, value 저장 | 실제 attendance 야간분 계산 및 급여 반영 | FLAT은 J4 |
| 야간수당 RATE 계산 | NOT_STARTED | 설정 저장만 존재, payroll 엔진 합산 없음 | 22:00 이후 actual time 계산 + RATE 반영 | 없음(요구된 RATE 의미 범위 내) |
| 야간수당 FLAT 계산 | BLOCKED_POLICY | FLAT 설정 저장 가능, 자동 합산 안 함 | 적용 단위 확정 후 계산 | J4 |
| 사업소득 계약 설정 | DONE | BUSINESS_INCOME + 계약별 deduction rate 저장 | 급여 엔진 contract 적용은 아래 별도 항목 | 없음 |
| 사업소득 공제의 계약 기반 급여 적용 | PARTIAL | 현재 `calcPayroll`은 legacy employee/월 override tax rate 사용 | 해당 월 적용 contract의 deduction rate를 급여 계산에 연결 | 없음 |
| 4대보험 계약 설정 | DONE | FOUR_INSURANCE 선택 저장 | 공제 workflow는 별도 | 없음 |
| 4대보험 실제 공제 workflow | BLOCKED_POLICY | UI는 확정 공제금액을 급여 단계에서 처리한다고 안내 | 총액 vs split 결정 후 입력/지급액 반영 | J3 |
| 최종 지급액 | PARTIAL | legacy 사업소득 net 계산은 존재 | contract tax treatment + 4대보험 workflow 연결 | J3 |
| 급여 월 조회/마감/snapshot | PARTIAL | 월 계산, 마감 RPC/snapshot 구조 존재 | 신규 contract payroll engine과 연결 필요 | J1/J2/J3/MONTHLY |
| Google Sheets | DONE | Supabase Edge → Apps Script → Sheet, M8.7 QA | 신규 payroll payload가 정해지면 regression 유지 | 없음 |
| 계약조건 관리 | DONE | 기간별 contract + workdays + tax/night config | 이력 IA 단순화 진행 | 없음 |
| 계약서 문서 | DONE | `employee_documents`, Storage/RPC, 관리자 문서 UI; production metadata 존재 | 계약조건과 개념은 분리 유지 | 없음 |

## Production DB 구조 확인

현재 public DB에는 `attendance_events`, `event_corrections`, `work_schedules`, `employment_periods`, `employment_contracts`, `employment_contract_workdays`, `absence_decisions`, `payroll_period`, `payroll_period_employee`, `payroll_snapshot`, `employee_documents` 등이 분리되어 있다.

Audit 시점 운영 row count는 attendance_events 30, work_schedules 31, employment_periods 4, employment_contracts 2, contract_workdays 4, employee_documents 3이다. absence_decisions와 payroll_snapshot은 각각 0이다. 이 숫자는 상태 확인용이며 audit 과정에서 운영 데이터를 수정하지 않았다.

## 우선순위

1. 현재 계약 화면의 고용·계약 이력 IA를 조회 중심으로 단순화한다. DB 구조/이력 보존은 유지한다.
2. 다음 기능 개발은 `명시적 결근 판정 UX`와 `계약 기반 급여 계산`을 분리한다. 자동 무단결근 판정은 금지한다.
3. 정책 blocker 없이 구현 가능한 핵심은 야간 RATE actual-time 계산 및 사업소득 계약 공제 연결이다. 단 기존 golden payroll replay는 legacy regression으로 보존한다.
4. J1/J2/J3/J4 및 MONTHLY 계산 semantics가 필요한 지점에서는 계산을 확정하지 않는다.

## 정책 blocker

- J1: 월 경계 주의 주휴 귀속
- J2: 중도 입·퇴사 partial week 주휴
- J3: 4대보험 실제 공제 입력 총액 vs split
- J4: 야간 FLAT 적용 단위
- MONTHLY: 월급제 실제 급여 계산 semantics
