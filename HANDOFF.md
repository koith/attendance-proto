# 백억커피 근태·급여 프로젝트 — 인수인계 (2026-08-25)

이 문서는 다른 AI(ChatGPT)가 이어받아 작업하기 위한 것이다. 지금까지의 결정·검증·미해결 쟁점·다음 할 일을 담았다. **추측을 사실로 적지 말 것. 확인된 것과 미확정을 명확히 구분했다.**

---

## 0. 프로젝트 한 줄 요약

소상공인(카페) 운영 자동화 프로젝트의 하위 모듈 중 **근태·급여** 파트. 팀은 3명(제품오너=선배 점주 아님 주의, 회계사 1명, 게임개발 경험 개발자 1명). 이 담당자는 근태·급여를 맡음. 테스트베드는 **백억커피 인하대점**(회계사 지인 매장 아님, 실제 운영 카페). 배달·매출·재고는 별도 파트라 이 문서 범위 밖.

목표: `종이 월력 수기 → 사람이 엑셀 전사·계산`의 노가다를 `POS 출퇴근 타각 → 자동 집계 → 급여 자동계산 → 세무사 넘길 엑셀`로 대체.

---

## 1. 현재 배포 상태 (실제 동작 중)

- **앱**: 단일 HTML 파일 모바일 웹앱. `koith/attendance-proto` 레포, GitHub Pages 배포.
- **URL**: https://koith.github.io/attendance-proto/  (캐시 갱신은 `?v=N`)
- **백엔드**: Supabase 전용 프로젝트 `baekeok-hr` / project `attendance`, 서울 리전.
  - URL: `https://waluhdgqhwjjwmflhrle.supabase.co`
  - 테이블: `employees`, `attendance_events` (+ Sprint2 급여컬럼). schema.sql / schema_v2.sql 참조.
  - **RLS 미적용(without RLS)** — 실배포 전 반드시 켜야 함. anon key도 노출 전제이므로 실배포 시 재발급.
- **스택 결정**: 원래 GPT가 FastAPI+SQLite 로컬 서버로 만들었으나, 담당자 워크플로우(아이폰 사파리에서 코드수정→GitHub push→자동배포)와 안 맞아 **단일 HTML + Supabase**로 전면 재구성함. FastAPI 버전은 폐기. 이 결정은 되돌리지 말 것.

### 앱 구조 (index.html 하나에 전부)
- 백엔드 어댑터 2개: `LocalBE`(localStorage, CONFIG 비우면 활성) / `SupaBE`(Supabase REST). 동일 인터페이스.
- 3개 탭: `#pos`(출퇴근 타각), `#admin`(오늘 근태+직원관리), `#pay`(급여).
- PIN은 PBKDF2-SHA256 해시 저장(WebCrypto, HTTPS 필수).

---

## 2. 검증 완료된 것 (신뢰 가능)

### 2-1. 시간 변환 규칙 (Sprint 1) ※2026-08-25 점주 확인으로 정정됨
인하대점 `근무시간` 시트의 **수기 월력 이미지 3장**을 판독해 역설계함. 당시 관찰된 규칙:
> 근무시간 = 퇴근 − 출근 (퇴근≤출근이면 +24h), 30분 단위, 휴게 차감 없음.

**중요 정정**: 위 "30분 단위"는 **검증된 계산규칙이 아니다.** 점주 확인 결과, 직원들이 종이 월력에 출퇴근을 대충 30분 단위로 적었을 뿐이며, 신규 시스템의 목적은 **실제 출퇴근시각을 분/초 단위로 정확히 기록**하는 것이다.
- 따라서 **실서비스 Raw 타각·근무시간 계산에서는 30분 반올림/절삭을 하지 않는다.**
- 7월 Excel의 30분 단위 값은 **"기존 수기자료 재현용 회귀테스트(Legacy Replay)"로만** 유지한다. 실서비스 계산과 분리한다.
- 자정넘김·미완결·고아·분할근무 세션화(`pairEvents`) 로직 자체는 Node 유닛테스트 통과(유효).
- 인하대점은 점주 확인상 **현재 별도 휴게를 운영하지 않음**. 단, 이는 "법적으로 휴게 불필요"가 아니며 현행 사실과 법규 검증은 분리한다(회계사 검토 대상).

