# Proven Examples

만족스럽게 완료되고 Proof를 통과한 결과 중, 다음 작업의 기준점으로 재사용할 가치가 있는 것만 등록한다.

## 등록 원칙
- 단순 스크린샷 창고가 아니다.
- “이와 같은 동작/구조를 다시 만들어야 할 때” 비교 기준이 되는 결과만 남긴다.
- 가능하면 결과물 자체를 복사하지 말고 현재 저장소의 파일/QA/커밋을 가리킨다.
- UI 예시는 모바일/데스크톱 조건을 함께 적는다.
- 데이터/계산 예시는 입력과 기대 결과를 fixture/golden 형태로 남긴다.
- 새 예시를 만들 때 기존 예시와 중복이면 교체/통합한다.

## 초기 기준점
- 직원 카드 반응형: `qa_employee_card_responsive_v071.mjs` 및 employee-card QA 계열
- 실제 근태 계산: `qa_actual_attendance_*.mjs` 계열
- 급여/계약 계산: payroll/contract QA 및 기존 Golden/replay 자산
- 레시피/재고 연결: `qa_v088_inventory_recipe.mjs` 및 recipe/inventory QA 계열
- 운영/지점: `qa_operations_v1.mjs`, `qa_store_*.mjs`

실제 후속 작업에서 사용자가 만족한 결과가 확정되면 이 목록을 더 구체적인 파일/fixture/commit 기준으로 강화한다.
