# 선배 요청 — 답변 불필요 범위 마감 점검 (2026-09-16)

기준 production: `main@4ac630965f38a1f8cf20ad214105f18455ca3800`.

## 구현 완료 — 선배 추가 답변 불필요

- 실제 출퇴근 결과 중심 IA, 월간/일간 실제근무 및 07:00~25:00 타임라인
- raw attendance 불변 + correction/audit overlay
- 장기 미퇴근 날짜별 slice 표시/정정 경로
- 매장 open/close/grace 설정 및 overdue open session의 audit ADD OUT force-close
- 계약 입력 state 보존, 익일 종료시간, 계약 작성 흐름 내 계약서 연결, 관리자 계약서 삭제
- 계약을 급여 authoritative source로 사용하고 급여의 중복 wage/tax 설정 제거
- corrected actual attendance 기반 시급제 급여
- 근무 중 현재시각까지 세전 급여 실시간 누적
- 계약 야간 시작/종료 + RATE/시간당 정액의 실제 야간근무 반영
- 기존 확정 주휴 로직 보존 + 미래 주휴 선반영 방지
- 사업소득 계약 공제율 적용
- TEST clock: 운영 데이터와 격리, 과거/미래 이동, 명확한 TEST 표시
- TEST 출퇴근/정정/급여 sandbox
- 대타 요청/승인/거절/취소 + 실제근태 연결, TEST sandbox 격리
- 직원 이름 + No. 표기, inactive historical employee 표시 보존
- 급여 refresh 단일-flight 조정 및 계약 bundle 단기 cache
- 계약서 삭제 metadata/storage 불일치 위험 완화

## 의도적으로 미구현 — 선배 정책 답변 필요

### MONTHLY
1. 월급제 직원의 일부 결근을 월급에서 차감하는지
2. 차감한다면 시간단가/일급 환산 기준
3. 월급제 직원의 대타에 추가 지급하는지와 산식

답변 전에는 시간/후보 정보만 계산하고 월급 금액을 임의 가감하지 않는다.

### FOUR_INSURANCE
1. 월별 실제 공제액 입력 방식
2. 보험별 분리 입력인지 합계 입력인지
3. 회사부담분을 총 인건비에 포함할지
4. 향후 고지/회계자료 자동연동 여부

답변 전에는 임의 보험요율을 하드코딩하지 않는다.

## 별도 프로젝트로 보류

- 하이웍스 전자결재 수집 → Excel
- 재고 수불부

위 두 항목은 근태/급여 본체의 미완료 기능으로 취급하지 않는다.

## Acceptance 경계

코드/DB/자동 QA/Pages 배포가 완료되어도 iPhone 실기기 UX는 사용자 실기기 확인 전 PASS로 승격하지 않는다. 이는 선배 정책 blocker가 아니라 acceptance 단계다.