### 2-2. 급여 계산 로직 (Sprint 2)
인하대점 7월 급여정산요약 시트를 수식째로 역설계. 6명 전원 24개 값(기본급·주휴·세전·세후) **Python replay + JS 이식 모두 24/24 일치**.
- **기본급** = `ROUND(시급 × 실근무, -1)` → 10원 **반올림** (내림 아님. 초기 오독 정정됨)
- **세후** = `ROUNDDOWN(세전 × 0.967, -1)` → 10원 **버림**, 3.3% 원천징수
- **주휴는 통일 공식 아님**. 직원별로 다름:
  - 이현진: `시급 × 4.4h × 4주` (반올림 없음)
  - 이창헌: `ROUND(시급 × 4.2h, -3) × 4주` (주당액 1000원 반올림)
  - 김다인: 15h미만이라 1주 차감 등 **수기 예외** 존재
- 결론: 급여는 "기본 자동계산 + 관리자 조정/근거표시"가 맞다는 강한 증거. 앱도 직원별 `juhyu_hours`/`juhyu_round`/`memo` 필드로 이 구조를 반영함.

---

## 3. 미해결 쟁점 (다음 작업의 핵심)

### 3-1. 주휴 "주 수" 하드코딩 ★가장 큰 미결
현재 코드:
```js
function weeksInMonth(ym){ return 4; }  // 하드코딩
```
- 주휴수당 전체가 여기 걸림. 4주 vs 5주에 따라 주휴 25% 차이.
- 정확한 주 수 계산이 안 단순함: 월요일/일요일 개수? 두 달 걸친 주 귀속? 월중 입·퇴사 부분주?
- **엑셀에서 사장이 수기 메모("21시간 기준 추가", "15h미만 1주 차감")로 처리하던 영역** = 자동화 제일 까다롭고 회계사 판단 필요.
- 방향: 회계사한테 "주휴 주 수를 어떻게 세는 게 맞나" 확정받고 구현. 추측 구현 금지.

### 3-2. 세율·주휴·휴게의 법적 정당성 미검증 ★회계사 필수
- 3.3%가 맞는지는 **계산 문제가 아니라 고용형태(근로자 vs 사업소득자) 사실 판정**. 코드로 못 정함.
- 휴게 미차감이 맞는지도 "실제로 쉬었나" 사실 문제.
- 시뮬레이션으로 **확인 가능**: 최저임금 위반 체크, "현재방식 vs 법정방식 차액" 병렬 계산, 야간(22~06) 시간 자동 집계.
- 시뮬레이션으로 **확인 불가**: 세율 정당성, 휴게 차감 여부(사실 판정).

### 3-3. 실 타각 데이터 없음
급여 입력값(월 실근무시간)은 직원이 실제 출퇴근을 찍어야 생김. 현재는 테스트 몇 건뿐. **최소 한 달 실운영** 필요.

---

## 4. 두 매장 방식이 다름 (스키마 설계에 중요)
- **인하대점**: "월별 실근무 집계형". 날짜별 시간 수기입력 → 합산. 야간·초과 없음(7월 기준). 3.3% 일괄.
- **구로고척점**(참고자료로 받음): "주간 근무표 스케줄형". 시간대를 "19~26"처럼 텍스트로, **자정 넘김 일상, 야간수당 실재, 직원별 주휴O/X·휴게O/X, 정직원 월정액, 5인이상 사업장 의식**.
- 결론: **WORK_SCHEDULE은 모델에 나중에 붙일 수 있게 열어두되, 인하대점 V0.1엔 스케줄관리부터 만들지 않음.** 야간수당은 구로고척 때문에 결국 필요(인하대만 보면 뺄 뻔함).

---

## 5. V0.1 범위 (합의됨)

**포함**: POS 비밀번호(4자리) 출퇴근, 오늘 근태 조회, 직원 등록/비활성화, 월 집계, 시급제 기본급, 주휴(조정가능), 누락/이상근태 "확인필요" 감지, 예상급여, 세전 계산, 급여설정 편집.

**제외(의도적)**: 실제 급여이체, 4대보험·세무신고, **개인정보(주민번호·계좌 저장 안 함 — 급여계산 불필요)**, WORK_SCHEDULE 관리, 오프라인 큐, 멀티POS 페어링, GPS/지문/NFC, 모든 고용형태.

**놓쳤다가 추가한 것**: 직원 본인 정정요청 플로우(PIN으로 내 기록 열기→정정요청→관리자 승인). 아직 **미구현**. 종이/카톡 완전 대체의 마지막 조각이라 중요. Sprint 3 이후 후보.

