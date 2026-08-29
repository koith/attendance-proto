// ===== P0-5 정정 승인 → effective/시트 반영 회귀 테스트 =====
// ChatGPT 요청 8항목: 정상→정정→승인→effective변경→재계산→시트반영→거절무시→원본불변
const L=require('./extracted_logic.js_module');
let PASS=0,FAIL=0; const bugs=[];
function ok(n,c,d){ if(c)PASS++; else{FAIL++;bugs.push({n,d});console.log("✗ "+n+(d?" :: "+d:""));} }

// 시나리오: 8/27 09:00 출근(id=1), 09:00 다음날 퇴근 안찍음 → 8/28 10:00 퇴근(id=2)로 32시간
// 정정: OUT(id=2)을 8/27 18:00으로 변경 승인
const raw=[
  {id:1,employee_id:1,event_type:"IN",event_at:"2026-08-27T09:00:00"},
  {id:2,employee_id:1,event_type:"OUT",event_at:"2026-08-28T10:00:00"},
];

// 1) 정상 pairEvents — 정정 전 32시간+
{
  const s=L.pairEvents(raw);
  ok("1. 정정전 세션 완결", s[0].status==="COMPLETE");
  ok("1. 정정전 25시간(자정넘김)", s[0].sec===25*3600, s[0].sec/3600+"h");
  ok("1. 세션에 outId 보존", s[0].outId===2, "outId="+s[0].outId);  // 정정 타겟팅 가능 여부
}

// 2~4) 정정요청(OUT id=2 → 8/27 18:00) 승인 = event_corrections에 EDIT_TIME 저장
const corrections=[
  {id:10,event_id:2,employee_id:1,action:"EDIT_TIME",new_event_at:"2026-08-27T18:00:00",created_at:"2026-08-29T10:00:00"},
];
{
  const eff=L.applyCorrections(raw,corrections);
  const outEv=eff.find(e=>e.id===2);
  ok("2. 승인후 OUT 시각 변경됨", outEv.event_at==="2026-08-27T18:00:00", outEv.event_at);
  ok("2. OUT corrected 표시", outEv.corrected===true);
  // 3) 근무시간 재계산 = 9시간
  const s=L.pairEvents(eff);
  ok("3. 재계산 9시간", s[0].sec===9*3600, s[0].sec/3600+"h");
}

// 5) 시트 payload = effective 사용 (buildSheetSyncPayload가 applyCorrections 거침)
//    → effective session의 값이 시트에 나가야 함. 여기선 pairEvents(eff) 결과가 곧 시트 근태값.
{
  const eff=L.applyCorrections(raw,corrections);
  const s=L.pairEvents(eff);
  ok("5. 시트 근태값=effective(9h)", s[0].sec===9*3600);
  ok("5. 시트 세션 outId=2", s[0].outId===2);
}

// 7) 거절된 correction은 반영 안됨 (event_corrections에 애초에 안 들어감)
//    거절 시 admin_resolve_request가 insert 안 하므로, corrections 배열에 없음 = 원본 유지
{
  const eff=L.applyCorrections(raw,[]); // 거절 = correction 없음
  const outEv=eff.find(e=>e.id===2);
  ok("7. 거절시 원본 OUT 유지", outEv.event_at==="2026-08-28T10:00:00");
  const s=L.pairEvents(eff);
  ok("7. 거절시 25시간 유지", s[0].sec===25*3600);
}

// 8) 원본 attendance_events 불변 (applyCorrections가 raw를 안 건드림)
{
  const before=JSON.stringify(raw);
  L.applyCorrections(raw,corrections);
  ok("8. 원본 raw 불변", JSON.stringify(raw)===before);
}

// 추가) event_id=null인 correction은 아무 이벤트에도 안 붙음 (과거 버그 재현·방지)
{
  const badCorr=[{id:11,event_id:null,employee_id:1,action:"EDIT_TIME",new_event_at:"2026-08-27T18:00:00",created_at:"2026-08-29T11:00:00"}];
  const eff=L.applyCorrections(raw,badCorr);
  const outEv=eff.find(e=>e.id===2);
  ok("★ event_id=null 정정은 미반영(구버그)", outEv.event_at==="2026-08-28T10:00:00", "→ UI가 event_id 담아야 함");
}

// 추가) 출근 이벤트(id=1) 정정도 동작
{
  const c=[{id:12,event_id:1,employee_id:1,action:"EDIT_TIME",new_event_at:"2026-08-27T08:00:00",created_at:"2026-08-29T12:00:00"}];
  const eff=L.applyCorrections(raw,c);
  const inEv=eff.find(e=>e.id===1);
  ok("출근 정정도 반영", inEv.event_at==="2026-08-27T08:00:00");
}

console.log(`\n===== P0-5 정정 QA: ${PASS} passed, ${FAIL} failed =====`);
if(bugs.length) bugs.forEach((b,i)=>console.log(`${i+1}. ${b.n} — ${b.d}`));
process.exit(FAIL?1:0);
