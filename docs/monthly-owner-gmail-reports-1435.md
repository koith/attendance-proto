# #1435 월말 점주 Gmail — 검토용 + 확정본 2회 전달

## 사용자 최종 확정 정책 (2026-10-31)

- 매월 **말일 23:30~23:59 KST** (스케줄 점검 15분 간격): 마감 여부와 무관하게 현재 지점 근태·급여를 **미마감/검토용**으로 이메일 전송.
- 점주가 앱에서 검토, 근무기록/수당/계약 정정 후 급여 마감 결정. 마감 시 **메일 첨부액을 재사용하지 않고 서버 최신 근태로 재계산**, 기존 마감 API의 요건에 따라 확정.
- **마감 후 별도 자동 발송**: `payroll_period.status=CLOSED`와 변경 불가 `payroll_snapshot` + 월 시트의 마감완료 표시를 교차 검증하고 **확정본** XLSX+직원별 PDF를 전송.
- 검토용/확정본은 각각 월당 한 번만 발송. 의심/불확실 수신은 재발송 차단 및 운영 재확인 필요.
- 발송 수신자는 고정 설정이 아니라 **발송 직전 `store_primary_owners`의 현재 대표 관리자 → `admin_users` 역할 → `auth.users` 인증 이메일** 기준. 타점 계정/직원/보조 관리자에게 발송 금지. 대표 변경 직전 2차 조회 후 변경됐으면 전송 보류.
- 메일 본문과 검토용 PDF에 **미마감 · 검토용 · 확정액 아님** 표시. 근무 중/누락/계약 문제는 해당 직원 PDF에 `확인 필요`로 표시하며 추정 시간/금액을 0원으로 위장하지 않음.
- 연간 스프레드시트 전체가 아니라 **해당 월 시트 한 장**을 독립 XLSX로 추출. 기존 운영 원본 시트/근태/급여/계약 수정 금지.

## 구현 파일

- `supabase/functions/monthly-owner-report/index.ts`: 독립 read-only Edge. 기존 검증된 `server-sync-sheet/engine.mjs`와 `sheet_server_payroll_source`를 재사용하여 PREVIEW 급여 산정; FINAL은 원본 `payroll_snapshot`에서 읽음. 기본 비활성.
- `gas/monthly-owner-report/Code.gs`: 독립 Apps Script 메일러. 수신자 메일 설정 없음. `MONTHLY_OWNER_WORKBOOKS_JSON`은 지점 → 연간 파일 ID만 포함. 15분마다 도는 트리거는 승인 후 생성.
- `qa/qa_monthly_owner_delivery_1435.test.mjs`: 합성 데이터, 수신자 변경, 미확정·미마감·마감후 재발송, 중복/불확실 전송과 지점 범위 검사.
- `.github/workflows/monthly-owner-delivery-qa.yml`: 코드/합성 QA. 운영 발송 작업 없음.
- `supabase/migrations/20261031112000_inha_dual_hq_primary_owner.sql` 및 후속 디렉터리 호환 패치: 사용자 요청으로 `sso0ng0612@gmail.com` 계정의 기존 HQ 역할을 유지하고 **인하대학교점** `OWNER` 지점 자격을 분리 등록. `store_primary_owners`와 `store_admin_memberships(OWNER)`를 사용. 다른 지점 대표 권한은 부여하지 않음. 실제 DB 적용 여부는 SQL readback 기준.

## 중요: 10월 31일 말일/급여 마감 관계

기존 운영 급여 마감 API는 **당월 중 마감 금지**. 따라서 10월 31일 말일에는 PREVIEW만 가능하고, 11월 1일부터 점주가 월말 기록을 확인/정정한 뒤 CLOSED 처리하면 FINAL을 전송합니다. 두 이메일 사이 급여액 차이가 생길 수 있으므로 제목·본문·첨부 PDF에 상태 명시.

## 운영 활성화 필요 (현재 OFF)

1. 대표 관리자 본인 확인·실제 발송 Gmail의 OAuth/MailApp 동의와 테스트 수신 확인.
2. 점포별 **별도 연간 Google Sheet** 매핑 및 Google Drive 액세스 검증. 기존 `server-sync-sheet`는 일부 지점만 Google Sheet 동기화를 허용하므로 모든 READY 지점이 자동 수신한다고 가정하면 안 됨.
3. 전용 Edge 비밀 설정: `MONTHLY_OWNER_REPORT_TOKEN` 최소 64자, `MONTHLY_OWNER_REPORTS_ACTIVE=true`, `MONTHLY_OWNER_ALLOWED_STORES` (허가 점포ID 리스트). 전용 Edge는 서비스 역할키를 웹에 공개하지 않음.
4. 독립 GAS Script Properties: `MONTHLY_OWNER_ENABLED=true`, `MONTHLY_OWNER_REPORT_TOKEN`, `MONTHLY_OWNER_START_YM=YYYY-MM`, `MONTHLY_OWNER_WORKBOOKS_JSON` (지점 파일ID만). 최초 기동 시 과거 월 이메일 역발송 금지.
5. 독립 GAS 프로젝트+전용 Edge에 대한 격리 테스트: 실제 Excel/PDF 한글 렌더링, 권한, 첨부 용량, Gmail 수신, 실업무 데이터 불변 확인. 합성 QA 통과만으로 실운영 송달을 주장하지 않음.
6. 운영 전 공제 상세 항목/실제 지급일은 현 DB에 충분히 보존되지 않으므로 이 PDF를 **법정 임금명세서 완성본**으로 단정하지 않음. 추후 급여 원천이 확장되면 필수 항목 검증 필요.

## 배송 안전성

- 감사 키 `MONTHLY_SENT_{PREVIEW|FINAL}_{storeId}_{YYYYMM}`: 각 상태별 `SENDING/SENT/UNCERTAIN`; 애매한 실패는 자동 재송신 금지.
- 미완성 직원 급여: PDF는 직원별 생성하되 빈값은 별도 확인 상태. 해당 직원이 Google Sheet 급여 표에 포함돼도 없는 금액을 임의로 채우지 않음.
- 서버가 권한, 지점, 월, 급여원천을 검증하지 못하면 전송을 거부. 메일 첨부 최대 약 18MiB 초과 시 중단. Google Docs/Sheets 임시 파일은 휴지통 처리.
- **검토용 문서와 확정본의 PDF는 모두 점주 관리·검토 목적**이고, 직원에게 법정 교부 완료 또는 실제 송금 완료라는 의미는 아님.

## 완료 범위

운영 인하대점 대표 권한의 SQL 검증과 독립 모듈의 합성 QA는 구분. 실제 Gmail 자동 발송, Google Script 권한 동의 및 실수신 E2E가 검증되기 전에는 전체 기능을 ACCEPTED로 처리하지 않음.