---

## 6. 스프린트 진행

- **Sprint 1 (완료·검증)**: POS 타각 → Supabase 저장 → 관리자 조회. 실제 동작 확인됨.
- **Sprint 2 (완료·검증)**: 월 집계 → 기본급/주휴/세전/세후. 엑셀 24/24 일치.
- **버그 수정 이력**: (a)Supabase 204 빈응답 JSON 파싱 오류 → 수정. (b)PIN 제출 시 PBKDF2 지연 중 중복실행 → `padBusy` 락 + "처리중" 표시 + 제출직전 상태 재조회로 수정(두 기기 상태 불일치 해결). (c)용어 변경: 타각→출퇴근, PIN→비밀번호.
- **Sprint 3 (예정)**: 세무사 넘길 엑셀 출력. **단, 회계사가 원하는 형식 확정 후 만들 것**(추측 형식 금지).

---

## 7. 바로 다음 할 일 (담당자 미결정 상태로 넘김)

담당자가 마지막에 고민한 선택지(아직 결정 안 함):
1. **법정 계산 병렬 모드** — 같은 타각데이터로 (현재 매장방식) vs (법정방식: 정확한 주수+휴게차감+야간가산) 나란히 계산해 차액 표시. 회계사 판단근거 제공 + 3-1(주수) 자연 해결. V0.1 범위 초과 작업.
2. 주 수 계산만 먼저 제대로.
3. 회계사한테 먼저 물어보고(3-1,3-2 확정) 답 받으면 구현.
4. 계산 로직 정리 문서부터(회계사 검토용).

**담당자 성향**: 회계사한테 가기 전에 시뮬레이션으로 판단근거(차액 데이터)를 만들어주는 쪽에 관심 보임. 3번의 "무작정 질문"보다 "데이터 들고 질문" 선호로 읽힘. 단 최종 결정은 안 내림.

**추천 순서(이 AI 의견)**: 회계사 검증(3-2)이 논리적 선행. 계산이 엑셀과 똑같아도 엑셀 자체가 틀리면 똑같이 틀림. 다만 담당자 성향상 "법정 병렬 모드"를 먼저 만들어 차액을 보여주고 회계사 검증을 받는 하이브리드가 현실적.

---

## 8. 작업 규칙 (담당자 워크플로우 — 반드시 지킬 것)

- 개발은 아이폰 사파리 + 모바일. 코드 수정 → GitHub Contents API로 push → GitHub Pages 자동배포 → `?v=N`로 확인.
- 단일 HTML 유지. 무거운 프레임워크·빌드스텝 금지(POS 저사양).
- push 전 `node --check`로 JS 문법 검증.
- 계산 로직 변경 시 반드시 7월 엑셀값으로 replay 재검증(24/24 유지 확인).
- **추측으로 만들지 말 것**. 이 프로젝트의 핵심 교훈: 외부 동작·법규는 확인 후 구현. build-then-correct 반복 경계.
- 개인정보(주민번호·계좌)는 저장하지 않는다.
- 노출된 GitHub PAT·토큰은 작업 후 revoke.

---

## 9. 파일 목록 (레포/outputs)
- `index.html` — 앱 본체 (3탭 + 두 백엔드 어댑터 + 급여계산)
- `schema.sql` — 기본 테이블
- `schema_v2.sql` — 급여 계산용 컬럼(wage, juhyu_hours, juhyu_round, tax_rate, memo)
- `README.md` — 사용/배포 안내
- `HANDOFF.md` — 이 문서

## 10. 검증 자산 (재현용)
- 원본 엑셀: `인하대점_백억커피_07월_인사관리.xlsx`(급여정산요약+근무시간+월력이미지3장), `구로고척_..._정산.xlsx`(26개월 스케줄).
- replay 스크립트 로직은 index.html의 `calcPayroll`와 동일. 재검증 시 7월 6인 기대값:
  - 이현진 세후 2,037,660 / 이현서 600,500 / 이창헌 1,234,120 / 안덕원 503,960 / 김다인 1,019,890 / 이서현 89,810.

---
---

# ★ 업데이트 (2026-08-26 저녁) — M3~M8 완료 + 버그수정

이 아래가 최신 상태다. 위쪽 내용보다 이 섹션이 우선한다.

