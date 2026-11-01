# PIN 서버 보호 — #1442 / 운영 미적용

기준 main28176492/v0.381, 운영 PostgreSQL17.6. 2026-10-31 읽기 전용으로 실제 함수 정의·ACL·모든 PIN 경로를 확인했다. 운영 직원/PIN/근태/급여/권한/설정/Sheets 변경0. 독립 감사 원문은 운영 DB 접근 불가를 명시하므로 실제 정의와 구분했다.

## 실제 원인과 범위

공개 RPC 4종(punch/my_events/request_correction/staff_actual_attendance)은 익명 직원 PIN 흐름을 위해 공개돼 있으나 서버 실패 제한이 없다. 대타 6종·레시피·재고 검증 경로도 같은 PIN을 확인한다. kiosk unlock에는 기존 5회/15분 및 매장100회 제한이 있지만 다른 RPC와 공유되지 않았다. PUBLIC 실행은 제거하고 의도된 anon/authenticated/service_role만 명시 허용한다. 직원 PIN/매장 PC의 기존 인자·성공 응답은 유지한다.

## 설계

- 직원별 15분 고정 창에서 잘못된 PIN 5회. 창이 끝날 때까지 맞는 PIN도 차단하며, 차단 호출은 시간을 연장하지 않는다. 동료·다른 지점 전체를 잠그지 않는다. 4자리 자체의 한계와 특정 직원에 대한 일시 서비스 거부 위험은 남는다.
- 모든 PIN 경로가 동일 직원 실패 예산을 사용한다. 유효 직원만 상태를 생성하며 임의 ID를 통한 무제한 상태 생성은 허용하지 않는다. 기존 직원용 private sequence는 설치 시 생성하고 새 직원 INSERT trigger에서 준비한다. 직원 데이터나 PIN을 바꾸지 않는다.
- 단순 UPDATE 카운터는 `RAISE`, singular-response 오류, `Prefer: tx=rollback` 등으로 취소될 수 있다. 실패 상태를 private sequence의 (UTC window-start seconds*10 + failures)에 기록한다. sequence setval은 transaction rollback으로 취소되지 않는다. 직원별 advisory lock으로 동시성을 직렬화한다. PIN/해시/이름/IP는 상태에 저장하지 않는다.
- JSON RPC는 기존 `{ok:false,error}` 계약에 RATE_LIMITED/retry_after_seconds를 더한다. TABLE RPC는 기존 성공 TABLE 형식을 보존하고 실패는 HTTP400/429와 빈 결과로 정상 반환하여 보안 상태를 보존한다. stocktake verify의 false를 모든 공개 호출자가 검사한다. 성공 후 업무 오류/권한 검사는 기존 동작을 유지한다.
- private schema/table/function/sequence는 PUBLIC/anon/authenticated/service_role 직접 접근 금지, table RLS/FORCE RLS. 실제 anon 접근·시퀀스 수정 거부를 검증한다.
- 기본 OFF. OFF에서는 기존 PIN 비교만 수행한다. high-risk 승인 전 운영 설치·활성화·자동배포 금지. 새로운 매장 등록/기기 로그인 절차를 임의로 요구하지 않는다.

## 증거와 한계

`qa/pin-security/baseline.sql`은 실제 운영 함수 정의만 포함한다. 운영 행·개인정보·비밀은 없다. 합성 스키마의 외부 의존 함수 일부는 stub이므로 전체 운영 마감/Google/실기기 성공으로 확대하지 않는다. 원래 함수 소스 fingerprint가 다르면 migration을 중단한다.

로컬 실제 PostgreSQL17.11에서 수정 전 실패를 확인했고 수정 후 SQL30건·PostgREST14.1 HTTP14건을 통과했다. 고의 ROLLBACK, tx=rollback, TABLE singular-response 오류에도 실패 횟수가 사라지지 않는다. 동시12요청, 기본OFF, 기존PC인자·모바일IN/OUT, 대타 예산공유, 재고/레시피 성공 응답, 새 직원, 비활성/타점/이벤트 소유권, 잠금 만료, 보호 업무표 불변을 포함한다. CI는 PostgreSQL16/17 별도 인스턴스에서 재실행한다.

## 설치·검증·복구 (승인 후만)

1. 최신 main/운영 정의·ACL·Auth 설정을 재조회하고 read-only 복구 기준을 보관한다. 설치 대상 source hash와 15개 경로가 동일한지 확인한다. 운영 PgBouncer/PostgREST 버전도 확인한다.
2. 명시 승인 후 단일 트랜잭션으로 migration 설치. source_archive에 그 시점의 15개 원본 정의/공개 ACL과 설치후 hash를 저장한다. 기본OFF 유지. 직원/근태/급여 등 업무표 전후 digest 비교. 신규 객체에 데이터 API 접근 권한이 없어야 한다.
3. 격리 HTTP/PC·모바일 검증을 같은 소스로 재확인한 뒤 별도 승인된 제한 범위/시간에 enabled=true 전환. 운영 직원에게 테스트 출퇴근/PIN 실패를 유도하지 않는다. 실사용 수용은 사람에게서 별도 확인한다.
4. 장애 시 `UPDATE pin_private.settings SET enabled=false WHERE id`로 보호만 OFF하거나 검증된 `qa/pin-security/rollback.sql`로 코드 복구한다. rollback은 source drift면 중단하여 뒤에 생긴 hotfix를 덮어쓰지 않는다. 기존 업무표·새 근태/급여를 삭제/복원하지 않는다. private 상태/감사도 보존한다.
5. 새 직원이 추가된 뒤 복구해도 직원 행을 삭제하지 않는다. source 복원과 새 근태 보존, drift 실패의 원자성을 disposable DB에서 검증했다. 기본OFF 또는 rollback은 취약점 보호도 OFF이므로 원복 상태를 보안 완료로 보고하지 않는다.

sequence state는 DB 장애 복구 시 일부 실패 예산이 재설정될 수 있고 WAL/백업 수명 정책이 적용된다. 실제 운영 부하·연결 지연/브라우저 정상 사용 수용은 운영 미적용 상태에서 VERIFIED로 표시하지 않는다.
