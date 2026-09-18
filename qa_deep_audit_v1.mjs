import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function ok(cond,msg){ if(!cond) throw new Error(msg); }

const payroll=read('payroll_contract_authority_v1.js');
const index=read('index.html');
const store=read('store_controls_v1.js');
const contract=read('employment_contracts_v3.js');
const docs=read('employment_contract_docs_v1.js');
const senior=read('senior_requirements_v3.js');
const closeout=read('.github/workflows/senior-unblocked-closeout-v1-regression.yml');
const migration=read('schema_v18_security_audit_hardening.sql');

ok(payroll.includes('c.night_allowance_end'), 'night allowance end must participate in contract term identity');
ok(payroll.includes("(s.status==='COMPLETE'||s.status==='WORKING')&&s.in"), 'WORKING sessions must be checked against contract coverage');
ok(payroll.includes('const CACHE_TTL_MS=60000'), 'contract bundle cache needs a bounded TTL');
ok(!payroll.includes("if(!LIVE){lastResult=R;return R;}cache.clear();"), 'live compute must not clear contract bundle cache every 10s');
ok(payroll.includes("drawPay=async function(ym){cache.clear();"), 'full redraw must explicitly refresh contract bundle cache');
ok(payroll.includes("kpi.querySelector('.kpi-value')"), 'live patch must update gross total KPI');
ok(payroll.includes("kpi.querySelector('.payroll-total-net')"), 'live patch must update net total KPI');
ok(payroll.includes("card.querySelector('.payroll-night-note')"), 'live patch must update night allowance detail');
ok(!payroll.includes('setInterval(refresh,60000)'), 'legacy periodic full payroll redraw must stay removed');
ok(!senior.includes('setInterval(liveRefresh,10000)'), 'senior overlay must not restore periodic full payroll redraw');

ok(index.includes('q.delete("focus"); q.delete("resume");'), 'admin return focus must be consumed once');
ok(index.includes('history.replaceState(null,"",location.pathname'), 'one-shot admin focus must be removed from URL');
ok(index.includes('else window.scrollTo({top:0,left:0,behavior:"auto"})'), 'normal Admin tab entry must reset to top');
ok(!index.includes('if(new URLSearchParams(location.search).get("focus")==="employees") empsEl.scrollIntoView'), 'renderAdmin must not persistently re-apply focus query');
ok(!store.includes('resetAdminScroll'), 'store controls must not own Admin navigation scrolling');

ok(!contract.includes('정액 적용 단위는 정책 확정 전까지 급여에 자동 합산하지 않습니다.'), 'stale night-pay copy must not return');
ok(contract.includes('야간수당을 계산해 세전 급여에 합산합니다.'), 'contract copy must match implemented night payroll');
ok(docs.includes('const storageOk=await BE.contractDocRemove'), 'contract document deletion must surface storage cleanup result');
ok(docs.includes('저장소 파일 정리가 필요합니다.'), 'orphaned storage cleanup must be visible to admin');

ok(!index.includes('세후(3.3%)·주휴 처리는 현재 매장 관행값입니다.'), 'legacy payroll policy copy must not be shown');
ok(index.includes('월급제·4대보험은 정책 확정 전 금액 계산을 보류합니다.'), 'blocked payroll policies must be explicit');
ok(payroll.includes("c.payroll_type==='MONTHLY'") && payroll.includes('월급제 급여 계산정책 미확정'), 'MONTHLY calculation must remain policy-blocked');
ok(payroll.includes("c.tax_treatment==='FOUR_INSURANCE'") && payroll.includes('4대보험 공제 계산정책 미확정'), 'FOUR_INSURANCE calculation must remain policy-blocked');

ok(!closeout.includes("FOUR_INSURANCE.*(0\\.[0-9]+|[0-9]+%)"), 'brittle line-based blocked-policy regex must stay removed');

ok(migration.includes('alter table public.store_settings enable row level security'), 'store_settings RLS hardening missing');
ok(migration.includes('revoke all privileges on table public.store_settings from anon, authenticated'), 'store_settings direct client grants must be revoked');
ok(migration.includes("p.proname like 'admin\\_%'"), 'admin RPC hardening must cover admin_* functions');
ok(migration.includes('correction_requests_event_id_idx') && migration.includes('substitution_requests_substitute_employee_id_idx'), 'advisor FK indexes missing');

console.log('deep-audit-v1 regression: PASS');