## 완료된 마일스톤 (전부 배포·검증됨)
- **M3 Hardening**: 서버측 bcrypt PIN 검증(pgcrypto), 서버시각(now()), RLS, 관리자 Supabase Auth 로그인(이메일). 관리자 계정은 대시보드 Authentication에서 생성.
- **M4 종이 없애기**: 직원 정정요청(내 기록 보기→요청) + 관리자 승인 큐 + 관리자 직접수정. **원본 불변** 원칙: attendance_events는 안 고치고 event_corrections에 보정 누적, applyCorrections()로 유효값 계산.
- **M5 급여기간 모델**: 직원 영구설정 vs 이달 조정(payroll_period_employee) 분리. 이달 override가 다음달 오염 안 시킴. 주휴 주수는 payroll_period.weeks(관리자 설정, 비우면 4). 검증 6/6.
- **M8 월마감+Excel**: 급여 마감 시 payroll_snapshot에 계산근거 고정, fingerprint로 마감후 변경 감지, SheetJS(CDN)로 브라우저에서 세무사용 xlsx 다운로드. 검증 5/5.
- **7월 Replay 회귀**: 모든 변경 후에도 6/6 유지(이현진 2,037,660 등).

## 적용된 SQL (Supabase에서 실행 완료)
schema.sql(기본) → v2(급여컬럼) → v3_final(Auth+RPC) → v4(정정/보정) → v5(급여기간) → v6(마감).
추가 수동 조치(중요, 재구축 시 필수):
1. `create extension pgcrypto with schema public;` — 안 하면 gen_salt 못 찾음. (Supabase 기본은 extensions 스키마라 함수의 search_path와 안 맞음)
2. 그래도 안 되면 `alter table employees drop column if exists pin_hash;` — 옛 PBKDF2 NOT NULL 컬럼이 방해. 지금은 pin_bcrypt만 씀.
3. 모든 pgcrypto 쓰는 함수는 `set search_path=public,extensions` 필수.

## 오늘 잡은 버그들 (재발 방지용 기록)
1. **직원등록 gen_salt 오류**: pgcrypto 스키마 문제 → 위 수동조치로 해결.
2. **중복 출근 버그**(핵심): 같은 사람이 IN만 연속으로 찍힘. 
   - 1차 원인: punch RPC가 `order by event_at`(초단위 동률) → `order by id desc`로 변경.
   - 진짜 원인: **앱의 전역 touchend 핸들러**(더블탭 줌 방지용)가 iOS 사파리에서 확인버튼 click을 이중발화 → submitPad 2회 호출. 해당 핸들러 제거로 해결. 더블탭 줌은 CSS `touch-action:manipulation`로만 처리.
   - 추가 방어: submitPad에서 즉시 padBusy=true + 확인버튼 disabled.
3. **확인버튼 자동제출**: 4자리 채우면 자동실행 → 확인 눌러야 실행하도록 변경.
4. **빈 화면 메시지 좌측 정렬**: .empty에 grid-column:1/-1 추가.
5. **punch 8초 제한(TOO_SOON) 제거**: 시간으로 막지 않기로 결정. 연타 방지는 "팝업 닫힘 + 버튼잠금 + 재선택시 비번 재입력"으로 충분. 현재 punch 함수에 TOO_SOON 없음(최종본).

## 현재 punch 함수 최종 상태
PIN 검증(bcrypt) → 직전이벤트 `order by id desc`로 판정(IN이면 OUT, 아니면 IN) → insert. 시간제한 없음. search_path=public,extensions.

## 배포/운영
- URL: https://koith.github.io/attendance-proto/ (캐시 `?v=N`, 현재 v12+)
- 앱은 punch/list_employees_state(anon) + admin_*(authenticated) RPC만 호출. 테이블 직접접근 안 함(RLS).
- 개발: 아이폰 사파리, GitHub Contents API push, node --check 필수.
- 노출된 GitHub PAT는 작업 후 revoke 권고(미확인).

## 다음 (사람·현장 검증 단계, 개발 아님)
- **M6 회계사 검증**: 주휴 공식·휴게·3.3% 세율이 법적으로 맞는지. 데이터/화면 들고 갈 준비 됨.
- **현장 Shadow Pilot → M9 한 달 병행운영**: 9월을 첫 Full-month 후보.
- **주휴 주수 자동계산**: 회계사가 "주수 세는 법" 확정하면 구현(지금은 관리자 수동).
- **M11 구로고척(2호점)**: 스케줄형 매장이라 WORK_SCHEDULE 필요해질 것.

