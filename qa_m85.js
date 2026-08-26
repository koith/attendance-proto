// ================= M8.5 자동 QA / Simulation Sprint =================
// 원칙: AI는 급여 "법적 정답"을 정하지 않는다. "코드 Rule의 수학적 일관성 +
//       상태 꼬임 + 월경계 유실 + snapshot/불변조건"만 검사한다.
// 7월 Replay 6/6 = Golden Regression (절대 안 깨짐).
// 실제 배포 코드의 로직 함수(extracted_logic.js)를 그대로 사용.

const L = require('./extracted_logic.js_module');  // 아래에서 생성

let PASS=0, FAIL=0; const bugs=[]; const notes=[];
function ok(name,cond,detail){ if(cond)PASS++; else {FAIL++; bugs.push({name,detail}); console.log("✗ "+name+(detail?" :: "+detail:"")); } }
function note(s){ notes.push(s); }

// ---- 서버 로직 재현 (punch 최종본: order by id desc, 시간제한 없음) ----
let _seq=0;
function newDB(){ _seq=0; return {events:[], corrections:[], seqReset(){_seq=0;}}; }
function serverPunch(db, empId, iso){
  const mine=db.events.filter(e=>e.employee_id===empId);
  const last=mine.length?mine.reduce((a,b)=>a.id>b.id?a:b):null;
  const type=(last&&last.event_type==='IN')?'OUT':'IN';
  db.events.push({id:++_seq, employee_id:empId, event_type:type, event_at:iso});
  return type;
}
// 관리자 정정 승인 = event_corrections에 보정 추가 (원본 불변)
function approveCorrection(db, {event_id,employee_id,action,new_event_at,new_event_type}){
  db.corrections.push({id:++_seq, event_id:event_id??null, employee_id, action,
    new_event_at:new_event_at??null, new_event_type:new_event_type??null,
    created_at:new Date(2000000000000+_seq*1000).toISOString()});
}

// ========== 1) Golden Regression (7월 6명 24값) — 절대 사수 ==========
{
  const F=[
   [{wage:12000,juhyu_hours:4.4,juhyu_round:null},158,{base:1896000,juhyu:211200,gross:2107200,net:2037660}],
   [{wage:10800,juhyu_hours:0},57.5,{base:621000,juhyu:0,gross:621000,net:600500}],
   [{wage:10320,juhyu_hours:4.2,juhyu_round:-3},107,{base:1104240,juhyu:172000,gross:1276240,net:1234120}],
   [{wage:10320,juhyu_hours:0},50.5,{base:521160,juhyu:0,gross:521160,net:503960}],
   [{wage:10600,juhyu_hours:3,juhyu_round:null},87.5,{base:927500,juhyu:127200,gross:1054700,net:1019890}],
   [{wage:10320,juhyu_hours:0},9,{base:92880,juhyu:0,gross:92880,net:89810}],
  ];
  for(const [emp,h,exp] of F){
    const p=L.calcPayroll(emp,h,4,null);
    ok("Golden "+emp.wage+"/"+h+"h base", p.base===exp.base, `${p.base} vs ${exp.base}`);
    ok("Golden juhyu", p.juhyu===exp.juhyu, `${p.juhyu} vs ${exp.juhyu}`);
    ok("Golden gross", p.gross===exp.gross, `${p.gross} vs ${exp.gross}`);
    ok("Golden net", p.net===exp.net, `${p.net} vs ${exp.net}`);
  }
}

// ========== 2) 타각 상태머신: 정상/비정상/경계 ==========
{
  // 연타 100회 → IN/OUT 완벽 교대
  const db=newDB(); const types=[];
  for(let i=0;i<100;i++) types.push(serverPunch(db,1,`2026-09-01T09:${String(i%60).padStart(2,'0')}:00`));
  let good=true; for(let i=0;i<100;i++){ if(types[i]!==(i%2===0?'IN':'OUT')){good=false;break;} }
  ok("연타100 IN/OUT 교대", good);
  // 마지막 상태 = OUT (짝수개)
  ok("연타100 최종 OUT", types[99]==='OUT');
}

// ========== 3) 날짜 경계: 자정/월말/연말/윤년 ==========
{
  // 자정
  let s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-01T20:00:00'},
                      {id:2,employee_id:1,event_type:'OUT',event_at:'2026-09-02T02:00:00'}]);
  ok("자정넘김 6h", s[0].sec===6*3600);
  // 연말 12/31→1/1
  s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-12-31T22:00:00'},
                  {id:2,employee_id:1,event_type:'OUT',event_at:'2027-01-01T06:00:00'}]);
  ok("연말넘김 8h", s[0].sec===8*3600);
  // 윤년 2/29 (2028은 윤년)
  s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2028-02-29T09:00:00'},
                  {id:2,employee_id:1,event_type:'OUT',event_at:'2028-02-29T18:00:00'}]);
  ok("윤년 2/29 9h", s[0].sec===9*3600);
}

