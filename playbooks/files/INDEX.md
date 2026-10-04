# 업무자동화 Toolbox Index

이 저장소에는 이미 많은 재사용 자산이 있다. Toolbox는 새 파일만 뜻하지 않는다. 검증된 QA, SQL migration, 런타임 모듈, 데이터 생성 도구, CI workflow를 다시 찾지 않고 꺼내 쓰게 만드는 색인이다.

## 사용 원칙
1. 새 도구를 만들기 전에 이 인덱스와 저장소를 검색한다.
2. 같은 목적의 자산이 있으면 복제하지 않고 기존 자산을 강화한다.
3. 작업 도메인에 맞는 QA 묶음을 선택한다.
4. 반복 사용 가치가 생긴 새 자산만 이 인덱스에 추가한다.
5. 오래된 버전명이 붙어 있어도 현재 코드에 연결된 CI/QA인지 확인 후 폐기 여부를 결정한다. 이름만 보고 삭제하지 않는다.

## 현재 자산 규모
- 루트 `qa_*.mjs/js`: 160개 이상 — 기능/회귀 검증 자산
- `.github/workflows/`: 다수의 자동 회귀 workflow — PR/commit Proof
- `schema*.sql`: 누적 DB/RPC migration 및 정책 기록
- `tools/build_reference_data_v208.py`: 운영 참조 데이터 생성 도구
- `qa/s1_authz_qa.mjs`: 권한 QA
- 기능별 독립 JS/CSS 모듈: 검증된 구현을 재사용할 수 있는 코드 자산

## 도메인별 Toolbox
### 출퇴근 / 근무 / 대타
`qa_actual_attendance_*.mjs`, `qa_admin_today_*.mjs`, `qa_force_close_*.mjs`, `qa_substitution_*.mjs`, `qa_test_mode_*.mjs`, `qa_month*_schedule*.mjs` 및 대응 런타임/CI를 우선 재사용한다.

### 급여 / 계약
`qa_payroll_*.mjs`, `qa_contract_*.mjs`, `qa_employment_contract_*.mjs`, `qa_atomic_period_contract.mjs`, `payroll_*.js`, `employment_contract_*.js`를 우선한다. Golden/replay가 걸린 계산 변경은 기존 회귀를 우회하지 않는다.

### 레시피 / 재고
`qa_v068_recipe_thumbnails.mjs` 이후 recipe 계열, `qa_v083_inventory_receiving.mjs`, `qa_v088_inventory_recipe.mjs`, `qa_recipe_access_v220.mjs`, `qa_store_selector_recipe_v161.mjs`와 관련 schema/operations reference 자산을 우선한다.

### UI / iOS WebView / 공통 카드
`qa_employee_card_*.mjs`, `qa_ios_*.mjs`, `qa_*sticky*.mjs`, `qa_page_title*.mjs`, `qa_ux_*.mjs`, `no_double_tap_zoom.js`를 우선한다.

### 본사 / 지점 / 운영
`qa_store_*.mjs`, `qa_operations_*.mjs`, `qa_chart_time_axis_v206.mjs`, `operations_v1.js`, `operations_reference_v208.js`, `tools/build_reference_data_v208.py`를 우선한다.

### Google Sheets 리포트
`qa_sheet_report_design.mjs`, `qa_sheet_display_values.mjs`, `qa_sheet_new_month_format_contract.mjs`, `qa_sheet_auto_resize_contract.mjs`, `qa_sheet_edge_contract.mjs`, `qa_sheet_auto_sync_v1.mjs`, `.github/workflows/sheet-auto-resize-contract.yml`을 함께 사용한다. 디자인 작업은 `playbooks/examples/sheet-report-references.md`의 실제 조사 출처/구조를 기준점으로 삼고, 실제 화면 검증을 별도 Proof로 남긴다.

### 보안 / 런타임
`qa_boot_syntax.mjs`, `qa_runtime_*.mjs`, `qa_*auth*.mjs`, `qa_*audit*.mjs`, `qa/s1_authz_qa.mjs` 및 대응 CI를 우선한다.

## Proven Examples
완료 결과의 기준점은 `playbooks/examples/README.md`에 등록한다. 새 구현을 시작할 때 유사한 성공 사례가 있으면 코드와 QA를 함께 비교한다.

## 자산 승격 기준
다음 중 하나면 Toolbox 자산으로 취급하고 이 문서에 등록한다.
- 두 번 이상 재사용될 가능성이 높은 스크립트/템플릿/검증기
- 사람의 반복 점검을 자동화하는 QA
- 외부 원본을 안정적으로 내부 참조 데이터로 만드는 생성기
- 재현하기 어려운 과거 버그를 고정하는 fixture/golden data
- 여러 도메인에서 공통으로 쓰는 안전한 코드 패턴

단순 작업 로그, 특정 한 번의 결과 캡처, 비밀정보는 Toolbox에 넣지 않는다.