---
---

# ★★ 업데이트 (2026-08-26 밤) — M8.5 자동QA + M8.5B 적대적QA 완료

## M8.5 자동 QA Sprint (완료)
Shadow Pilot 전 자동 버그헌팅. 실제 배포 코드의 로직함수를 추출(extracted_logic)해 테스트.
- **발견·수정 버그**: 주휴수당 부동소수점 오차(211200.00000000003). weekly/juhyu를 Math.round로 정수화. 배포됨.
- 47 케이스 전원 통과. 7월 Golden 24값 = 절대사수 회귀테스트로 고정.
- 파일: qa_m85.js (레포)

## M8.5B 적대적 QA (완료)
동시성·권한·극단값·무결성 파괴 목적.
- **발견 버그(Critical): 동시 punch race condition**. 두 요청이 커밋 전 동시에 직전이벤트 읽으면 둘다 같은판정→중복IN. iOS 이중발화를 UI에서 막았어도 서버 레벨에서 부활 가능(POS 여러대/네트워크 재전송).
- **수정**: punch에 `pg_advisory_xact_lock(hashtext('punch_emp_'||id))` 추가 → 직원별 서버 직렬화. schema_v7_race.sql 실행 완료.
- Fuzz 61,541 세션(deterministic seed 1~2000) 음수/상태이상 0. 극단 timestamp(0초/1초/25h) 정확. 급여 1000케이스 전부 정수KRW.
- 파일: qa_m85b.js, schema_v7_race.sql (레포)

## 금액계산 원칙 (ChatGPT 합의)
모든 급여금액 저장·최종계산은 정수 KRW. JS Number 소수연산 의존 금지. 비율계산 필요시 어느 단계 어떤 rounding인지 명시. 단 반올림규칙 자체가 법/회계 판단인 항목은 M6 전 임의확정 금지.

## 현재 남은 위험 (제 환경 제약으로 미검증 → 형님/실기기 몫)
1. **race 수정의 실제 DB 동시성 검증**: 컨테이너에서 supabase.co egress 차단으로 실호출 불가. advisory lock은 Postgres 표준이라 로직상 확실하나, 실기기 2대로 같은직원 동시타각 최종확인 필요.
2. **권한 negative test 실호출 미검증**: anon이 admin_* RPC/테이블직접접근 거부되는지. 코드상 auth.role() 체크+RLS로 구조적 방어됨. 실기기 로그아웃상태 관리자기능 시도로 갈음.
3. **correction 입력검증**: OUT<IN 역전보정을 서버가 아직 안막음(관리자승인이 방어선). 무결성 시뮬상 음수 안나지만 입력단 검증 추가 권장.
4. **Layer3 브라우저 E2E**: 컨테이너 크롬설치 네트워크차단으로 자동화 불가 → 실기기 Pre-Pilot으로 이관.

## 다음 순서 (ChatGPT 확정)
M8.5A ✅ → M8.5B ✅ → **실기기 Pre-Pilot**(개발자 본인이 iPhone/iPad/POS Chrome에서 10~15분 의도적 스트레스: 더블탭/연타/느린네트워크/동시타각) → M6 회계사검증 → 직원 Shadow Pilot → 9월 M9 Parallel Run

## QA 재실행 방법 (다음 세션)
컨테이너에서: extracted_logic.js_module 재생성(index.html에서 함수추출) → `node qa_m85.js` + `node qa_m85b.js`. 코드 변경 시마다 회귀 확인.

---
---

# ★★★ 업데이트 (2026-08-30) — 실사용 회의 반영 + P0 통합 + 브랜드 (v24)

## 현재 배포: v24 (koith.github.io/attendance-proto/?v=24)

## 이번 세션에서 완료 (회의 20260828 실사용 피드백 반영)
### 실제 버그 수정
- **정정 승인→시트 미반영 (P0-5)**: 근본원인 = 프론트가 request_correction에 event_id=null 하드코딩 + pairEvents가 원본 이벤트 id 안 보존. → pairEvents에 inId/outId/inRaw/outRaw 추가, 정정 UI가 정확한 event_id 전송. 회귀 QA(qa_correction.js) 13개.
- **급여설정 저장 42883**: admin_update_employee(p_fields **json**)에서 '?' 연산자(jsonb 전용) 사용. → schema_v9_jsonb.sql로 json→jsonb. **DB 적용 완료 확인함**(pg_proc에서 jsonb 1개만). 
- **반려 prompt 취소 버그**: prompt 취소해도 반려 실행되던 것 → null 체크로 중단.