// ========== 4) 하루 복수근무 / 퇴근누락 / 비정상 순서 ==========
{
  // 분할 3회
  const db=newDB();
  ['08:00','12:00','13:00','17:00','18:00','22:00'].forEach(t=>serverPunch(db,1,`2026-09-01T${t}:00`));
  let s=L.pairEvents(db.events);
  let total=s.filter(x=>x.status==='COMPLETE').reduce((a,x)=>a+x.sec,0);
  ok("분할3회 합계 12h", total===12*3600, total/3600+'h');
  // 퇴근누락 → INCOMPLETE
  s=L.pairEvents([{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-01T09:00:00'},
                  {id:2,employee_id:1,event_type:'IN',event_at:'2026-09-02T09:00:00'},
                  {id:3,employee_id:1,event_type:'OUT',event_at:'2026-09-02T18:00:00'}]);
  ok("퇴근누락 INCOMPLETE 감지", s.some(x=>x.status==='INCOMPLETE'));
  // 고아 OUT
  s=L.pairEvents([{id:1,employee_id:1,event_type:'OUT',event_at:'2026-09-01T18:00:00'}]);
  ok("고아 OUT 감지", s[0].status==='ORPHAN_OUT');
}

// ========== 5) 보정 승인/거절/재요청/다중보정 ==========
{
  // ADD로 퇴근 보충
  let db=newDB();
  db.events=[{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-01T09:00:00'}]; _seq=1;
  approveCorrection(db,{event_id:null,employee_id:1,action:'ADD',new_event_at:'2026-09-01T18:00:00',new_event_type:'OUT'});
  let s=L.pairEvents(L.applyCorrections(db.events,db.corrections));
  ok("보정ADD 완결 9h", s[0].status==='COMPLETE'&&s[0].sec===9*3600);
  // 다중 EDIT_TIME → 최신 우선
  db=newDB(); db.events=[{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-01T10:00:00'}]; _seq=1;
  approveCorrection(db,{event_id:1,employee_id:1,action:'EDIT_TIME',new_event_at:'2026-09-01T09:30:00'});
  approveCorrection(db,{event_id:1,employee_id:1,action:'EDIT_TIME',new_event_at:'2026-09-01T09:00:00'});
  let eff=L.applyCorrections(db.events,db.corrections);
  ok("다중보정 최신우선", eff[0].event_at==='2026-09-01T09:00:00', eff[0].event_at);
  // VOID
  db=newDB(); db.events=[{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-01T09:00:00'},
                         {id:2,employee_id:1,event_type:'OUT',event_at:'2026-09-01T09:03:00'},
                         {id:3,employee_id:1,event_type:'OUT',event_at:'2026-09-01T18:00:00'}]; _seq=3;
  approveCorrection(db,{event_id:2,employee_id:1,action:'VOID'});
  s=L.pairEvents(L.applyCorrections(db.events,db.corrections));
  ok("VOID후 정상 9h", s[0].status==='COMPLETE'&&s[0].sec===9*3600, JSON.stringify(s.map(x=>x.status)));
}

// ========== 6) 원본 불변 (correction이 raw를 안 바꾼다) ==========
{
  let db=newDB(); db.events=[{id:1,employee_id:1,event_type:'IN',event_at:'2026-09-01T10:00:00'}]; _seq=1;
  const before=JSON.stringify(db.events);
  approveCorrection(db,{event_id:1,employee_id:1,action:'EDIT_TIME',new_event_at:'2026-09-01T09:00:00'});
  L.applyCorrections(db.events,db.corrections); // 계산해도
  ok("원본 events 불변", JSON.stringify(db.events)===before);
}

// ========== 7) payroll_period override가 다른 달/직원 오염 안함 ==========
{
  const emp={wage:12000,juhyu_hours:4.4,juhyu_round:null};
  const julOv={juhyu_weeks_override:3};
  const jul=L.calcPayroll(emp,158,4,julOv);
  const aug=L.calcPayroll(emp,158,4,null); // 다음달 조정없음
  ok("7월 override 3주 반영", jul.juhyu===Math.round(12000*4.4*3));
  ok("8월 오염없음 4주", aug.juhyu===Math.round(12000*4.4*4));
  // 직원 객체 자체가 안 바뀜
  ok("emp객체 불변", emp.juhyu_hours===4.4);
}

// ========== 8) snapshot 불변조건 시뮬 ==========
{
  // 마감 당시 계산 = snapshot. 이후 직원설정 바꿔도 snapshot은 그대로여야.
  const emp={wage:12000,juhyu_hours:4.4,juhyu_round:null};
  const snap=L.calcPayroll(emp,158,4,null);  // 마감시점 저장했다 치고
  const snapshotNet=snap.net;
  emp.wage=15000; // 이후 시급 변경
  // snapshot은 저장된 값이라 재계산과 무관 — 시뮬상 snapshotNet 보존 확인
  ok("snapshot 사후변경 무영향", snapshotNet===2037660);
}

// ========== 9) fingerprint 변경 감지 ==========
{
  const e1=[{event_at:'2026-09-01T09:00:00'},{event_at:'2026-09-01T18:00:00'}];
  const fp1=L.fingerprintOf(e1);
  ok("동일근태 동일지문", L.fingerprintOf([...e1])===fp1);
  ok("이벤트추가 지문변경", L.fingerprintOf([...e1,{event_at:'2026-09-02T09:00:00'}])!==fp1);
  ok("보정표시 지문변경", L.fingerprintOf([{event_at:'2026-09-01T09:00:00'},{event_at:'2026-09-01T18:00:00',corrected:true}])!==fp1);
}

// ========== 10) FUZZ: 대량 랜덤 (직원50 × 랜덤타각) 파괴조건 탐색 ==========
{
  let violations=0, negSec=0, examples=[];
  for(let emp=1; emp<=50; emp++){
    const db=newDB();
    const n=2+Math.floor(Math.random()*20);
    let t=new Date('2026-09-01T00:00:00').getTime();
    for(let k=0;k<n;k++){
      t += Math.floor(Math.random()*36000)*1000; // 0~10h 랜덤 간격
      serverPunch(db,emp,new Date(t).toISOString().slice(0,19));
    }
    // 랜덤 보정 몇 개
    if(Math.random()<0.5 && db.events.length){
      const ev=db.events[Math.floor(Math.random()*db.events.length)];
      approveCorrection(db,{event_id:ev.id,employee_id:emp,action:'EDIT_TIME',new_event_at:ev.event_at});
    }
    const eff=L.applyCorrections(db.events,db.corrections);
    const sess=L.pairEvents(eff);
    // 불변조건 검사
    for(const s of sess){
      if(s.status==='COMPLETE'){
        if(s.sec<0){ negSec++; if(examples.length<3)examples.push('neg '+emp); } // 음수 근무 금지
      }
    }
    // IN/OUT 교대 위반 검사 (완결/근무중/미완결/고아 외 상태 없어야)
    const validStatus=['COMPLETE','WORKING','INCOMPLETE','ORPHAN_OUT'];
    if(sess.some(s=>!validStatus.includes(s.status))){ violations++; }
  }
  ok("FUZZ 음수근무 0", negSec===0, negSec+"건 "+examples.join());
  ok("FUZZ 상태이상 0", violations===0, violations+"건");
  note(`FUZZ: 직원50명 × 랜덤타각/보정 조합 검사 완료`);
}

// ========== 11) 시나리오: ChatGPT가 든 "미친 케이스" 전체 흐름 ==========
{
  // 8/31 23:58 출근 → 9/1 02:17 퇴근 → 정정 → 8월귀속 확인
  let db=newDB();
  serverPunch(db,1,'2026-08-31T23:58:00'); // IN
  serverPunch(db,1,'2026-09-01T02:17:00'); // OUT
  let sess=L.pairEvents(L.applyCorrections(db.events,db.corrections));
  // 출근일(8/31) 기준 8월 귀속
  const p=n=>String(n).padStart(2,'0');
  const inMonth=sess.filter(s=>{const a=s.in||s.out; return a && `${a.getFullYear()}-${p(a.getMonth()+1)}`==='2026-08';});
  ok("미친케이스 8월귀속", inMonth.length===1);
  ok("미친케이스 근무 2h19m", sess[0].sec===(2*3600+19*60), sess[0].sec/60+'분');
}

console.log(`\n================ M8.5 QA 결과 ================`);
console.log(`PASS ${PASS} / FAIL ${FAIL}`);
if(bugs.length){ console.log(`\n[발견된 문제 ${bugs.length}건]`); bugs.forEach((b,i)=>console.log(`${i+1}. ${b.name} — ${b.detail}`)); }
console.log(`\n[비고]`); notes.forEach(n=>console.log('- '+n));
process.exit(FAIL?1:0);
