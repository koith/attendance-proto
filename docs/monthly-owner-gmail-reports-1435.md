# [#1435] 백억커피 월별 Google Sheet + 직원별 급여명세서 자동 메일

## 구현 상태

- **CODE_VERIFIED (격리 합성 테스트)**. 운영 메일 발송·수신, 연결된 GAS 설치, Supabase Edge 배포는 **미실행**.
- 운영 앱 \`index.html\`, 기존 \`apps_script.gs\`, 운영 Google Sheets, 기존 \`server-sync-sheet\`, DB/급여 원장은 변경하지 않습니다.
- 독립 GAS \`gas/monthly-owner-report/Code.gs\` / 전용 **읽기 전용** Edge \`supabase/functions/monthly-owner-report/index.ts\`.
- 테스트: \`node qa/qa_monthly_owner_delivery_1435.test.mjs\` / Actions \`monthly-owner-delivery-qa.yml\`.

## 이메일

제목: \`[백억커피] {지점명} {YYYY-MM} 근태·급여 자료\`

첨부:
1. \`YYYY-MM_지점명_근태급여.xlsx\` — **기존 연간 Google Sheet의 해당 월 탭만** \`copyTo\`로 독립 임시 스프레드시트에 복사한 후 XLSX export. 원본은 불변; 임시 파일은 휴지통 처리.
2. \`YYYY-MM_급여명세서_직원명_직원ID.pdf\` — 서버의 같은 \`store_id, ym\` **CLOSED** \`payroll_snapshot\` 직원당 1장. 감사를 위한 직원 ID로 동명이인 파일 충돌 방지.

**중요:** 현재 DB에는 공제의 세목별 원천(세금/보험 등)이 별도 보존되지 않고 \`gross_pay/net_pay/tax_rate\`까지만 존재합니다. PDF는 \`공제 총액=세전-지급예정\`을 보여주지만, 구체적 공제 세목을 표시하지 못합니다. 급여명세서의 법정 교부 요건 충족 여부는 노무 검토 후 확정하고, 현 단계에서 법정 필수 서식을 모두 만족했다고 주장하지 않습니다. **급여 확정 기록 ≠ 은행 송금 완료**입니다.

## 매월 말일 날짜와 급여 마감의 충돌

기존 백엔드 \`server_payroll_close_verified\`는 해당 월 종료 전 마감 금지(\`CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE\`).
따라서 말일에 바로 "확정" 급여를 메일로 보낼 수 없습니다.

안전한 기본동작:
- 한국시간 매일 23:45 전후 trigger: 말일에는 해당 월을 확인하지만 미마감이면 **메일 미발송**.
- 다음 달부터 이전 달을 매일 다시 검사. \`CLOSED\` 스냅샷 + 마감 상태로 동기화된 월별 시트 + 인원·급여 합계 검증이 모두 PASS한 뒤 **1회 발송**.
- 마감이 계속되지 않으면 보류 상태 유지. 자동 가짜 마감, 예상 급여의 확정본 위장, 잘못된 달 발송 금지.
- **정확히 말일에 잠정 급여를 보낼지, 익월 마감 후 확정본을 보낼지**는 점주 운영 정책 결정이 필요하며 기본은 후자.

## 분리 및 보안

- 운영 발송은 기본 비활성. GAS Script Properties \`MONTHLY_OWNER_ENABLED=true\`, Edge \`MONTHLY_OWNER_REPORTS_ACTIVE=true\`, \`MONTHLY_OWNER_ALLOWED_STORES\`, 64자 이상 공통 비밀토큰을 따로 설정해야 함.
- GAS \`MONTHLY_OWNER_STORES_JSON\`에는 해당 지점의 **수신자 확인된 Gmail 주소**만. \`verified=true\` · \`enabled=true\` 조건 필요. 코드/PR에 실주소·secret 금지. Gmail 아닌 주소 또는 불일치 지점 거부.
- Edge는 비공개 토큰, store ID allowlist, READY·active, 과거 월·CLOSED, snapshot fingerprint/합계 검증 뒤에만 급여 데이터를 반환. 다른 지점 스냅샷 합치기 금지.
- Gmail이 발송 성공을 반환하기 전에 \`SENDING\`으로 기록. 성공하면 \`SENT\`, 불확실 실패는 \`UNCERTAIN\`으로 고정하고 자동 재전송하지 않음. \`SENT\`도 중복 차단.
- 원본 워크북 월 탭 상태 \`마감완료\` + \`확정 세전급여\` 열 + 서버 인원/명단/합계 대조 후에만 XLSX 생성·메일 발송.
- PDF 작성에 쓴 임시 Google Docs/Excel 파일은 휴지통 이동. 메일 첨부에는 직원 급여 정보가 포함되므로 수신 계정 보안/저장 정책 필요.
- Gmail 첨부 상한(현재 코드 18MiB)/메시지 및 Apps Script 실행 제한과 일일 발송 한도를 확인할 것. 초과하면 발송하지 않고 관리자 검토 필요.
- 발송자 Gmail 계정은 월별 GAS **배포·트리거 소유자**임. 실제 소유자 승인 및 \`script.send_mail\` 권한 승인 전 활성화 불가.

## 실운영 적용 체크리스트 (미완료)

1. 대상 지점 및 **대표 점주가 지정·확인한 Gmail 주소**, 발신 계정을 확정. 보조 관리자 임의 수신 제외.
2. 그 지점에 독립된 연간 Google Sheet의 해당 월 자료가 실제 생성/마감 동기화되는지 확인. 현재 운영 Sheet writer는 명시 승인된 일부 지점에 한정; 다른 지점의 기존 시트를 공유하지 말 것.
3. 급여 원천에서 **공제 세목별 계산 및 지급일**을 보완하고 PDF 표시가 실제 법정 명세서 목적에 적합한지 확인.
4. 테스트용 별도 Apps Script 프로젝트+별도 검증 Gmail 수신자로 XLSX 파일 열기, 실제 PDF 렌더링, 한글, 첨부파일 접근, 잘못된 지점 데이터 유출 방지 검수.
5. 전용 Edge를 **기본 비활성**으로 배포하고 비밀값/점포 allowlist를 서버에서만 지정. verify_jwt 설정에 따라 비밀 헤더를 독립적으로 검증하므로 유효한 token 없으면 무조건 거부.
6. 테스트 메일 1통의 실제 수신 확인, 실패 재시도·중복·취소 검증. **테스트 수신자 외 발송 금지**.
7. 최종 승인 시에만 \`MONTHLY_OWNER_ENABLED=true\` 및 \`installMonthlyOwnerDailyTrigger()\`. 최초 가동 시 과거월을 자동 발송하지 않도록 \`MONTHLY_SENT_{storeId}_{YYYYMM}\` 기록 또는 도입 기준월 제한 정책 설정.
8. 발송 성공·보류·불확실 상태는 Apps Script 실행기록/Script Properties에서 확인. 운영 발송 전 월별 QA/리뷰 프로세스 필요.

## QA 성공 주장 범위

\`qa_monthly_owner_delivery_1435.test.mjs\`는 Node VM으로 Apps Script 로직과 mock Google 서비스를 검사합니다. 외부 Google Drive XLSX 변환, Docs PDF 한글 렌더링, Gmail 송달성, Supabase Edge의 실 데이터 반환은 **실행하지 않습니다**. 따라서 합성 PASS를 운영 메일 전송 완료로 취급하지 않습니다.