### UX 수정
- modal backdrop 클릭 닫힘 제거(입력보호), 명시적 취소/X로만 종료
- modal 우상단 X 버튼 공통 주입(openAddVeil 헬퍼)
- 배경 스크롤 잠금(body:has), modal 내부 더블탭 줌 차단(touch-action)
- 탭(출퇴근/관리자/급여) + 타이틀 sticky 고정(.topbar)
- 내 근태 flow를 업무 state 기반 재구성: STEP1 인증→STEP2 기록→STEP3 정정. 뒤로가기 각 단계 하나씩. **STEP2→STEP1 시 PIN 폐기(인증 우회 방지)**
- 정정 날짜/시간 입력: datetime-local → 년/월/일 + 시:분 분리 select. 세션 기존값 기본. 실시간 예상근무시간 + validation(퇴근≤출근 차단, 문구 "퇴근 시각은 출근 시각보다 늦어야 합니다")
- 주휴 반올림/원천징수 → select 드롭다운 (아이폰 numeric 키패드 음수 입력 불가 해결)
- PIN alert → 인라인 안내
- LONG_SESSION_THRESHOLD_HOURS=16 상수화 (heuristic, 계산 무영향, "장시간 근무·확인필요" 표시)

### 브랜드
- 로고 2개 레포에 저장: logo_combine.jpg(타이틀용), logo_single.jpg(아이콘용)
- 타이틀 텍스트 → logo_combine 이미지 교체
- 브랜드 그린 #1d5d3a를 Primary(--accent, --in)로. :root 변수만 바꾸면 타 업종 대응 가능.

## 적용된 SQL (이번 세션, DB 반영 완료)
- schema_v8_pending.sql: admin_pending_requests가 orig_event_at/orig_event_type 반환(승인화면 수정전 표시)
- schema_v9_jsonb.sql: admin_update_employee json→jsonb (42883). pg_proc 검증 완료.

## QA: 총 81개 (qa_m85 47 + qa_m85b 8 + qa_m87 13 + qa_correction 13). 전부 PASS. Golden 7월 6/6 유지.

## ★ 미해결 버그 (다음 세션 최우선)
**오버나이트 세션 시간 계산 오류.** 구글시트에서 발견:
- 홍당무 8/27 02:23출근→10:58퇴근인데 "32시간 34분" (실제 8h35m이어야)
- 홍당무 8/30 13:07→13:07인데 "23시간 59분" (0분이어야)
- 장필순도 8/27 02:23→10:57 "32시간 34분"
계산식(Date 차이)은 맞으므로 원인은 (a)원본 event_at 날짜 꼬임 (b)pairEvents 짝짓기 오류 (c)정정으로 시각만 바뀌고 날짜 안맞음 중 하나.
**진단 SQL (홍당무 실제 이벤트 확인):**
```
select ae.id, ae.event_type, ae.event_at, ec.action, ec.new_event_at, ec.created_at
from attendance_events ae
left join event_corrections ec on ec.event_id=ae.id
where ae.employee_id=(select id from employees where name='홍당무')
order by ae.id;
```
이 결과로 32시간의 실제 원인 규명 필요.

## 다음 순서
1. 오버나이트 버그 규명·수정 (위 SQL부터)
2. v24 통합 실기기 검증 (backdrop/뒤로/인증우회/날짜시간/correction승인/시트반영/급여저장) → 통과 시 P0 CLOSED
3. **계약관리 2단계 설계안** (구현 아직 X): Employee ↔ Employment Contract 분리, effective date/history, 시급제/월급제, 계약스케줄, 야간수당, 4대보험/사업소득 타입, 입퇴사, 계약서 Storage, 특약메모. 기존 employee/payroll_period/snapshot과의 관계 설계.
4. 자동 시트 갱신(P1) - 계약관리 후

## 법률/세무 금지 (M6 회계사 검증 전까지)
주휴 요건/계산식, 야간수당 적용조건/가산율, 휴게 자동공제, 3.3%/4대보험 계산식을 AI가 임의 확정 금지. 타입 선택·값 저장만.
