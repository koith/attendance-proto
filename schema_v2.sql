-- Sprint 2: 급여 계산용 직원 속성 추가
-- Supabase SQL Editor에서 실행하세요.

alter table employees add column if not exists wage integer;              -- 시급(원)
alter table employees add column if not exists juhyu_hours numeric default 0;   -- 주당 주휴시간(0=주휴없음)
alter table employees add column if not exists juhyu_round integer;        -- 주휴 주당액 반올림 자릿수 (-3=1000원, null=반올림안함)
alter table employees add column if not exists tax_rate numeric default 0.033; -- 원천징수율(기본 3.3%, 회계사 확인 대상)
alter table employees add column if not exists memo text;                  -- 예외 메모("15h미만 1주 차감" 등)

-- 주의: 이 세율/주휴 처리는 현재 매장 관행값. 실배포 전 회계사 검토 필요.
