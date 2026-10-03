# Google Sheets 근태·급여 리포트 — 실제 참고자료

이 문서는 "조사했다"는 주장 대신 실제로 확인한 공개 사례와, 현재 백억커피 월간 리포트에 가져올 구조만 기록한다. 외형 복제가 아니라 좁은 화면에서도 읽히는 정보 구조를 우선한다.

## 확인한 사례

1. Smartsheet — Free Attendance Spreadsheet Templates
   - https://www.smartsheet.com/free-attendance-spreadsheet-templates
   - 직원명·날짜·상태처럼 필수 필드를 중심으로 단순한 표를 구성한다.
   - 월간형은 한 달 전체를 한눈에 보는 구조와 제한적인 색상/코드 범례를 사용한다.

2. Smartsheet — Free Google Docs and Spreadsheet Templates / Timesheet & Payroll Register
   - https://www.smartsheet.com/free-google-docs-and-spreadsheet-templates
   - timesheet는 regular/overtime/leave와 일·주·월 합계를 구분한다.
   - payroll register는 근무시간/총급여/공제/실지급 등 급여 검토에 필요한 필드를 표 형태로 분리한다.

3. Smartsheet — Free Excel Timesheet Templates
   - https://www.smartsheet.com/content/excel-timesheet-templates
   - 월간 timesheet에서 날짜, 시작/종료, 정규/초과시간, 휴가, 일별·월별 합계를 명확한 열로 분리한다.

4. Clockify — Spreadsheet Time Tracking
   - https://clockify.me/spreadsheet-time-tracking
   - 월간 스프레드시트는 work hours, lunch break, time off, overtime처럼 실제 검토 항목을 우선 노출한다.

5. Clockify — Timesheet Templates
   - https://clockify.me/timesheet-templates
   - 월간형은 매일의 시작/종료 및 근무시간과 월 합계를 중심으로 구성하고 급여 계산과 연결한다.

## 현재 리포트에 적용할 구조

- 한 월 탭 안에서 근태 현황 → 세션 상세 → 급여 집계 순서를 유지한다.
- 섹션 제목과 표 헤더를 명확히 구분하되 장식용 카드/가짜 KPI는 만들지 않는다.
- 데이터 열 수를 억지로 줄이거나 합쳐 원본 의미를 바꾸지 않는다.
- 열 폭은 실제 셀 내용 기준 auto-resize를 최종 권위로 삼는다. auto-resize 뒤 고정 min/max cap이나 타입별 폭 bucket을 적용하지 않는다.
- 상태/급여처럼 검토 포인트만 제한적으로 강조한다.
- 디자인 완료 Proof는 서식 속성 read-back이 아니라 실제 시트에서 제목/헤더/값이 잘리지 않고 읽히는 화면 확인이다.


## 2026-10-03 재조사 후 선택한 시각 구조

- Vertex42 Monthly Employee Time Sheet: https://www.vertex42.com/ExcelTemplates/free-timesheet-template.html — 인쇄 가능한 월간 표, 진한 단색 헤더, 얇은 본문 그리드, 장식 최소화.
- Vertex42 Timesheets & Payroll: https://www.vertex42.com/ExcelTemplates/timesheets.html — 근무시간과 급여 레지스터를 단순 표 중심으로 분리.
- Smartsheet Google Sheets Attendance: https://www.smartsheet.com/content/attendance-templates-google-sheets — 상태를 제한된 색으로 구분하고 월간 근태를 표 중심으로 유지.
- Clockify Payroll Templates: https://clockify.me/payroll-template — 직원별 시간/시급/급여를 한 행 레지스터로 두고 계산 결과 열만 강조.

현재 시트에는 웹 카드 UI가 아니라 위 사례들의 공통적인 스프레드시트 문법을 적용한다: compact metadata header → section label → dark table header → white rows/thin separators → status/pay result emphasis. 병합 카드와 임의 KPI는 사용하지 않는다. 열 폭은 마지막 단계의 실제 내용 기반 auto-resize가 유일한 권위다.
