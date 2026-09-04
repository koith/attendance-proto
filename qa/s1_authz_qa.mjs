// S1 Authorization QA — anon 레벨 (secret 불필요, anon key는 공개)
// 검증: anon→POS 성공 / anon→ADMIN 실패 / invalid PIN 실패
// admin-success/non-admin은 JWT 필요 → 별도(형님 smoke 또는 secret)
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
if(!URL||!ANON){ console.error("missing env"); process.exit(2); }

async function rpc(fn, args={}, bearer=ANON){
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method:"POST",
    headers:{ apikey:ANON, Authorization:`Bearer ${bearer}`, "Content-Type":"application/json" },
    body: JSON.stringify(args)
  });
  const text = await r.text();
  return { status:r.status, ok:r.ok, body:text.slice(0,200) };
}

const results = [];
function check(name, cond, detail){ results.push({name, pass:cond, detail}); }

const ADMIN_RPCS = [
  ["admin_list_employees",{}],
  ["admin_events",{p_from:"2026-07-01T00:00:00",p_to:"2026-07-02T00:00:00"}],
  ["admin_pending_requests",{}],
  ["admin_payroll_period",{p_ym:"2026-07"}],
  ["admin_snapshot",{p_ym:"2026-07"}],
  ["admin_events_with_corrections",{p_from:"2026-07-01T00:00:00",p_to:"2026-07-02T00:00:00"}],
];

(async()=>{
  // 1. anon → POS RPC (list_employees_state) : 성공해야
  const pos = await rpc("list_employees_state");
  check("anon→POS(list_employees_state) 성공", pos.ok && pos.status===200, `HTTP ${pos.status}`);

  // 2. anon → ADMIN RPC (read-only들) : 전부 실패(403/401/permission)해야
  for(const [fn,args] of ADMIN_RPCS){
    const res = await rpc(fn,args);
    const blocked = !res.ok; // permission denied면 !ok
    check(`anon→ADMIN(${fn}) 차단`, blocked, `HTTP ${res.status} ${res.body.slice(0,80)}`);
  }

  // 3. is_admin() anon 호출 : 차단(EXECUTE revoke)해야
  const ia = await rpc("is_admin");
  check("anon→is_admin() 차단", !ia.ok, `HTTP ${ia.status}`);

  // 4. invalid PIN → punch 실패해야 (BAD_PIN 또는 NO_EMPLOYEE, read 영향 없음)
  //    존재할 법하지 않은 employee_id + 틀린 PIN → 데이터 훼손 없음
  const badpin = await rpc("punch",{p_employee_id:999999,p_pin:"0000",p_device:"QA"});
  //    NO_EMPLOYEE 반환(ok=true지만 error 필드) 또는 실패 → punch가 raw insert 안 함
  const badpinSafe = badpin.body.includes("NO_EMPLOYEE") || badpin.body.includes("BAD_PIN") || !badpin.ok;
  check("invalid PIN/없는직원 punch 안전(insert 안됨)", badpinSafe, `HTTP ${badpin.status} ${badpin.body.slice(0,80)}`);

  // 출력
  let allPass=true;
  console.log("\n===== S1 Authorization QA (anon level) =====");
  for(const r of results){
    const tag = r.pass ? "PASS" : "FAIL";
    if(!r.pass) allPass=false;
    console.log(`[${tag}] ${r.name}  ::  ${r.detail}`);
  }
  console.log(`\n===== ${allPass?"ALL PASS":"SOME FAILED"} =====`);
  process.exit(allPass?0:1);
})();
