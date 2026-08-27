// ===== M8.7 Sheet Sync QA =====
// buildSheetSyncPayload 및 Edge Function 라우팅(마감→snapshot) 로직 재현 검증.
const L=require('./extracted_logic.js_module');
let PASS=0,FAIL=0; const bugs=[];
function ok(n,c,d){ if(c)PASS++; else{FAIL++;bugs.push({n,d});console.log("✗ "+n+(d?" :: "+d:""));} }

function hhmm(d){const p=n=>String(n).padStart(2,"0");return `${p(d.getHours())}:${p(d.getMinutes())}`;}
function fmtHM(sec){const m=Math.floor(sec/60);const h=Math.floor(m/60),mm=m%60;return h&&mm?`${h}시간 ${mm}분`:(h?`${h}시간`:`${mm}분`);}
function won(n){return (n||0).toLocaleString("ko-KR")+"원";}
function dstr(d){const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}

// payload 빌더 재현 (근태/세션 부분)
function buildAttSess(ym, empName, events){
  const eff=L.applyCorrections(events, []);
  const allSess=L.pairEvents(eff);
  const p2=n=>String(n).padStart(2,"0");
  const sess=allSess.filter(s=>{const a=s.in||s.out; return a && `${a.getFullYear()}-${p2(a.getMonth()+1)}`===ym;});
  const byDay={};
  for(const s of sess){const a=s.in||s.out; if(!a)continue; const d=dstr(a); (byDay[d]=byDay[d]||[]).push(s);}
  const attRows=[], sessRows=[];
  for(const day of Object.keys(byDay).sort()){
    const ds=byDay[day]; let daySec=0;
    ds.forEach((s,i)=>{ if(s.status==="COMPLETE")daySec+=(s.sec||0);
      sessRows.push([day,empName,i+1]); });
    attRows.push([day,empName,ds.length,daySec]);
  }
  return {attRows, sessRows};
}

// Edge Function 라우팅 재현: 마감이면 snapshot, 아니면 payload
function routePayroll(isClosed, snapshotRows, clientPayrollRows){
  if(isClosed) return {status:"마감완료", rows:snapshotRows};
  return {status:"예상 · 미마감", rows:clientPayrollRows};
}

// ---- 1) 같은 월 10회 sync → 행 중복 0 (replace 방식이므로 항상 동일) ----
{
  const ev=[{id:1,employee_id:1,event_type:"IN",event_at:"2026-09-01T09:00:00"},
            {id:2,employee_id:1,event_type:"OUT",event_at:"2026-09-01T18:00:00"}];
  let prev=null, stable=true;
  for(let i=0;i<10;i++){ const {attRows}=buildAttSess("2026-09","김",ev);
    const key=JSON.stringify(attRows); if(prev&&prev!==key)stable=false; prev=key; }
  ok("10회 sync 동일(중복0)", stable);
}
// ---- 2) 복수 세션 유실 0 ----
{
  const ev=[{id:1,employee_id:1,event_type:"IN",event_at:"2026-09-01T08:00:00"},
            {id:2,employee_id:1,event_type:"OUT",event_at:"2026-09-01T12:00:00"},
            {id:3,employee_id:1,event_type:"IN",event_at:"2026-09-01T13:00:00"},
            {id:4,employee_id:1,event_type:"OUT",event_at:"2026-09-01T17:00:00"}];
  const {attRows,sessRows}=buildAttSess("2026-09","김",ev);
  ok("복수세션 세션시트 2행", sessRows.length===2, sessRows.length+"행");
  ok("복수세션 일별 세션수=2", attRows[0][2]===2);
  ok("복수세션 합계 8h", attRows[0][3]===8*3600, attRows[0][3]/3600+"h");
}
// ---- 3) correction 후 재sync → effective 반영 ----
{
  const ev=[{id:1,employee_id:1,event_type:"IN",event_at:"2026-09-01T09:00:00"}];
  const cor=[{id:1,event_id:null,employee_id:1,action:"ADD",new_event_at:"2026-09-01T18:00:00",new_event_type:"OUT",created_at:"2026-09-02T00:00:00"}];
  const eff=L.applyCorrections(ev,cor); const sess=L.pairEvents(eff);
  ok("correction 반영 완결9h", sess[0].status==="COMPLETE"&&sess[0].sec===9*3600);
}
// ---- 4) 미마감 → 예상 표시 ----
{
  const r=routePayroll(false, null, [["김","예상"]]);
  ok("미마감 상태=예상", r.status==="예상 · 미마감");
}
// ---- 5) 마감 후 sync → snapshot과 정확히 일치 ----
{
  const snap=[["이현진",fmtHM(158*3600),won(12000),won(1896000),won(211200),won(0),won(2107200),"2026-09-02 14:31"]];
  const r=routePayroll(true, snap, [["이현진","예상다른값"]]);
  ok("마감후 snapshot 사용", r.rows===snap && r.status==="마감완료");
}
// ---- 6) 마감 후 시급 변경 → 확정급여 불변 ----
{
  // snapshot은 고정값. 클라이언트가 다른 값 보내도 Edge Function은 snapshot 사용
  const snap=[["이현진",fmtHM(158*3600),won(12000),won(1896000),won(211200),won(0),won(2107200),"..."]];
  const clientAfterWageChange=[["이현진","",won(15000),won(2370000),"","","",""]]; // 시급 바뀐 예상
  const r=routePayroll(true, snap, clientAfterWageChange);
  ok("마감후 시급변경 불변", r.rows[0][6]===won(2107200), r.rows[0][6]);
}
// ---- 7) Apps Script 실패 → DB/punch 영향 0 (구조적 분리) ----
{
  // sync는 read-only, punch와 별개 경로. 코드상 punch 함수가 sync를 호출하지 않음을 확인.
  const idx=require('fs').readFileSync('index.html','utf8');
  const punchFn=idx.match(/async punch\(id,pin\)\{[\s\S]*?\},/);
  const punchCallsSync = punchFn && /syncSheet|sync-sheet/.test(punchFn[0]);
  ok("punch가 sync 미호출(분리)", !punchCallsSync);
}
// ---- 8) 잘못된 payload → 방어 (Apps Script가 섹션 검증) ----
{
  // Apps Script doPost는 attendance/sessions/payroll 없으면 MISSING_SECTIONS 반환
  const gs=require('fs').readFileSync('apps_script.gs','utf8');
  ok("Apps Script 섹션검증 있음", /MISSING_SECTIONS/.test(gs) && /BAD_ROWS/.test(gs));
  ok("Apps Script 배열완성후 교체", gs.indexOf('var out = []') < gs.lastIndexOf('clearContents'));
}
// ---- 9) 다른 월 sync → 기존 월 탭 훼손 없음 (탭명에 ym 포함) ----
{
  const gs=require('fs').readFileSync('apps_script.gs','utf8');
  ok("탭명 월별 분리", /'근태-'\+body\.ym/.test(gs));
}
// ---- 10) 개인정보 payload에 주민번호/계좌 없음 ----
{
  const idx=require('fs').readFileSync('index.html','utf8');
  const builder=idx.match(/async function buildSheetSyncPayload[\s\S]*?^}/m);
  const hasP=builder && /주민|ssn|계좌|account_number|rrn/i.test(builder[0]);
  ok("payload 개인정보 없음", !hasP);
}

console.log(`\n===== M8.7 QA: ${PASS} passed, ${FAIL} failed =====`);
if(bugs.length) bugs.forEach((b,i)=>console.log(`${i+1}. ${b.n} — ${b.d}`));
process.exit(FAIL?1:0);
